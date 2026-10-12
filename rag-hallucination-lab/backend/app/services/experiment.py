"""Experiment runner: execute the same questions across the three conditions.

An experiment runs each question under each requested condition (A: no evidence,
B: evidence, C: evidence + verification), records the real response per cell,
handles per-cell failures without aborting the batch, and aggregates the metrics
for a fair comparison. Results are persisted so the same run can be inspected
later.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from app.models.schemas import (
    ComparisonRun,
    Experiment,
    ExperimentCell,
    ExperimentComparison,
    ExperimentRequest,
    ExperimentSummary,
    MetricAggregate,
    Mode,
    QueryRequest,
)
from app.services.llm_client import LLMProviderError
from app.services.metrics import aggregate_experiment
from app.services.rag_service import MockRAGService

logger = logging.getLogger(__name__)


class ExperimentRunner:
    def __init__(self, service: MockRAGService, experiments_dir: Path):
        self.service = service
        self.experiments_dir = Path(experiments_dir)
        self.experiments_dir.mkdir(parents=True, exist_ok=True)

    # -- Persistence ------------------------------------------------------
    def _path(self, experiment_id: str) -> Path:
        return self.experiments_dir / f"{experiment_id}.json"

    def list(self) -> List[ExperimentSummary]:
        summaries: List[ExperimentSummary] = []
        for path in sorted(self.experiments_dir.glob("exp_*.json"), reverse=True):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                experiment = Experiment(**data)
            except Exception as exc:  # pragma: no cover - tolerate corrupt files
                logger.warning("Skipping unreadable experiment %s: %s", path, exc)
                continue
            summaries.append(
                ExperimentSummary(
                    id=experiment.id,
                    created_at=experiment.created_at,
                    questions=len(experiment.questions),
                    modes=experiment.modes,
                    document_names=experiment.document_names,
                    provider=experiment.provider,
                    status_counts=experiment.status_counts,
                    is_demo=experiment.is_demo,
                )
            )
        return summaries

    def get(self, experiment_id: str) -> Optional[Experiment]:
        path = self._path(experiment_id)
        if not path.is_file():
            return None
        try:
            return Experiment(**json.loads(path.read_text(encoding="utf-8")))
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Could not read experiment %s: %s", experiment_id, exc)
            return None

    def delete(self, experiment_id: str) -> bool:
        path = self._path(experiment_id)
        if not path.is_file():
            return False
        try:
            path.unlink()
        except OSError:  # pragma: no cover - defensive
            return False
        return True

    # -- Execution --------------------------------------------------------
    async def run(
        self, request: ExperimentRequest, is_demo: bool = False
    ) -> Experiment:
        questions = self._normalize_questions(request.questions)
        modes = list(dict.fromkeys(request.modes)) or [
            Mode.LLM,
            Mode.RAG,
            Mode.RAG_EVAL,
        ]
        top_k = max(1, min(20, request.top_k))

        cells: List[ExperimentCell] = []
        for question in questions:
            for mode in modes:
                cells.append(
                    await self._run_cell(question, mode, request.document_ids, top_k)
                )

        status_counts = {
            "ok": sum(1 for c in cells if c.status == "ok"),
            "error": sum(1 for c in cells if c.status == "error"),
        }
        aggregates = aggregate_experiment(cells)

        experiment = Experiment(
            id=self._new_id(),
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            questions=questions,
            modes=modes,
            document_ids=list(request.document_ids or []),
            document_names=self._document_names(request.document_ids),
            top_k=top_k,
            provider=self.service.provider,
            model=self.service.model,
            cells=cells,
            aggregates=aggregates,
            status_counts=status_counts,
            notes=self._notes(status_counts, modes, is_demo),
            is_demo=is_demo,
        )
        self.experiments_dir.mkdir(parents=True, exist_ok=True)
        self._path(experiment.id).write_text(
            experiment.model_dump_json(indent=2), encoding="utf-8"
        )
        logger.info(
            "Experiment %s completed | questions=%d modes=%d ok=%d error=%d",
            experiment.id,
            len(questions),
            len(modes),
            status_counts["ok"],
            status_counts["error"],
        )
        return experiment

    async def run_demo(self, document_ids: Optional[List[str]] = None) -> Experiment:
        """Run a labelled demo experiment over the built-in demo questions.

        The questions come from the shipped demo cases (not a user design), but
        every response and metric is a real execution of the pipeline; the run is
        flagged ``is_demo`` so it is never confused with a designed experiment.
        """
        questions: List[str] = []
        for case in self.service.get_demo_cases():
            query = str(case.get("query") or "").strip()
            if query and query not in questions:
                questions.append(query)
        if not questions:
            questions = [
                "¿Qué es RAG?",
                "¿RAG elimina completamente las alucinaciones?",
            ]
        request = ExperimentRequest(
            questions=questions,
            modes=[Mode.LLM, Mode.RAG, Mode.RAG_EVAL],
            document_ids=document_ids,
        )
        return await self.run(request, is_demo=True)

    # -- Comparison -------------------------------------------------------
    def comparison(
        self,
        ids: Optional[List[str]] = None,
        question: Optional[str] = None,
    ) -> ExperimentComparison:
        """Build a real comparison dataset from persisted experiment runs.

        ``ids`` restricts the comparison to the selected runs (all when omitted);
        ``question`` restricts every run to a single question. Nothing is
        invented: aggregates come from the metrics stored with each run.
        """
        summaries = {s.id: s for s in self.list()}
        selected = [i for i in (ids or []) if i in summaries] if ids else list(summaries)

        runs: List[ComparisonRun] = []
        all_cells: List[ExperimentCell] = []
        status_totals: dict = {}
        run_questions: List[str] = []

        for experiment_id in selected:
            experiment = self.get(experiment_id)
            if experiment is None:
                continue
            cells = experiment.cells
            if question:
                cells = [c for c in cells if c.question == question]
            for q in experiment.questions:
                if q not in run_questions:
                    run_questions.append(q)
            aggregates = (
                aggregate_experiment(cells) if question else experiment.aggregates
            )
            run_status: dict = {}
            for cell in cells:
                run_status[cell.status] = run_status.get(cell.status, 0) + 1
                status_totals[cell.status] = status_totals.get(cell.status, 0) + 1
            all_cells.extend(cells)
            runs.append(
                ComparisonRun(
                    id=experiment.id,
                    created_at=experiment.created_at,
                    questions=len(experiment.questions),
                    modes=experiment.modes,
                    document_names=experiment.document_names,
                    status_counts=experiment.status_counts if not question else run_status,
                    is_demo=experiment.is_demo,
                    aggregates=aggregates,
                )
            )

        overall: List[MetricAggregate] = aggregate_experiment(all_cells) if all_cells else []
        notes: List[str] = []
        if not runs:
            notes.append(
                "No hay ejecuciones guardadas todavía. Ejecuta un experimento "
                "(o una demo) para ver métricas reales comparadas."
            )
        else:
            notes.append(
                "Los valores proceden de ejecuciones reales guardadas; no hay "
                "datos simulados. Las condiciones no definidas para una métrica "
                "se muestran como «N/D» y se excluyen de los promedios."
            )
            if question:
                notes.append(f"Filtrado por pregunta: «{question}».")
            if any(run.is_demo for run in runs):
                notes.append(
                    "La selección incluye ejecuciones de demostración (marcadas); "
                    "sus métricas son reales, pero las preguntas son predefinidas."
                )
            providers = {run.provider or "mock" for run in runs}
            if providers == {"mock"}:
                notes.append(
                    "Todas las ejecuciones seleccionadas usan el proveedor mock "
                    "(sin LLM real); B y C pueden coincidir salvo en los casos de "
                    "demostración con guion."
                )

        return ExperimentComparison(
            generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            runs=runs,
            overall=overall,
            status_totals=status_totals,
            questions=run_questions,
            question=question,
            notes=notes,
        )

    async def _run_cell(
        self,
        question: str,
        mode: Mode,
        document_ids: Optional[List[str]],
        top_k: int,
    ) -> ExperimentCell:
        try:
            response = await self.service.query(
                QueryRequest(
                    query=question,
                    mode=mode,
                    top_k=top_k,
                    document_ids=document_ids,
                )
            )
        except LLMProviderError as exc:
            logger.warning(
                "Experiment cell failed | question=%r mode=%s category=%s",
                question[:40],
                mode.value,
                exc.category,
            )
            return ExperimentCell(
                question=question,
                mode=mode,
                status="error",
                error=exc.message,
                error_category=exc.category,
            )
        except Exception as exc:  # noqa: BLE001 - keep the batch running
            logger.exception("Unexpected experiment cell failure")
            return ExperimentCell(
                question=question,
                mode=mode,
                status="error",
                error="Error inesperado al ejecutar la condición.",
                error_category="unknown",
            )
        return ExperimentCell(
            question=question,
            mode=mode,
            status="ok",
            answer=response.answer,
            documents=response.documents,
            claims=response.claims,
            evaluation=response.evaluation,
            metrics=response.metrics,
            provider=response.provider,
            model=response.model,
            evidence_sufficient=response.evidence_sufficient,
            latency_ms=response.latency_ms or 0.0,
        )

    # -- Helpers ----------------------------------------------------------
    @staticmethod
    def _normalize_questions(questions: List[str]) -> List[str]:
        seen: List[str] = []
        for question in questions:
            cleaned = (question or "").strip()
            if cleaned and cleaned not in seen:
                seen.append(cleaned)
        return seen

    def _document_names(self, document_ids: Optional[List[str]]) -> List[str]:
        records = self.service.get_document_records()
        if document_ids:
            allowed = set(document_ids)
            return [r.name for r in records if r.id in allowed]
        return [r.name for r in records if r.status.value == "processed"]

    def _notes(
        self, status_counts: dict, modes: List[Mode], is_demo: bool = False
    ) -> List[str]:
        notes = [
            "Las tres condiciones se ejecutan sobre las mismas preguntas y los "
            "mismos documentos para permitir una comparación justa.",
            "Gemini puede variar entre ejecuciones; las diferencias observadas no "
            "son por sí solas pruebas concluyentes.",
        ]
        if is_demo:
            notes.insert(
                0,
                "Ejecución de demostración: las preguntas provienen del conjunto "
                "de casos incluido, no de un diseño del usuario. Las métricas sí "
                "son mediciones reales de esa ejecución.",
            )
        if len(modes) < 3:
            notes.append(
                "No se ejecutaron las tres condiciones; la comparación está incompleta."
            )
        if self.service.provider == "mock":
            notes.append(
                "Proveedor en modo mock (sin LLM real): las respuestas provienen del "
                "conjunto de demostración, no de Gemini."
            )
        if status_counts.get("error"):
            notes.append(
                f"{status_counts['error']} celdas fallaron; no cuentan para los "
                "promedios y se muestran como errores en la tabla por pregunta."
            )
        return notes

    @staticmethod
    def _new_id() -> str:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return f"exp_{stamp}_{uuid.uuid4().hex[:6]}"
