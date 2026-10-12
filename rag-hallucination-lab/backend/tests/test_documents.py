"""Tests for the document store: loading, upload, validation, search, delete."""

from __future__ import annotations

import pytest

from app.models.schemas import DocumentStatus
from app.services.document_store import DocumentStore, extract_text


@pytest.fixture()
def store(tmp_path) -> DocumentStore:
    (tmp_path / "document_01.txt").write_text(
        "RAG enhances LLMs with retrieved context.", encoding="utf-8"
    )
    (tmp_path / "document_02.txt").write_text(
        "Retrieval uses embeddings and vector search.", encoding="utf-8"
    )
    return DocumentStore(tmp_path)


def test_loads_builtin_documents(store):
    ids = {r.id for r in store.records()}
    assert {"document_01", "document_02"} <= ids
    assert all(r.status is DocumentStatus.PROCESSED for r in store.records())


def test_upload_valid_text_is_processed_and_queryable(store):
    record = store.add_upload("notes.md", b"# Notas\n\nRAG reduce but does not eliminate hallucinations.")
    assert record.status is DocumentStatus.PROCESSED
    assert record.chars > 0
    hits = store.search("does RAG eliminate hallucinations", top_k=5)
    assert hits and hits[0].id == record.id
    # The fragment must be verbatim text from the document.
    assert hits[0].fragment
    assert hits[0].fragment.split(" …")[0] in store.get_content(record.id)


def test_upload_rejects_unsupported_empty_and_blank(store):
    with pytest.raises(ValueError, match="Formato no admitido"):
        extract_text("malware.exe", b"data")
    with pytest.raises(ValueError, match="vacío"):
        extract_text("empty.txt", b"")
    with pytest.raises(ValueError, match="No se pudo extraer"):
        extract_text("blank.txt", b"   ")


def test_upload_rejects_corrupt_pdf(store):
    with pytest.raises(ValueError):
        extract_text("broken.pdf", b"not a real pdf")


def test_search_restricted_to_document_ids(store):
    notes = store.add_upload("a.txt", b"RAG retrieval groundedness citation")
    other = store.add_upload("b.txt", b"RAG retrieval groundedness citation")
    hits = store.search("retrieval", top_k=10, document_ids=[notes.id])
    assert [h.id for h in hits] == [notes.id]
    assert other.id not in [h.id for h in hits]


def test_delete_only_uploaded(store):
    record = store.add_upload("temp.txt", b"temporary content about retrieval")
    assert store.delete(record.id) is True
    assert store.get_record(record.id) is None
    # Built-in documents are not deletable.
    assert store.delete("document_01") is False


def test_manifest_persists_uploads_across_reload(tmp_path):
    (tmp_path / "document_01.txt").write_text("builtin", encoding="utf-8")
    first = DocumentStore(tmp_path)
    record = first.add_upload("persist.txt", b"persisted content about grounding")
    second = DocumentStore(tmp_path)
    assert second.get_record(record.id) is not None
    assert second.get_content(record.id) == "persisted content about grounding"
    assert second.counts()["uploaded_documents"] == 1
