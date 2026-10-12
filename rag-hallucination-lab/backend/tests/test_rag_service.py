"""Integration tests for the RAG service with the pluggable provider.

The Gemini SDK is stubbed, so these run offline. They verify that:

* the default mock provider keeps its original behavior,
* the gemini provider reuses the real retrieval stage,
* the without-RAG (llm) condition does not retrieve,
* provider failures raise a typed error instead of returning a fake answer.
"""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.models.schemas import Claim, ClaimStatus, Mode, PipelineStage, QueryRequest
from app.services.llm_client import GenerationResult, GeminiLLMClient, LLMProviderError
from app.services.rag_service import MockRAGService


class _StubGemini:
    provider = "gemini"

    def __init__(self, result: GenerationResult | None = None, error: Exception | None = None, verified: list | None = None):
        self.result = result
        self.error = error
        self.verified = verified or []
        self.calls: list[tuple[str, Mode, list]] = []
        self.verify_calls = 0

    async def generate(self, query, mode, documents):
        self.calls.append((query, mode, list(documents)))
        if self.error is not None:
            raise self.error
        return self.result

    async def verify_claims(self, answer, documents):
        self.verify_calls += 1
        return list(self.verified)


def _service_with_gemini(monkeypatch, stub) -> MockRAGService:
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    service = MockRAGService()
    service._gemini_client = stub
    return service


async def test_mock_provider_behavior_unchanged(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "mock")
    service = MockRAGService()
    response = await service.query(
        QueryRequest(query="¿Qué problema busca mitigar RAG?", mode=Mode.RAG)
    )
    assert response.provider == "mock"
    assert response.answer.startswith("RAG busca mitigar")
    assert response.documents


async def test_gemini_rag_reuses_retrieval_and_grounds(monkeypatch):
    doc_id = "document_01"
    stub = _StubGemini(
        result=GenerationResult(
            answer=f"RAG recupera contexto externo [{doc_id}].",
            claims=[
                Claim(
                    text="RAG recupera contexto externo",
                    status=ClaimStatus.SUPPORTED,
                    source=doc_id,
                    confidence=0.9,
                )
            ],
            provider="gemini",
            model="gemini-flash-latest",
            evidence_sufficient=True,
            context_documents=[doc_id],
        )
    )
    service = _service_with_gemini(monkeypatch, stub)

    response = await service.query(
        QueryRequest(query="¿Qué es RAG y para qué sirve?", mode=Mode.RAG)
    )

    # Retrieval actually ran and produced fragments for the model.
    assert response.documents
    called_query, called_mode, called_docs = stub.calls[0]
    assert called_mode is Mode.RAG
    assert called_docs  # fragments were handed to Gemini
    # Grounded generation metadata + metrics.
    assert response.provider == "gemini"
    assert response.model == "gemini-flash-latest"
    assert response.evidence_sufficient is True
    assert response.evaluation.groundedness == 1.0
    assert response.pipeline.generation is PipelineStage.SUCCESS


async def test_gemini_llm_mode_does_not_retrieve(monkeypatch):
    stub = _StubGemini(
        result=GenerationResult(
            answer="Respuesta sin contexto.",
            claims=[],
            provider="gemini",
            model="gemini-flash-latest",
            evidence_sufficient=True,
        )
    )
    service = _service_with_gemini(monkeypatch, stub)

    response = await service.query(
        QueryRequest(query="¿Qué es RAG?", mode=Mode.LLM)
    )

    assert response.documents == []
    assert stub.calls[0][2] == []  # no fragments passed -> "without RAG"
    assert response.pipeline.retrieval is PipelineStage.IDLE


async def test_gemini_provider_failure_is_raised_not_faked(monkeypatch):
    stub = _StubGemini(
        error=LLMProviderError("auth", "Autenticación con Gemini rechazada.")
    )
    service = _service_with_gemini(monkeypatch, stub)

    # A provider failure must surface as an error, never as a fake 200 answer.
    with pytest.raises(LLMProviderError) as exc:
        await service.query(QueryRequest(query="¿Qué es RAG?", mode=Mode.RAG))

    assert exc.value.category == "auth"
    # Retrieval still ran and handed fragments to the provider before it failed.
    assert stub.calls
    assert stub.calls[0][2]


