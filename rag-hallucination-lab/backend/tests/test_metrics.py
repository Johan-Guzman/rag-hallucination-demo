"""Tests for the metrics engine and cross-condition aggregation."""

from __future__ import annotations

from app.models.schemas import Claim, ClaimStatus, Document, ExperimentCell, Mode
from app.services.metrics import aggregate_experiment, compute_metrics


def _doc(doc_id="document_01", score=0.8):
    return Document(id=doc_id, name=f"{doc_id}.txt", content="ctx", score=score)


def test_compute_metrics_from_real_signals():
    claims = [
        Claim(text="a", status=ClaimStatus.SUPPORTED, source="document_01"),
        Claim(text="b", status=ClaimStatus.UNSUPPORTED),
        Claim(text="c", status=ClaimStatus.CONTRADICTED),
        Claim(text="d", status=ClaimStatus.SUPPORTED, source="document_01"),
    ]
    metrics = compute_metrics(
        answer="La respuesta se apoya en [document_01].",
        claims=claims,
        documents=[_doc("document_01", 0.9), _doc("document_02", 0.7)],
        evidence_sufficient=True,
        invalid_citations=["document_99"],
        latency_ms=123.456,
    )
    assert metrics.claims_total == 4
    assert metrics.claims_supported == 2
    assert metrics.claims_unsupported == 2
    assert metrics.groundedness == 0.5
    assert metrics.unsupported_rate == 0.5
    # 1 valid citation vs 1 invalid -> attribution 0.5 (not silently dropped)
    assert metrics.citation_attribution == 0.5
    assert metrics.citations_valid == 1
    assert metrics.citations_invalid == 1
    assert metrics.retrieval_score == 0.8
    assert metrics.latency_ms == 123.5
    assert metrics.abstention is False


def test_metrics_undefined_without_retrieval_stay_none():
    metrics = compute_metrics(
        answer="Respuesta sin contexto.",
        claims=[],
        documents=[],
        evidence_sufficient=None,
    )
    assert metrics.groundedness is None
    assert metrics.citation_attribution is None
    assert metrics.retrieval_score is None
    assert metrics.abstention is False


def test_aggregate_excludes_failed_and_undefined_cells():
    cells = [
        ExperimentCell(
            question="q1", mode=Mode.RAG, status="ok",
            metrics=compute_metrics(answer="x [document_01]", claims=[Claim(text="a", status=ClaimStatus.SUPPORTED)], documents=[_doc("document_01", 0.6)], evidence_sufficient=True, latency_ms=10.0),
        ),
        ExperimentCell(
            question="q2", mode=Mode.RAG, status="ok",
            metrics=compute_metrics(answer="x [document_02]", claims=[Claim(text="a", status=ClaimStatus.UNSUPPORTED)], documents=[_doc("document_02", 0.4)], evidence_sufficient=True, latency_ms=20.0),
        ),
        ExperimentCell(question="q3", mode=Mode.RAG, status="error", error="boom"),
        ExperimentCell(
            question="q1", mode=Mode.LLM, status="ok",
            metrics=compute_metrics(answer="sin contexto", claims=[], documents=[], evidence_sufficient=None),
        ),
    ]
    aggregates = {a.key: a for a in aggregate_experiment(cells)}

    ground = aggregates["groundedness"]
    # RAG: (1.0 + 0.0)/2 = 0.5 over 2 samples; LLM undefined -> excluded.
    assert ground.values["rag"] == 0.5
    assert ground.values["llm"] is None
    assert ground.samples == {"rag": 2, "llm": 0}
    assert ground.best_mode == "rag"
    # Groundedness is not comparable when sample counts differ.
    assert ground.comparable is False

    latency = aggregates["latency_ms"]
    assert latency.higher_is_better is False
    # Failed cell excluded -> only 2 RAG samples contribute.
    assert latency.samples["rag"] == 2
