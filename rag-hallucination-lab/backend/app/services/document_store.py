"""Corpus management: built-in documents plus user uploads.

The lab originally shipped a fixed corpus of ``data/document_0*.txt`` files and
no way to add documents. This module keeps that corpus as the default while
adding a real, persistent document store so a user can upload their own files,
see their processing status, and query/compare them.

Design constraints
------------------
* Retrieval semantics are preserved: scoring is the same Jaccard + keyword-boost
  heuristic the demo already used, applied at document granularity. We only add
  a best-matching *fragment* per retrieved document so the UI can show evidence.
* Uploads are validated (empty, unsupported type, unreadable) and a file is only
  marked ``processed`` when its text is actually stored and queryable.
* No secret is ever read here.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from app.core.config import settings
from app.models.schemas import (
    Document,
    DocumentDetail,
    DocumentRecord,
    DocumentSource,
    DocumentStatus,
)

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown", ".pdf"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MiB per file
FRAGMENT_CHARS = 600

# Same boost weights the original mock retriever used, kept identical so the
# ranking behavior does not change when documents are uploaded.
_BOOST_KEYWORDS = {
    "rag": 0.15, "retrieval": 0.1, "embedding": 0.1, "groundedness": 0.1,
    "hallucination": 0.15, "citation": 0.1, "faithfulness": 0.1,
    "limitation": 0.1, "eliminate": 0.1, "reduce": 0.1,
}


def resolve_data_dir() -> Path:
    """Locate the knowledge-base directory regardless of the working directory.

    The configured DATA_DIR wins (Docker sets it to /app/data). When it does not
    look like a corpus, fall back to the current working directory and finally to
    the repository ``data`` folder relative to this file.
    """
    configured = Path(settings.data_dir).expanduser()
    candidates = [
        configured,
        Path.cwd() / "data",
        Path(__file__).resolve().parents[3] / "data",
    ]

    def has_demo_data(path: Path) -> bool:
        return path.is_dir() and (
            (path / "demo_cases.json").is_file()
            or any(path.glob("document_*.txt"))
        )

    for candidate in candidates:
        if has_demo_data(candidate):
            return candidate
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    return configured


def score_text(query: str, content: str) -> float:
    """Deterministic relevance score (unchanged from the demo retriever)."""
    query_words = set(query.lower().split())
    content_words = set(content.lower().split())
    if not query_words or not content_words:
        return 0.0
    intersection = query_words.intersection(content_words)
    union = query_words.union(content_words)
    jaccard = len(intersection) / len(union) if union else 0.0
    boost = sum(_BOOST_KEYWORDS.get(w, 0) for w in query_words if w in content_words)
    return min(0.95, jaccard * 0.7 + boost + 0.1)


def best_fragment(query: str, content: str) -> str:
    """Return the passage of ``content`` that best matches ``query``.

    Paragraphs are preferred; a single-paragraph document falls back to
    sentence-level splitting. The returned text always exists verbatim in the
    source document (only truncated on a boundary), so evidence can be
    inspected and contrasted with the generated claims.
    """
    text = (content or "").strip()
    if not text:
        return ""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(paragraphs) < 2:
        paragraphs = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    if not paragraphs:
        return text[:FRAGMENT_CHARS]
    best = max(paragraphs, key=lambda p: score_text(query, p))
    if len(best) <= FRAGMENT_CHARS:
        return best
    return best[:FRAGMENT_CHARS].rsplit(" ", 1)[0] + " …"


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - dependency guarded
        raise ValueError(
            "La extracción de PDF requiere la librería 'pypdf'."
        ) from exc
    import io

    reader = PdfReader(io.BytesIO(data))
    pages = [(page.extract_text() or "") for page in reader.pages]
    return "\n\n".join(pages).strip()


def extract_text(name: str, data: bytes) -> str:
    """Extract plain text from a supported file, raising ``ValueError`` on failure.

    Validation happens here so both the API and the store agree on what counts
    as processable: unsupported type, empty body, and extraction failures are all
    rejected before anything is marked as processed.
    """
    suffix = Path(name).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Formato no admitido '{suffix or name}'. "
            f"Formatos válidos: {', '.join(sorted(SUPPORTED_EXTENSIONS))}."
        )
    if not data:
        raise ValueError("El archivo está vacío.")
    if suffix == ".pdf":
        try:
            text = _extract_pdf(data)
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(
                "No se pudo leer el PDF (archivo dañado o protegido)."
            ) from exc
    else:
        text = data.decode("utf-8", errors="replace")
    text = (text or "").strip()
    if not text:
        raise ValueError(
            "No se pudo extraer texto del archivo (posible documento vacío o "
            "escaneado sin capa de texto)."
        )
    return text


class DocumentStore:
    """Persistent corpus = built-in documents + uploaded documents."""

    def __init__(self, data_dir: Optional[Path] = None):
        self.data_dir = Path(data_dir) if data_dir else resolve_data_dir()
        self.uploads_dir = self.data_dir / "uploads"
        self.manifest_path = self.uploads_dir / "manifest.json"
        self.builtin: List[DocumentRecord] = self._load_builtin()
        self._uploaded: Dict[str, DocumentRecord] = {}
        self._uploaded_text: Dict[str, str] = {}
        self._load_manifest()

    # -- Loading ----------------------------------------------------------
    def _load_builtin(self) -> List[DocumentRecord]:
        records: List[DocumentRecord] = []
        for file_path in sorted(self.data_dir.glob("document_*.txt")):
            try:
                content = file_path.read_text(encoding="utf-8")
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Could not read %s: %s", file_path, exc)
                continue
            records.append(
                DocumentRecord(
                    id=file_path.stem,
                    name=file_path.name,
                    source=DocumentSource.BUILTIN,
                    status=DocumentStatus.PROCESSED,
                    chars=len(content),
                    words=len(content.split()),
                    size_bytes=len(content.encode("utf-8")),
                )
            )
        return records

    def _load_manifest(self) -> None:
        if not self.manifest_path.is_file():
            return
        try:
            import json

            raw = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Could not read uploads manifest: %s", exc)
            return
        for item in raw.get("documents", []):
            try:
                record = DocumentRecord(**item)
            except Exception:  # pragma: no cover - tolerate stale entries
                continue
            if record.status is DocumentStatus.PROCESSED:
                text_path = self.uploads_dir / f"{record.id}.txt"
                if not text_path.is_file():
                    # Text vanished but the manifest survived: mark it failed so
                    # it never appears as queryable when it is not.
                    record = record.model_copy(
                        update={
                            "status": DocumentStatus.FAILED,
                            "error": "El texto almacenado ya no está disponible.",
                        }
                    )
                else:
                    self._uploaded_text[record.id] = text_path.read_text(
                        encoding="utf-8"
                    )
            self._uploaded[record.id] = record

    def _persist_manifest(self) -> None:
        import json

        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "documents": [r.model_dump(mode="json") for r in self._uploaded.values()]
        }
        self.manifest_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def _new_id(self, name: str) -> str:
        stem = re.sub(r"[^a-z0-9]+", "_", Path(name).stem.lower()).strip("_")[:32]
        digest = hashlib.sha1(f"{name}:{datetime.now(timezone.utc).isoformat()}".encode()).hexdigest()[:8]
        base = f"upload_{stem or 'doc'}_{digest}"
        candidate = base
        n = 1
        while candidate in self._uploaded or candidate in {r.id for r in self.builtin}:
            n += 1
            candidate = f"{base}_{n}"
        return candidate

    # -- Queries / accessors ---------------------------------------------
    def records(self) -> List[DocumentRecord]:
        return [*self.builtin, *self._uploaded.values()]

    def uploaded_records(self) -> List[DocumentRecord]:
        return list(self._uploaded.values())

    def counts(self) -> Dict[str, int]:
        processed = [r for r in self.records() if r.status is DocumentStatus.PROCESSED]
        return {
            "documents": len(processed),
            "uploaded_documents": sum(
                1
                for r in self._uploaded.values()
                if r.status is DocumentStatus.PROCESSED
            ),
        }

    def get_record(self, doc_id: str) -> Optional[DocumentRecord]:
        if doc_id in self._uploaded:
            return self._uploaded[doc_id]
        for record in self.builtin:
            if record.id == doc_id:
                return record
        return None

    def get_content(self, doc_id: str) -> Optional[str]:
        if doc_id in self._uploaded_text:
            return self._uploaded_text[doc_id]
        for record in self.builtin:
            if record.id == doc_id:
                path = self.data_dir / record.name
                if path.is_file():
                    return path.read_text(encoding="utf-8")
        return None

    def get_detail(self, doc_id: str) -> Optional[DocumentDetail]:
        record = self.get_record(doc_id)
        if record is None:
            return None
        return DocumentDetail(**record.model_dump(), content=self.get_content(doc_id) or "")

    def _as_document(self, record: DocumentRecord, content: str, score: float, query: str) -> Document:
        return Document(
            id=record.id,
            name=record.name,
            content=content,
            score=round(float(score), 4),
            metadata={
                "source": record.source.value,
                "name": record.name,
                "chars": record.chars,
            },
            fragment=best_fragment(query, content) if query else None,
        )

    # -- Retrieval --------------------------------------------------------
    def search(
        self,
        query: str,
        top_k: int = 5,
        document_ids: Optional[Sequence[str]] = None,
    ) -> List[Document]:
        """Rank the corpus for ``query`` and attach the best evidence fragment.

        When ``document_ids`` is provided, only those documents are considered
        (and only if they are actually processed/available).
        """
        allowed: Optional[set] = set(document_ids) if document_ids else None
        scored: List[Document] = []
        for record in self.records():
            if record.status is not DocumentStatus.PROCESSED:
                continue
            if allowed is not None and record.id not in allowed:
                continue
            content = self.get_content(record.id)
            if not content:
                continue
            scored.append(self._as_document(record, content, score_text(query, content), query))
        scored.sort(key=lambda d: d.score, reverse=True)
        return scored[: max(1, top_k)]

    # -- Mutations --------------------------------------------------------
    def add_upload(self, name: str, data: bytes) -> DocumentRecord:
        """Validate, extract and store one uploaded file.

        Raises ``ValueError`` (with a user-safe message) when the file cannot be
        processed; the caller turns that into a per-file ``failed`` result. A
        failed file is never added to the queryable corpus.
        """
        if len(data) > MAX_UPLOAD_BYTES:
            raise ValueError(
                f"El archivo supera el límite de {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
            )
        text = extract_text(name, data)
        doc_id = self._new_id(name)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        (self.uploads_dir / f"{doc_id}.txt").write_text(text, encoding="utf-8")
        record = DocumentRecord(
            id=doc_id,
            name=name,
            source=DocumentSource.UPLOADED,
            status=DocumentStatus.PROCESSED,
            chars=len(text),
            words=len(text.split()),
            size_bytes=len(data),
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )
        self._uploaded[doc_id] = record
        self._uploaded_text[doc_id] = text
        self._persist_manifest()
        logger.info("Stored upload | id=%s name=%s chars=%d", doc_id, name, len(text))
        return record

    def delete(self, doc_id: str) -> bool:
        """Delete an uploaded document. Built-in documents cannot be deleted."""
        if doc_id not in self._uploaded:
            return False
        self._uploaded.pop(doc_id, None)
        self._uploaded_text.pop(doc_id, None)
        text_path = self.uploads_dir / f"{doc_id}.txt"
        if text_path.is_file():
            try:
                text_path.unlink()
            except OSError as exc:  # pragma: no cover - defensive
                logger.warning("Could not delete %s: %s", text_path, exc)
        self._persist_manifest()
        logger.info("Deleted upload | id=%s", doc_id)
        return True
