"""API-level tests: provider metadata is exposed, secrets never are.

Uses httpx's ASGITransport directly (starlette's TestClient is incompatible
with httpx >= 0.28).
"""

from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app
from app.services import rag_service as rag_module
from app.services.llm_client import LLMProviderError


async def _get(path: str):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post(path: str, payload: dict):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


async def test_health_reports_provider_metadata():
    resp = await _get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert body["provider"] in {"mock", "gemini"}
    assert "gemini_configured" in body


async def test_health_never_leaks_api_key():
    resp = await _get("/api/health")
    assert "api_key" not in resp.text.lower()
    if settings.gemini_api_key:
        assert settings.gemini_api_key not in resp.text


async def test_documents_endpoint_works():
    resp = await _get("/api/documents")
    assert resp.status_code == 200
    assert len(resp.json()["documents"]) >= 1


async def test_query_provider_failure_returns_http_error(monkeypatch):
    # A generation failure must not be returned as HTTP 200 (which clients could
    # mistake for a real answer). The category maps to an HTTP status.
    async def _boom(request):
        raise LLMProviderError("rate_limit", "límite alcanzado")

    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(rag_module.rag_service, "query", _boom)

    resp = await _post("/api/query", {"query": "¿Qué es RAG?", "mode": "rag"})

    assert resp.status_code == 429
    assert resp.json()["detail"] == "límite alcanzado"


async def test_query_missing_key_returns_500(monkeypatch):
    async def _boom(request):
        raise LLMProviderError("config", "GEMINI_API_KEY no está configurada.")

    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(rag_module.rag_service, "query", _boom)

    resp = await _post("/api/query", {"query": "¿Qué es RAG?", "mode": "rag"})
    assert resp.status_code == 500