async def test_gemini_missing_key_raises_config_error(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    service = MockRAGService()
    # Force the config-error path deterministically regardless of local env.
    service._gemini_client = GeminiLLMClient(api_key="", client=None)

    with pytest.raises(LLMProviderError) as exc:
        await service.query(QueryRequest(query="¿Qué es RAG?", mode=Mode.RAG))

    assert exc.value.category == "config"
    assert "GEMINI_API_KEY" in exc.value.message


async def test_deep_analysis_local_fallback_in_mock_mode(monkeypatch, tmp_path):
    from app.services.document_store import DocumentStore

    monkeypatch.setattr(settings, "llm_provider", "mock")
    (tmp_path / "document_01.txt").write_text(
        "RAG combina un recuperador con un generador. Reduce las alucinaciones "
        "en los modelos de lenguaje, aunque no las elimina por completo.",
        encoding="utf-8",
    )
    service = MockRAGService()
    service.store = DocumentStore(tmp_path)

    analysis = await service.analyze_document(
        "document_01", include_summary=True, deep=True
    )

    assert analysis is not None
    # Extractive key points come from the stored text, no model is available.
    assert analysis.key_points
    assert analysis.claims == []
    assert analysis.strategy and "extractivo" in analysis.strategy.lower()
    assert analysis.summary is None
    assert "gemini" in (analysis.summary_note or "").lower()


async def test_deep_analysis_uses_gemini_and_reports_verified_claims(monkeypatch, tmp_path):
    from app.services.document_store import DocumentStore
    from app.services.llm_client import DeepAnalysis
    from app.models.schemas import DocumentClaim

    (tmp_path / "document_01.txt").write_text(
        "RAG reduce las alucinaciones pero no las elimina.", encoding="utf-8"
    )

    deep = DeepAnalysis(
        summary="Resumen del modelo.",
        key_points=["Idea uno", "Idea dos"],
        claims=[
            DocumentClaim(
                text="RAG reduce las alucinaciones",
                status="supported",
                evidence="RAG reduce las alucinaciones",
                location="Introducción",
                verified=True,
            )
        ],
        conclusions="Conclusión del modelo.",
        chunks_processed=1,
    )

    class _StubAnalyzer:
        provider = "gemini"

        async def analyze(self, text, name):
            return deep

    monkeypatch.setattr(settings, "llm_provider", "gemini")
    service = MockRAGService()
    service.store = DocumentStore(tmp_path)
    service._gemini_client = _StubAnalyzer()

    analysis = await service.analyze_document("document_01", deep=True)
    assert analysis is not None
    assert analysis.summary == "Resumen del modelo."
    assert analysis.key_points == ["Idea uno", "Idea dos"]
    assert analysis.claims and analysis.claims[0].verified is True
    assert analysis.conclusions == "Conclusión del modelo."
    assert analysis.chunks_processed == 1
    assert analysis.provider == "gemini"


async def test_gemini_rag_eval_runs_claim_verification(monkeypatch):
    stub = _StubGemini(
        result=GenerationResult(
            answer="RAG reduce las alucinaciones [document_01].",
            claims=[
                Claim(text="citación", status=ClaimStatus.SUPPORTED, source="document_01", confidence=0.9)
            ],
            provider="gemini",
            model="gemini-flash-latest",
            evidence_sufficient=True,
        ),
        verified=[
            Claim(text="RAG reduce las alucinaciones", status=ClaimStatus.SUPPORTED, source="document_01", confidence=0.9),
            Claim(text="RAG elimina por completo las alucinaciones", status=ClaimStatus.CONTRADICTED, confidence=0.0),
        ],
    )
    service = _service_with_gemini(monkeypatch, stub)

    response = await service.query(
        QueryRequest(query="¿Qué es RAG?", mode=Mode.RAG_EVAL)
    )

    # Condition C replaces citation-derived claims with the verifier's verdict.
    assert stub.verify_calls == 1
    assert len(response.claims) == 2
    assert response.metrics is not None
    assert response.metrics.groundedness == 0.5
    assert response.metrics.unsupported_rate == 0.5
    # Condition B must not run verification.
    stub.verify_calls = 0
    await service.query(QueryRequest(query="¿Qué es RAG?", mode=Mode.RAG))
    assert stub.verify_calls == 0
