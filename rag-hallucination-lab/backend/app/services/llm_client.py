"""LLM provider abstraction for the RAG Hallucination Lab.

The project originally shipped a fully offline mock generator. This module adds
a pluggable generation layer so the *same* RAG pipeline (retrieval, context
construction, evaluation) can call Google Gemini without rewriting the service.

Design goals
------------
* Reuse the retrieved documents exactly as the retrieval stage produced them.
* Ground the model on the supplied fragments and forbid invented citations.
* Fail safe: every provider error is converted into a typed, non-secret
  :class:`LLMProviderError`. The failed request returns a clear HTTP error
  (never a fake answer) while the API keeps serving other requests.
* Never leak the API key: it is only read from settings and never logged or
  returned in any response.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

from app.core.config import settings
from app.models.schemas import Claim, ClaimStatus, Document, DocumentClaim, Mode

logger = logging.getLogger(__name__)

# Document citations are expected inside square brackets, e.g. "[document_01]"
# or grouped like "[document_03, document_05]". Brackets are parsed first, then
# every "document...number" token inside is normalized and validated, so an
# *invented* id (e.g. "[document_99]") is captured and removed as well.
BRACKET_RE = re.compile(r"\[([^\]]*)\]")
DOC_TOKEN_RE = re.compile(r"document[_\s-]*0*\d+", re.IGNORECASE)
_DIGITS_RE = re.compile(r"\d+")


def normalize_doc_id(raw: str) -> str:
    """Map any citation spelling (document_1, doc..._01) to canonical form."""
    digits = _DIGITS_RE.search(raw)
    if not digits:
        return raw.strip().lower()
    return f"document_{int(digits.group()):02d}"


def extract_document_ids(text: str) -> List[str]:
    """Return normalized document ids cited in ``text``, in order."""
    ids: List[str] = []
    for bracket in BRACKET_RE.findall(text):
        ids.extend(normalize_doc_id(tok) for tok in DOC_TOKEN_RE.findall(bracket))
    return ids

# Machine-readable verdict the model must append so we can reliably detect when
# the retrieved evidence is insufficient instead of guessing from prose.
EVIDENCE_SUFFICIENT_MARKER = "EVIDENCIA: SUFICIENTE"
EVIDENCE_INSUFFICIENT_MARKER = "EVIDENCIA: INSUFICIENTE"
EVIDENCE_MARKER_RE = re.compile(
    rf"EVIDENCIA:\s*(SUFICIENTE|INSUFICIENTE)", re.IGNORECASE
)

MAX_CLAIMS = 12


class LLMProviderError(Exception):
    """Typed, user-safe failure raised by an LLM provider.

    ``category`` is one of: ``config``, ``auth``, ``rate_limit``,
    ``unavailable``, ``empty``, ``unknown``. ``message`` is safe to surface to
    the user (it never contains the API key or raw provider payloads).
    """

    def __init__(self, category: str, message: str):
        super().__init__(message)
        self.category = category
        self.message = message


@dataclass
class GenerationResult:
    """Outcome of a single generation call, already citation-validated."""

    answer: str
    claims: List[Claim] = field(default_factory=list)
    provider: str = "mock"
    model: str = ""
    evidence_sufficient: bool = True
    invalid_citations: List[str] = field(default_factory=list)
    context_documents: List[str] = field(default_factory=list)


@dataclass
class DeepAnalysis:
    """Result of the chunked deep document analysis.

    ``claims`` only contains assertions whose ``evidence`` quote was found back
    in the document text; everything else is marked ``uncertain`` so a fabricated
    citation is never presented as support.
    """

    summary: Optional[str] = None
    key_points: List[str] = field(default_factory=list)
    claims: List[DocumentClaim] = field(default_factory=list)
    conclusions: Optional[str] = None
    chunks_processed: int = 0


def build_context(documents: Sequence[Document]) -> str:
    """Render retrieved documents as labelled context fragments.

    Each block is prefixed with the document id so the model can cite it and so
    we can validate the citations afterwards. This reuses the exact documents
    the retrieval stage returned; no re-chunking is introduced.
    """
    blocks = []
    for doc in documents:
        content = (doc.content or "").strip()
        blocks.append(
            f"[{doc.id}] (documento: {doc.name}, score: {doc.score:.2f})\n{content}"
        )
    return "\n\n".join(blocks)


def _sanitize_answer(answer: str, valid_ids: set[str]) -> tuple[str, List[str]]:
    """Strip citations that do not point at a retrieved fragment.

    Handles grouped citations such as ``[document_03, document_05]``. Any id
    that is not in the retrieved set is removed before it reaches the user; if
    a group has no valid ids left, the whole bracket is dropped.
    """
    invalid: List[str] = []

    def _replace(match: re.Match[str]) -> str:
        tokens = DOC_TOKEN_RE.findall(match.group(1))
        if not tokens:
            return match.group(0)  # not a document citation (e.g. "[1]", "[sic]")
        kept: List[str] = []
        for token in tokens:
            doc_id = normalize_doc_id(token)
            if doc_id in valid_ids:
                if doc_id not in kept:
                    kept.append(doc_id)
            else:
                invalid.append(token)
        return f"[{', '.join(kept)}]" if kept else ""

    cleaned = BRACKET_RE.sub(_replace, answer)
    # Tidy up leftover double spaces / dangling punctuation from removals.
    cleaned = re.sub(r"\s+([.,;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    # A truncated response (e.g. the model hit max_output_tokens) can end with an
    # incomplete citation such as "[document_0" and no closing bracket. Drop the
    # dangling fragment so a broken reference is never shown to the user.
    cleaned = re.sub(r"\[[^\]\n]*$", "", cleaned).rstrip()
    return cleaned, invalid


def _claims_from_citations(
    answer: str,
    documents: Sequence[Document],
    valid_ids: set[str],
    explicit_insufficient: bool,
    mode: Mode,
) -> List[Claim]:
    """Build verifiable claims from the citations the model actually used."""
    claims: List[Claim] = []
    by_id = {doc.id.lower(): doc for doc in documents}
    seen: set[str] = set()

    for key in extract_document_ids(answer):
        if key not in valid_ids or key in seen:
            continue
        seen.add(key)
        doc = by_id.get(key)
        claims.append(
            Claim(
                text=f"La respuesta se apoya en el fragmento recuperado {key}",
                status=ClaimStatus.SUPPORTED,
                source=key,
                confidence=round(float(doc.score) if doc else 0.0, 4),
                explanation=(
                    f"El modelo citó {key} y el fragmento fue recuperado "
                    f"(score {doc.score:.2f})" if doc else f"Citó {key}"
                ),
            )
        )
        if len(claims) >= MAX_CLAIMS:
            break

    if explicit_insufficient:
        claims.append(
            Claim(
                text="La evidencia recuperada no es suficiente para responder la pregunta",
                status=ClaimStatus.UNCERTAIN,
                source=None,
                confidence=0.0,
                explanation="El modelo indicó explícitamente que el contexto no basta",
            )
        )
    elif mode in (Mode.RAG, Mode.RAG_EVAL) and not claims:
        claims.append(
            Claim(
                text="Respuesta sin referencias verificables a los fragmentos recuperados",
                status=ClaimStatus.UNSUPPORTED,
                source=None,
                confidence=0.0,
                explanation="No se encontró ninguna cita válida en la respuesta generada",
            )
        )
    return claims


VERIFIER_SYSTEM_INSTRUCTION = (
    "Eres un verificador estricto de afirmaciones (juez). Recibirás una RESPUESTA "
    "y un CONJUNTO DE FRAGMENTOS DE CONTEXTO. Divide la respuesta en afirmaciones "
    "atómicas y clasifica CADA UNA comparándola con el contexto. No uses "
    "conocimiento externo. Devuelve EXCLUSIVAMENTE un objeto JSON válido con la "
    'forma {"claims": [{"text": "...", "status": "supported|unsupported|'
    'contradicted|uncertain", "source": "<id de fragmento o null>", '
    '"explanation": "...", "confidence": 0.0}]}. '
    "supported = el contexto implica la afirmación; contradicted = el contexto la "
    "niega; unsupported = el contexto no la respalda ni la niega; uncertain = no "
    "evaluable con el contexto. Usa solo ids de fragmento presentes en el "
    "contexto o null. No inventes fuentes."
)

# ---------------------------------------------------------------------------
# Deep document analysis (chunked map -> synthesize). Used by Paper Analysis.
# ---------------------------------------------------------------------------

ANALYST_SYSTEM_INSTRUCTION = (
    "Eres un analista de documentos riguroso. Recibirás UN FRAGMENTO de un "
    "documento y deberás analizarlo usando EXCLUSIVAMENTE su contenido. No uses "
    "conocimiento externo y no inventes datos, cifras ni fuentes. Devuelve "
    'EXCLUSIVAMENTE un objeto JSON válido con la forma: {"summary": "...", '
    '"key_points": ["..."], "claims": [{"text": "...", "evidence": "cita '
    'textual"}], "conclusions": "..."}. Reglas: "evidence" debe ser una cita '
    "LITERAL copiada del fragmento que respalda la afirmación, o null si no "
    "existe; si no puedes citar el texto, no incluyas la afirmación. Escribe en "
    "el mismo idioma del documento."
)

CHUNK_CHARS = 9000
MAX_KEY_POINTS = 10
MAX_DOC_CLAIMS = 24
# The analyst returns structured JSON (summary + key points + claims); a larger
# ceiling than plain generation keeps the object from being truncated.
ANALYST_MAX_OUTPUT_TOKENS = 8192

_WS_RE = re.compile(r"\s+")


def chunk_text(text: str, max_chars: int = CHUNK_CHARS) -> List[str]:
    """Split text into paragraph-aligned chunks under ``max_chars``.

    Paragraphs are never cut in the middle unless a single paragraph is itself
    larger than the limit, in which case it is sliced on whitespace.
    """
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: List[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(paragraph) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            for start in range(0, len(paragraph), max_chars):
                chunks.append(paragraph[start : start + max_chars])
            continue
        candidate = f"{current}\n\n{paragraph}" if current else paragraph
        if len(candidate) > max_chars:
            chunks.append(current)
            current = paragraph
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def _normalize_ws(value: str) -> str:
    return _WS_RE.sub(" ", (value or "").strip()).casefold()


def quote_present(quote: Optional[str], text: str) -> bool:
    """True when ``quote`` appears verbatim in ``text`` (whitespace-insensitive).

    This is what turns a model-supplied citation into *verified* support: a quote
    that cannot be found back in the document is never trusted.
    """
    if not quote:
        return False
    normalized_quote = _normalize_ws(quote)
    if len(normalized_quote) < 8:
        # Too short to be a meaningful citation.
        return False
    return normalized_quote in _normalize_ws(text)


def nearest_heading(text: str, quote: Optional[str]) -> Optional[str]:
    """Return the closest heading preceding ``quote`` in ``text``, if any."""
    if not quote:
        return None
    index = text.find(quote)
    if index <= 0:
        normalized = _normalize_ws(quote)
        for line in text.splitlines():
            if normalized and normalized in _normalize_ws(line):
                index = text.find(line)
                break
    if index <= 0:
        return None
    heading: Optional[str] = None
    for line in text[:index].splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            heading = stripped.lstrip("#").strip()
        elif len(stripped) <= 80 and stripped.endswith(":") and len(stripped.split()) <= 12:
            heading = stripped.rstrip(":")
    return heading


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _extract_json_object(raw: str) -> Optional[dict]:
    """Best-effort extraction of the first JSON object in a model response."""
    if not raw:
        return None
    fenced = _JSON_FENCE_RE.search(raw)
    candidate = fenced.group(1) if fenced else raw
    candidate = candidate.strip()
    try:
        data = json.loads(candidate)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        data = json.loads(candidate[start : end + 1])
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


_STATUS_MAP = {
    "supported": ClaimStatus.SUPPORTED,
    "unsupported": ClaimStatus.UNSUPPORTED,
    "contradicted": ClaimStatus.CONTRADICTED,
    "uncertain": ClaimStatus.UNCERTAIN,
}


def parse_claims_json(raw_text: str, valid_ids: set[str]) -> List[Claim]:
    """Parse the verifier's JSON verdict into validated :class:`Claim` objects.

    Only ids that were actually retrieved are kept as ``source``; the confidence
    is clamped to ``[0, 1]``; unknown statuses fall back to ``uncertain``.
    """
    data = _extract_json_object(raw_text)
    if not data or not isinstance(data.get("claims"), list):
        return []

    claims: List[Claim] = []
    for item in data["claims"][:MAX_CLAIMS]:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        status = _STATUS_MAP.get(str(item.get("status", "")).strip().lower(), ClaimStatus.UNCERTAIN)
        source = item.get("source")
        if isinstance(source, str) and source.strip():
            candidate = normalize_doc_id(source)
            source = candidate if candidate in valid_ids else None
        else:
            source = None
        try:
            confidence = float(item.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = min(1.0, max(0.0, confidence))
        explanation = item.get("explanation")
        claims.append(
            Claim(
                text=text,
                status=status,
                source=source,
                confidence=round(confidence, 4),
                explanation=str(explanation).strip() if explanation else None,
            )
        )
    return claims


class GeminiLLMClient:
    """Google Gemini generation via the official ``google-genai`` SDK."""

    provider = "gemini"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        client=None,
    ):
        # `client` allows injecting a fake SDK client in tests.
        self.api_key = api_key if api_key is not None else settings.gemini_api_key
        self.model = model or settings.gemini_model
        self._client = client

    # -- Client lifecycle -------------------------------------------------
    def _ensure_client(self):
        if self._client is not None:
            return self._client
        if not self.api_key:
            logger.error(
                "Gemini generation requested but GEMINI_API_KEY is not set "
                "(LLM_PROVIDER=gemini)."
            )
            raise LLMProviderError(
                "config",
                "GEMINI_API_KEY no está configurada. Define la variable de "
                "entorno y reinicia el backend.",
            )
        try:
            from google import genai  # imported lazily so mock mode needs no SDK
        except ImportError:
            logger.error("The 'google-genai' SDK is not installed.")
            raise LLMProviderError(
                "config",
                "El SDK oficial 'google-genai' no está instalado. "
                "Ejecuta 'pip install -r requirements.txt'.",
            )
        self._client = genai.Client(api_key=self.api_key)
        return self._client

    # -- Prompting --------------------------------------------------------
    @staticmethod
    def _system_instruction(mode: Mode) -> str:
        if mode == Mode.LLM:
            return (
                "Eres un asistente que responde SIN contexto externo, usando "
                "únicamente tu conocimiento paramétrico. Responde en el idioma "
                "de la pregunta. No inventes citas ni referencias a documentos. "
                f"Termina siempre con una línea exacta: '{EVIDENCE_SUFFICIENT_MARKER}'."
            )
        return (
            "Eres un asistente de RAG estrictamente fundamentado. Responde en el "
            "idioma de la pregunta usando EXCLUSIVAMENTE los fragmentos de "
            "contexto proporcionados. Reglas obligatorias:\n"
            "1. Cita cada afirmación factual con el id del fragmento entre "
            "corchetes, p.ej. [document_01].\n"
            "2. Nunca cites un id que no aparezca en el contexto y nunca "
            "inventes fuentes, URLs o referencias.\n"
            "3. Si el contexto no contiene la información necesaria, dilo "
            "explícitamente y no respondas con conocimiento previo.\n"
            f"4. Termina siempre con una línea exacta: '{EVIDENCE_SUFFICIENT_MARKER}' "
            f"o '{EVIDENCE_INSUFFICIENT_MARKER}' según corresponda."
        )

    @staticmethod
    def _contents(query: str, mode: Mode, documents: Sequence[Document]) -> str:
        if mode == Mode.LLM or not documents:
            return f"Pregunta: {query}"
        return (
            f"Pregunta: {query}\n\n"
            "Fragmentos de contexto recuperados (única fuente permitida):\n"
            f"{build_context(documents)}"
        )

    # -- Fallback chain ---------------------------------------------------
    def _model_chain(self) -> List[str]:
        """Return [primary, *fallbacks] — deduplicated, never empty."""
        chain = [self.model]
        for fallback in settings.gemini_fallback_models:
            if fallback not in chain:
                chain.append(fallback)
        return chain

    async def _generate_with_fallback(
        self,
        contents: str,
        config,
        mode: Mode,
        documents: Sequence[Document],
        operation: str = "generate",
    ) -> tuple:
        """Try the primary model, then each fallback on 'unavailable' errors.

        Returns (response, model_used). Raises the last LLMProviderError if all
        models fail. Logs each attempt without leaking API keys or payloads.
        """
        client = self._ensure_client()
        last_error: Optional[LLMProviderError] = None

        for model in self._model_chain():
            logger.info(
                "Calling Gemini API | model=%s operation=%s context_fragments=%d",
                model,
                operation,
                len(documents),
            )
            try:
                response = await client.aio.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
                raw_text = (getattr(response, "text", None) or "").strip()
                if not raw_text:
                    raise LLMProviderError(
                        "empty",
                        "El proveedor devolvió una respuesta vacía. Intenta de nuevo.",
                    )
                logger.info(
                    "Gemini API responded | model=%s chars=%d",
                    model,
                    len(raw_text),
                )
                return response, model
            except LLMProviderError:
                raise  # non-retryable (auth, config, empty) — propagate immediately
            except Exception as exc:  # noqa: BLE001 - normalized below
                error = self._classify_error(exc)
                logger.warning(
                    "Gemini API call failed | model=%s category=%s operation=%s — trying next model",
                    model,
                    error.category,
                    operation,
                )
                last_error = error
                if error.category != "unavailable":
                    raise error from exc

        # All models exhausted.
        logger.error(
            "All Gemini models failed | operation=%s models_tried=%s",
            operation,
            ", ".join(self._model_chain()),
        )
        raise last_error  # type: ignore[misc] — always set when loop completes

    # -- Generation -------------------------------------------------------
    async def generate(
        self,
        query: str,
        mode: Mode,
        documents: Sequence[Document],
    ) -> GenerationResult:
        try:
            from google.genai import types
        except ImportError:
            raise LLMProviderError(
                "config", "El SDK oficial 'google-genai' no está instalado."
            )

        config = types.GenerateContentConfig(
            system_instruction=self._system_instruction(mode),
            temperature=settings.gemini_temperature,
            max_output_tokens=settings.gemini_max_output_tokens,
        )

        response, model_used = await self._generate_with_fallback(
            contents=self._contents(query, mode, documents),
            config=config,
            mode=mode,
            documents=documents,
            operation="generate",
        )

        raw_text = (getattr(response, "text", None) or "").strip()
        result = self._parse(raw_text, mode, documents)
        # Reflect the actual model that answered (may differ from self.model).
        result.model = model_used
        return result

    # -- Verification (claim-level judge) --------------------------------
    async def verify_claims(
        self,
        answer: str,
        documents: Sequence[Document],
    ) -> List[Claim]:
        """Split ``answer`` into atomic claims and verify each against the context.

        This is the extra stage that distinguishes condition C from B. It is an
        *LLM-as-judge*: independent from the generator prompt, but still an
        imperfect evaluator (documented limitation). A provider failure is
        propagated so a verification that never ran is not mistaken for a clean
        verdict.
        """
        try:
            from google.genai import types
        except ImportError:
            raise LLMProviderError(
                "config", "El SDK oficial 'google-genai' no está instalado."
            )

        config = types.GenerateContentConfig(
            system_instruction=VERIFIER_SYSTEM_INSTRUCTION,
            temperature=0.0,
            max_output_tokens=settings.gemini_max_output_tokens,
        )
        contents = (
            "RESPUESTA A VERIFICAR:\n"
            f"{answer}\n\n"
            "FRAGMENTOS DE CONTEXTO (única fuente permitida):\n"
            f"{build_context(documents)}"
        )
        response, model_used = await self._generate_with_fallback(
            contents=contents,
            config=config,
            mode=Mode.RAG_EVAL,
            documents=documents,
            operation="verify_claims",
        )

        raw_text = (getattr(response, "text", None) or "").strip()
        valid_ids = {doc.id.lower() for doc in documents}
        claims = parse_claims_json(raw_text, valid_ids)
        logger.info("Gemini verifier classified %d claims (model=%s)", len(claims), model_used)
        if not claims:
            raise LLMProviderError(
                "empty",
                "El verificador no devolvió afirmaciones evaluables. Intenta de nuevo.",
            )
        return claims

    # -- Document analysis -----------------------------------------------
    async def summarize(self, text: str, name: str) -> str:
        """Return an LLM-generated synopsis of a stored document.

        This is explicitly an LLM summary, not a measurement; the caller labels
        it as such in the API response.
        """
        try:
            from google.genai import types
        except ImportError:
            raise LLMProviderError(
                "config", "El SDK oficial 'google-genai' no está instalado."
            )
        config = types.GenerateContentConfig(
            temperature=0.0,
            max_output_tokens=settings.gemini_max_output_tokens,
        )
        response, model_used = await self._generate_with_fallback(
            contents=(
                "Resume en 2 o 3 frases, en el idioma del documento, de qué "
                f"trata el siguiente documento ({name}). Responde solo con el "
                f"resumen.\n\n{text}"
            ),
            config=config,
            mode=Mode.LLM,
            documents=[],
            operation="summarize",
        )
        raw_text = (getattr(response, "text", None) or "").strip()
        if not raw_text:
            raise LLMProviderError("empty", "El resumen devuelto está vacío.")
        return raw_text

    async def analyze(self, text: str, name: str) -> DeepAnalysis:
        """Deep, evidence-grounded analysis of a stored document.

        The document is split into chunks; each chunk is analysed independently
        (map) and the partial results are synthesised when there is more than one
        chunk. Every extracted claim carries a *verbatim* quote that is checked
        back against the stored text: only claims whose quote is actually present
        are marked ``supported``/``verified``; the rest stay ``uncertain``. No
        citation is ever invented on the caller's behalf.
        """
        try:
            from google.genai import types
        except ImportError:
            raise LLMProviderError(
                "config", "El SDK oficial 'google-genai' no está instalado."
            )

        chunks = chunk_text(text)
        if not chunks:
            raise LLMProviderError(
                "empty", "El documento no contiene texto analizable."
            )

        summaries: List[str] = []
        key_points: List[str] = []
        conclusions: List[str] = []
        raw_claims: List[dict] = []
        model_used = self.model

        for index, chunk in enumerate(chunks):
            payload = await self._analyze_chunk_with_fallback(
                chunk, name, index, len(chunks)
            )
            if payload is None:
                continue
            if isinstance(payload, tuple):
                payload, model_used = payload
            if not payload:
                continue
            summary = str(payload.get("summary") or "").strip()
            if summary:
                summaries.append(summary)
            points = payload.get("key_points")
            if isinstance(points, list):
                key_points.extend(
                    str(p).strip() for p in points if str(p).strip()
                )
            conclusion = str(payload.get("conclusions") or "").strip()
            if conclusion:
                conclusions.append(conclusion)
            claims = payload.get("claims")
            if isinstance(claims, list):
                raw_claims.extend(item for item in claims if isinstance(item, dict))

        if not (summaries or key_points or raw_claims or conclusions):
            raise LLMProviderError(
                "empty",
                "El analista no devolvió resultados evaluables. Intenta de nuevo.",
            )

        summary_text = " ".join(summaries).strip() or None
        conclusions_text = " ".join(conclusions).strip() or None

        if len(chunks) > 1:
            synthesis = await self._synthesize_with_fallback(
                name, summaries, key_points, conclusions
            )
            if synthesis:
                if synthesis.get("summary"):
                    summary_text = str(synthesis["summary"]).strip()
                if isinstance(synthesis.get("key_points"), list) and synthesis["key_points"]:
                    key_points = [
                        str(p).strip() for p in synthesis["key_points"] if str(p).strip()
                    ]
                if synthesis.get("conclusions"):
                    conclusions_text = str(synthesis["conclusions"]).strip()

        # Deduplicate key points and cap them.
        seen: set[str] = set()
        unique_points: List[str] = []
        for point in key_points:
            key = point.casefold()
            if key in seen:
                continue
            seen.add(key)
            unique_points.append(point)
            if len(unique_points) >= MAX_KEY_POINTS:
                break

        verified_claims = self._verify_claim_quotes(raw_claims, text)
        logger.info(
            "Gemini deep analysis | model=%s chunks=%d key_points=%d claims=%d "
            "(verified=%d)",
            model_used,
            len(chunks),
            len(unique_points),
            len(verified_claims),
            sum(1 for c in verified_claims if c.verified),
        )
        return DeepAnalysis(
            summary=summary_text,
            key_points=unique_points,
            claims=verified_claims,
            conclusions=conclusions_text,
            chunks_processed=len(chunks),
        )

    async def _analyze_chunk_with_fallback(
        self, chunk: str, name: str, index: int, total: int
    ) -> Optional[tuple[dict, str]] | dict:
        """Analyse one chunk, trying fallback models on 'unavailable' errors.

        Returns (payload, model_used) on success, or None if all models fail
        with non-retryable errors.
        """
        try:
            from google.genai import types
        except ImportError:
            raise LLMProviderError(
                "config", "El SDK oficial 'google-genai' no está instalado."
            )

        config = types.GenerateContentConfig(
            system_instruction=ANALYST_SYSTEM_INSTRUCTION,
            temperature=0.0,
            max_output_tokens=ANALYST_MAX_OUTPUT_TOKENS,
        )
        contents = (
            f"Documento: {name}\nFragmento {index + 1} de {total}:\n\n{chunk}"
        )
        response, model_used = await self._generate_with_fallback(
            contents=contents,
            config=config,
            mode=Mode.LLM,
            documents=[],
            operation=f"analyze_chunk_{index + 1}_of_{total}",
        )
        raw_text = (getattr(response, "text", None) or "").strip()
        payload = _extract_json_object(raw_text)
        return payload, model_used

    async def _analyze_chunk(
        self, client, types, chunk: str, name: str, index: int, total: int
    ) -> Optional[dict]:
        """Analyse one chunk and return the parsed JSON object (or None)."""
        config = types.GenerateContentConfig(
            system_instruction=ANALYST_SYSTEM_INSTRUCTION,
            temperature=0.0,
            max_output_tokens=ANALYST_MAX_OUTPUT_TOKENS,
        )
        contents = (
            f"Documento: {name}\nFragmento {index + 1} de {total}:\n\n{chunk}"
        )
        logger.info(
            "Calling Gemini analyst | model=%s chunk=%d/%d", self.model, index + 1, total
        )
        try:
            response = await client.aio.models.generate_content(
                model=self.model, contents=contents, config=config
            )
        except Exception as exc:  # noqa: BLE001 - normalized below
            error = self._classify_error(exc)
            logger.error(
                "Gemini analyst call failed | model=%s chunk=%d category=%s",
                self.model,
                index + 1,
                error.category,
            )
            raise error from exc
        raw_text = (getattr(response, "text", None) or "").strip()
        return _extract_json_object(raw_text)

    async def _synthesize_with_fallback(
        self,
        name: str,
        summaries: Sequence[str],
        key_points: Sequence[str],
        conclusions: Sequence[str],
    ) -> Optional[dict]:
        """Merge per-chunk findings, trying fallback models on 'unavailable' errors."""
        try:
            from google.genai import types
        except ImportError:
            raise LLMProviderError(
                "config", "El SDK oficial 'google-genai' no está instalado."
            )

        contents = (
            f"Documento: {name}\n\n"
            "Resúmenes parciales por fragmento:\n"
            + "\n".join(f"- {s}" for s in summaries)
            + "\n\nIdeas clave parciales:\n"
            + "\n".join(f"- {p}" for p in key_points)
            + "\n\nConclusiones parciales:\n"
            + "\n".join(f"- {c}" for c in conclusions)
            + "\n\nEmite un resultado unificado."
        )
        config = types.GenerateContentConfig(
            system_instruction=ANALYST_SYSTEM_INSTRUCTION,
            temperature=0.0,
            max_output_tokens=ANALYST_MAX_OUTPUT_TOKENS,
        )
        try:
            response, _ = await self._generate_with_fallback(
                contents=contents,
                config=config,
                mode=Mode.LLM,
                documents=[],
                operation="synthesize",
            )
        except LLMProviderError:
            return None
        raw_text = (getattr(response, "text", None) or "").strip()
        return _extract_json_object(raw_text)

    async def _synthesize(
        self,
        client,
        types,
        name: str,
        summaries: Sequence[str],
        key_points: Sequence[str],
        conclusions: Sequence[str],
    ) -> Optional[dict]:
        """Merge per-chunk findings into one coherent result."""
        contents = (
            f"Documento: {name}\n\n"
            "Resúmenes parciales por fragmento:\n"
            + "\n".join(f"- {s}" for s in summaries)
            + "\n\nIdeas clave parciales:\n"
            + "\n".join(f"- {p}" for p in key_points)
            + "\n\nConclusiones parciales:\n"
            + "\n".join(f"- {c}" for c in conclusions)
            + "\n\nEmite un resultado unificado."
        )
        config = types.GenerateContentConfig(
            system_instruction=ANALYST_SYSTEM_INSTRUCTION,
            temperature=0.0,
            max_output_tokens=ANALYST_MAX_OUTPUT_TOKENS,
        )
        logger.info("Calling Gemini analyst synthesis | model=%s", self.model)
        try:
            response = await client.aio.models.generate_content(
                model=self.model, contents=contents, config=config
            )
        except Exception as exc:  # noqa: BLE001 - best-effort synthesis
            error = self._classify_error(exc)
            logger.warning(
                "Gemini analysis synthesis failed | model=%s category=%s",
                self.model,
                error.category,
            )
            return None
        raw_text = (getattr(response, "text", None) or "").strip()
        return _extract_json_object(raw_text)

    def _verify_claim_quotes(
        self, raw_claims: Sequence[dict], text: str
    ) -> List[DocumentClaim]:
        """Turn model-supplied claims into quote-verified :class:`DocumentClaim`s."""
        claims: List[DocumentClaim] = []
        for item in list(raw_claims)[:MAX_DOC_CLAIMS]:
            claim_text = str(item.get("text") or "").strip()
            if not claim_text:
                continue
            evidence = item.get("evidence")
            evidence = str(evidence).strip() if evidence is not None else ""
            evidence = evidence or None
            verified = quote_present(evidence, text)
            claims.append(
                DocumentClaim(
                    text=claim_text,
                    status="supported" if verified else "uncertain",
                    evidence=evidence,
                    location=nearest_heading(text, evidence) if verified else None,
                    verified=verified,
                )
            )
        return claims

    # -- Parsing / validation --------------------------------------------
    def _parse(
        self,
        raw_text: str,
        mode: Mode,
        documents: Sequence[Document],
    ) -> GenerationResult:
        valid_ids = {doc.id.lower() for doc in documents}

        explicit_insufficient = False
        marker = EVIDENCE_MARKER_RE.search(raw_text)
        if marker:
            explicit_insufficient = marker.group(1).upper() == "INSUFICIENTE"
            raw_text = EVIDENCE_MARKER_RE.sub("", raw_text).strip()

        # Sanitize first: invalid (invented) citations are removed so that the
        # only citations left are the ones we can actually point at.
        answer, invalid = _sanitize_answer(raw_text, valid_ids)
        valid_citations = extract_document_ids(answer)

        if explicit_insufficient:
            evidence_sufficient = False
        elif mode in (Mode.RAG, Mode.RAG_EVAL):
            # Grounded modes need at least one valid citation to claim support.
            evidence_sufficient = bool(valid_citations)
        else:
            # LLM-only mode performs no retrieval; nothing to be insufficient.
            evidence_sufficient = True

        claims = _claims_from_citations(
            answer, documents, valid_ids, explicit_insufficient, mode
        )

        return GenerationResult(
            answer=answer,
            claims=claims,
            provider=self.provider,
            model=self.model,
            evidence_sufficient=evidence_sufficient,
            invalid_citations=invalid,
            context_documents=[doc.id for doc in documents],
        )

    def _classify_error(self, exc: Exception) -> LLMProviderError:
        """Map an SDK exception to a safe, typed provider error."""
        code = getattr(exc, "code", None)
        text = str(exc).lower()

        if code in (401, 403) or "api key" in text or "permission" in text or "unauthenticated" in text:
            return LLMProviderError(
                "auth",
                "Autenticación con Gemini rechazada. Revisa que GEMINI_API_KEY "
                "sea válida y esté habilitada para la API.",
            )
        if code == 429 or "quota" in text or "rate limit" in text or "resource_exhausted" in text:
            return LLMProviderError(
                "rate_limit",
                "Se alcanzó el límite de solicitudes de Gemini. Espera un "
                "momento e inténtalo de nuevo.",
            )
        if code == 404 or "not found" in text or "unsupported" in text:
            return LLMProviderError(
                "unavailable",
                f"El modelo '{self.model}' no está disponible para esta API key. "
                "Configura GEMINI_MODEL con un modelo habilitado en tu proyecto.",
            )
        if code in (500, 502, 503, 504) or "unavailable" in text or "timeout" in text:
            return LLMProviderError(
                "unavailable",
                "El proveedor Gemini no está disponible temporalmente. "
                "Intenta de nuevo más tarde.",
            )
        # Never include the raw payload or exception text: it can echo request
        # metadata. Log only the exception *type*, never the API key.
        logger.warning("Unclassified Gemini provider error: %s", type(exc).__name__)
        return LLMProviderError(
            "unknown",
            "Error inesperado al contactar Gemini. La aplicación sigue "
            "operativa; intenta de nuevo.",
        )