async def test_query_mock_mode_still_returns_200(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "mock")
    resp = await _post("/api/query", {"query": "¿Qué problema busca mitigar RAG?", "mode": "rag"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "mock"
    assert body["answer"]
    # Response now carries reproducible metrics.
    assert body["metrics"]["claims_total"] >= 1
    assert body["latency_ms"] is not None


# ---------------------------------------------------------------------------
# Documents: upload, validation, analysis
# ---------------------------------------------------------------------------
def _temp_corpus(monkeypatch, tmp_path):
    from app.services.document_store import DocumentStore
    from app.api import routes as routes_module

    (tmp_path / "document_01.txt").write_text(
        "RAG enhances LLMs with retrieved context.", encoding="utf-8"
    )
    monkeypatch.setattr(settings, "llm_provider", "mock")
    monkeypatch.setattr(rag_module.rag_service, "store", DocumentStore(tmp_path))
    monkeypatch.setattr(
        routes_module.experiment_runner, "experiments_dir", tmp_path / "experiments"
    )
    return routes_module


async def test_documents_endpoint_returns_records(monkeypatch, tmp_path):
    _temp_corpus(monkeypatch, tmp_path)
    resp = await _get("/api/documents")
    assert resp.status_code == 200
    documents = resp.json()["documents"]
    assert any(d["id"] == "document_01" and d["source"] == "builtin" for d in documents)
    # Metadata-only listing: no full body shipped.
    assert "content" not in documents[0]


async def test_upload_processes_and_rejects(monkeypatch, tmp_path):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    _temp_corpus(monkeypatch, tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/documents/upload",
            files=[
                ("files", ("notes.md", b"# Notas\n\nRAG groundedness evidence.", "text/markdown")),
                ("files", ("bad.exe", b"binary", "application/octet-stream")),
                ("files", ("empty.txt", b"", "text/plain")),
            ],
        )
    assert resp.status_code == 200
    results = {r["name"]: r for r in resp.json()["results"]}
    assert results["notes.md"]["status"] == "processed"
    assert results["bad.exe"]["status"] == "failed"
    assert "Formato no admitido" in results["bad.exe"]["error"]
    assert results["empty.txt"]["status"] == "failed"
    # Failed files are never added to the queryable corpus.
    ids = {d["id"] for d in resp.json()["documents"]}
    assert results["notes.md"]["document_id"] in ids
    assert not any(d["status"] == "failed" for d in resp.json()["documents"])


async def test_document_detail_and_delete(monkeypatch, tmp_path):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    _temp_corpus(monkeypatch, tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        up = await client.post(
            "/api/documents/upload",
            files=[("files", ("a.txt", b"RAG retrieval content", "text/plain"))],
        )
        doc_id = up.json()["results"][0]["document_id"]

        detail = await client.get(f"/api/documents/{doc_id}")
        assert detail.status_code == 200
        assert detail.json()["content"] == "RAG retrieval content"

        analysis = await client.post(
            "/api/documents/analyze",
            json={"document_ids": [doc_id], "include_summary": True},
        )
        assert analysis.status_code == 200
        body = analysis.json()[0]
        assert body["words"] == 3
        assert body["keywords"]
        assert body["summary"] is None
        assert "gemini" in (body["summary_note"] or "").lower()

        deleted = await client.delete(f"/api/documents/{doc_id}")
        assert deleted.status_code == 200
        assert (await client.get(f"/api/documents/{doc_id}")).status_code == 404
        # Built-in documents cannot be deleted.
        assert (await client.delete("/api/documents/document_01")).status_code == 404


# ---------------------------------------------------------------------------
# Experiments
# ---------------------------------------------------------------------------
async def test_experiment_run_list_get_delete(monkeypatch, tmp_path):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    _temp_corpus(monkeypatch, tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        run = await client.post(
            "/api/experiments/run",
            json={"questions": ["¿Qué es RAG?"], "modes": ["llm", "rag", "rag_eval"], "top_k": 3},
        )
        assert run.status_code == 200
        experiment = run.json()
        assert experiment["status_counts"] == {"ok": 3, "error": 0}
        assert len(experiment["cells"]) == 3
        assert experiment["aggregates"]

        listed = await client.get("/api/experiments")
        assert [e["id"] for e in listed.json()] == [experiment["id"]]

        got = await client.get(f"/api/experiments/{experiment['id']}")
        assert got.status_code == 200

        deleted = await client.delete(f"/api/experiments/{experiment['id']}")
        assert deleted.status_code == 200
        assert (await client.get(f"/api/experiments/{experiment['id']}")).status_code == 404


async def test_experiment_comparison_endpoint(monkeypatch, tmp_path):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    _temp_corpus(monkeypatch, tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        run = await client.post(
            "/api/experiments/run",
            json={"questions": ["¿Qué es RAG?"], "modes": ["llm", "rag", "rag_eval"]},
        )
        assert run.status_code == 200
        run_id = run.json()["id"]

        # The literal "comparison" segment must not be parsed as an id.
        comp = await client.get("/api/experiments/comparison")
        assert comp.status_code == 200
        body = comp.json()
        assert [r["id"] for r in body["runs"]] == [run_id]
        assert body["overall"]
        assert body["questions"] == ["¿Qué es RAG?"]

        filtered = await client.get(
            "/api/experiments/comparison",
            params={"ids": run_id, "question": "¿Qué es RAG?"},
        )
        assert filtered.status_code == 200
        assert filtered.json()["question"] == "¿Qué es RAG?"


async def test_demo_experiment_endpoint(monkeypatch, tmp_path):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    _temp_corpus(monkeypatch, tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        demo = await client.post("/api/experiments/demo")
        assert demo.status_code == 200
        body = demo.json()
        assert body["is_demo"] is True
        assert body["cells"]
        assert any("demostración" in n.lower() for n in body["notes"])

        listed = await client.get("/api/experiments")
        assert listed.json()[0]["is_demo"] is True


async def test_deep_analyze_mock_mode_returns_local_key_points(monkeypatch, tmp_path):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    _temp_corpus(monkeypatch, tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        analysis = await client.post(
            "/api/documents/analyze",
            json={"document_ids": ["document_01"], "deep": True},
        )
        assert analysis.status_code == 200
        body = analysis.json()[0]
        assert body["key_points"]
        assert body["claims"] == []
        assert "extractivo" in (body["strategy"] or "").lower()
        assert "gemini" in (body["summary_note"] or "").lower()


async def test_deep_analyze_provider_failure_maps_to_http(monkeypatch, tmp_path):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    _temp_corpus(monkeypatch, tmp_path)

    async def _boom(doc_id, include_summary=True, deep=False):
        raise LLMProviderError("rate_limit", "límite alcanzado")

    monkeypatch.setattr(rag_module.rag_service, "analyze_document", _boom)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/documents/analyze",
            json={"document_ids": ["document_01"], "deep": True},
        )
    assert resp.status_code == 429
    assert resp.json()["detail"] == "límite alcanzado"


# ---------------------------------------------------------------------------
# CORS: the production frontend origin must be allowed so the browser can call
# the backend directly (only needed when NEXT_PUBLIC_API_URL is used; the
# same-origin proxy avoids CORS entirely).
# ---------------------------------------------------------------------------
async def test_cors_preflight_allows_production_frontend_origin():
    origin = "https://rag-hallucination-demo-front.onrender.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.options(
            "/api/health",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
    assert resp.status_code == 200
    allow_origin = resp.headers.get("access-control-allow-origin")
    # Either the exact origin is echoed or the middleware allows any origin.
    assert allow_origin in {origin, "*"}
