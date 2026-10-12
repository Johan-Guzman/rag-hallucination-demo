"""Tests for the experiment runner (mock provider, no network)."""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.models.schemas import ExperimentRequest, Mode
from app.services.document_store import DocumentStore
from app.services.experiment import ExperimentRunner
from app.services.llm_client import LLMProviderError
from app.services.rag_service import MockRAGService


@pytest.fixture()
def runner(monkeypatch, tmp_path) -> ExperimentRunner:
    monkeypatch.setattr(settings, "llm_provider", "mock")
    (tmp_path / "document_01.txt").write_text(
        "RAG enhances LLMs with retrieved context and reduces hallucinations.",
        encoding="utf-8",
    )
    service = MockRAGService()
    service.store = DocumentStore(tmp_path)
    return ExperimentRunner(service, tmp_path / "experiments")


async def test_runs_all_three_conditions_on_same_questions(runner):
    experiment = await runner.run(
        ExperimentRequest(
            questions=["¿Qué es RAG?", "¿RAG elimina las alucinaciones?"],
            modes=[Mode.LLM, Mode.RAG, Mode.RAG_EVAL],
            top_k=3,
        )
    )
    assert len(experiment.questions) == 2
    assert len(experiment.cells) == 6
    assert experiment.status_counts["ok"] == 6
    # Every metric from the catalogue is present and compared across conditions.
    keys = {a.key for a in experiment.aggregates}
    assert {"groundedness", "citation_attribution", "unsupported_rate", "abstention", "latency_ms"} <= keys
    # No-retrieval condition A has no retrieval score.
    retrieval = next(a for a in experiment.aggregates if a.key == "retrieval_score")
    assert retrieval.values["llm"] is None
    assert retrieval.values["rag"] is not None


async def test_only_requested_modes_are_run(runner):
    experiment = await runner.run(
        ExperimentRequest(questions=["¿Qué es RAG?"], modes=[Mode.RAG], top_k=3)
    )
    assert {c.mode.value for c in experiment.cells} == {"rag"}
    assert any("incompleta" in n for n in experiment.notes)


async def test_cell_failure_is_recorded_not_fatal(runner, monkeypatch):
    original = runner.service.query

    async def flaky(request):
        if request.mode is Mode.RAG_EVAL:
            raise LLMProviderError("rate_limit", "límite alcanzado")
        return await original(request)

    monkeypatch.setattr(runner.service, "query", flaky)
    experiment = await runner.run(
        ExperimentRequest(
            questions=["¿Qué es RAG?"],
            modes=[Mode.LLM, Mode.RAG, Mode.RAG_EVAL],
            top_k=3,
        )
    )
    assert experiment.status_counts == {"ok": 2, "error": 1}
    failed = next(c for c in experiment.cells if c.status == "error")
    assert failed.mode is Mode.RAG_EVAL
    assert failed.error_category == "rate_limit"
    assert failed.metrics is None
    # The failed condition contributes no samples.
    ground = next(a for a in experiment.aggregates if a.key == "groundedness")
    assert ground.samples["rag_eval"] == 0


async def test_persistence_list_get_delete(runner):
    experiment = await runner.run(
        ExperimentRequest(questions=["¿Qué es RAG?"], modes=[Mode.RAG], top_k=3)
    )
    listed = runner.list()
    assert [s.id for s in listed] == [experiment.id]
    assert listed[0].questions == 1

    loaded = runner.get(experiment.id)
    assert loaded is not None
    assert loaded.id == experiment.id

    assert runner.delete(experiment.id) is True
    assert runner.get(experiment.id) is None
    assert runner.list() == []


async def test_comparison_builds_real_aggregates_across_runs(runner):
    first = await runner.run(
        ExperimentRequest(
            questions=["¿Qué es RAG?"],
            modes=[Mode.LLM, Mode.RAG, Mode.RAG_EVAL],
            top_k=3,
        )
    )
    await runner.run(
        ExperimentRequest(questions=["¿Qué es RAG?"], modes=[Mode.RAG], top_k=3)
    )

    comparison = runner.comparison()
    assert {run.id for run in comparison.runs} == {first.id} | {
        s.id for s in runner.list()
    }
    assert comparison.overall  # aggregated across every selected run
    # The overall comparison exposes the catalogue keys.
    keys = {a.key for a in comparison.overall}
    assert "groundedness" in keys and "latency_ms" in keys
    # Restricting to the first run only returns that run.
    only_first = runner.comparison([first.id])
    assert [r.id for r in only_first.runs] == [first.id]
    assert only_first.questions == ["¿Qué es RAG?"]


async def test_comparison_can_filter_by_question(runner):
    experiment = await runner.run(
        ExperimentRequest(
            questions=["¿Qué es RAG?", "¿RAG elimina las alucinaciones?"],
            modes=[Mode.LLM, Mode.RAG],
            top_k=3,
        )
    )
    comparison = runner.comparison([experiment.id], question="¿Qué es RAG?")
    assert comparison.question == "¿Qué es RAG?"
    assert set(comparison.questions) == {
        "¿Qué es RAG?",
        "¿RAG elimina las alucinaciones?",
    }
    # Only cells for the filtered question contribute to status totals.
    assert comparison.status_totals.get("ok") == 2


async def test_demo_run_is_flagged_and_uses_real_questions(runner):
    experiment = await runner.run_demo()
    assert experiment.is_demo is True
    assert experiment.questions  # pulled from the shipped demo cases
    assert experiment.cells
    assert any("demostración" in n.lower() for n in experiment.notes)
    # The demo flag survives persistence and listing.
    assert runner.get(experiment.id).is_demo is True
    assert runner.list()[0].is_demo is True
