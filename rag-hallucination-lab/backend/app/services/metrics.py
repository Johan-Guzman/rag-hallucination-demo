"""Reproducible metrics for RAG responses and cross-condition comparison.

Every number produced here is derived from data the pipeline actually emits:
the generated answer, the claims after verification, the retrieved fragments and
the measured latency. There are no decorative constants.

Two important honesty rules are encoded in the definitions below:

* A metric that is *undefined* for a response is reported as ``None`` (e.g.
  citation attribution for the no-retrieval condition), never as ``0`` that
  would look like a measured failure.
* ``retrieval_score`` is a heuristic relevance proxy from the demo retriever, not
  a ground-truth recall; it is labelled as such.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence

from app.models.schemas import (
    Claim,
    ClaimStatus,
    Document,
    ExperimentCell,
    MetricAggregate,
    Mode,
    ResponseMetrics,
)
from app.services.llm_client import extract_document_ids

MODE_LABELS = {
    Mode.LLM.value: "A · Sin evidencia",
    Mode.RAG.value: "B · Con evidencia",
    Mode.RAG_EVAL.value: "C · Con verificación",
}

# Catalogue of compared metrics: label, unit, direction and an explicit
# definition shown in the UI so no chart is presented without context.
METRIC_CATALOG = [
    {
        "key": "groundedness",
        "label": "Fundamentación (groundedness)",
        "unit": "%",
        "higher_is_better": True,
        "definition": (
            "Afirmaciones respaldadas por el contexto recuperado / afirmaciones "
            "totales. Para la condición C las afirmaciones se clasifican una a una "
            "con un verificador (juez LLM cuando el proveedor es Gemini)."
        ),
    },
    {
        "key": "citation_attribution",
        "label": "Atribución de citas",
        "unit": "%",
        "higher_is_better": True,
        "definition": (
            "Citas que apuntan a fragmentos realmente recuperados / citas emitidas. "
            "Indefinida sin recuperación (condición A)."
        ),
    },
    {
        "key": "unsupported_rate",
        "label": "Afirmaciones sin soporte",
        "unit": "%",
        "higher_is_better": False,
        "definition": (
            "Afirmaciones sin respaldo o contradichas / afirmaciones totales. "
            "Un valor menor es mejor."
        ),
    },
    {
        "key": "abstention",
        "label": "Abstención (evidencia insuficiente)",
        "unit": "%",
        "higher_is_better": True,
        "definition": (
            "Proporción de respuestas en las que el sistema reconoce que la "
            "evidencia recuperada no basta en lugar de inventar. No mide por sí "
            "sola si la abstención era la decisión correcta."
        ),
    },
    {
        "key": "retrieval_score",
        "label": "Relevancia de recuperación (proxy)",
        "unit": "",
        "higher_is_better": True,
        "definition": (
            "Media de la puntuación heurística (Jaccard) de los fragmentos "
            "recuperados. Es un proxy de relevancia, no un recall con verdad de "
            "referencia. Indefinida sin recuperación (condición A)."
        ),
    },
    {
        "key": "latency_ms",
        "label": "Latencia media",
        "unit": "ms",
        "higher_is_better": False,
        "definition": "Tiempo medio de respuesta medido en el backend, en milisegundos.",
    },
]


def _ratio(num: int, den: int) -> Optional[float]:
    if den <= 0:
        return None
    return round(num / den, 4)


def compute_metrics(
    *,
    answer: str,
    claims: Sequence[Claim],
    documents: Sequence[Document],
    evidence_sufficient: Optional[bool],
    invalid_citations: Sequence[str] = (),
    latency_ms: Optional[float] = None,
) -> ResponseMetrics:
    """Compute per-response metrics from the emitted signals."""
    total = len(claims)
    supported = sum(1 for c in claims if c.status is ClaimStatus.SUPPORTED)
    unsupported = sum(
        1 for c in claims if c.status in (ClaimStatus.UNSUPPORTED, ClaimStatus.CONTRADICTED)
    )

    citations = extract_document_ids(answer or "")
    valid_ids = {d.id.lower() for d in documents}
    valid = sum(1 for c in citations if c in valid_ids)
    invalid = len(invalid_citations)

    doc_scores = [d.score for d in documents]
    retrieval = round(sum(doc_scores) / len(doc_scores), 4) if doc_scores else None

    return ResponseMetrics(
        groundedness=_ratio(supported, total),
        citation_attribution=_ratio(valid, valid + invalid),
        unsupported_rate=_ratio(unsupported, total),
        abstention=bool(evidence_sufficient is False),
        retrieval_score=retrieval,
        latency_ms=round(latency_ms, 1) if latency_ms is not None else None,
        claims_total=total,
        claims_supported=supported,
        claims_unsupported=unsupported,
        citations_valid=valid,
        citations_invalid=invalid,
    )


def aggregate_experiment(cells: Sequence[ExperimentCell]) -> List[MetricAggregate]:
    """Aggregate one metric per mode across the executed cells.

    Only successful cells contribute. A mode value is the mean of its defined
    samples; ``None`` values (undefined for that condition) are excluded from the
    mean and from the sample count so the three conditions remain comparable.
    """
    modes: List[str] = []
    for cell in cells:
        if cell.mode.value not in modes:
            modes.append(cell.mode.value)

    aggregates: List[MetricAggregate] = []
    for spec in METRIC_CATALOG:
        key = spec["key"]
        values: Dict[str, Optional[float]] = {}
        samples: Dict[str, int] = {}
        for mode in modes:
            collected: List[float] = []
            for cell in cells:
                if cell.mode.value != mode or cell.status != "ok" or cell.metrics is None:
                    continue
                value = getattr(cell.metrics, key)
                if value is None:
                    continue
                collected.append(float(value))
            samples[mode] = len(collected)
            values[mode] = round(sum(collected) / len(collected), 4) if collected else None

        measured = {m: v for m, v in values.items() if v is not None}
        best_mode: Optional[str] = None
        if measured:
            target = max(measured.values()) if spec["higher_is_better"] else min(measured.values())
            winners = [m for m, v in measured.items() if round(v, 6) == round(target, 6)]
            # Only name a winner when exactly one condition attains the optimum;
            # a tie between conditions is not a result.
            best_mode = winners[0] if len(winners) == 1 else None

        sample_counts = {samples.get(m, 0) for m in measured}
        aggregates.append(
            MetricAggregate(
                key=key,
                label=spec["label"],
                unit=spec["unit"],
                higher_is_better=spec["higher_is_better"],
                definition=spec["definition"],
                values=values,
                best_mode=best_mode,
                samples=samples,
                # A metric is comparable only when at least two conditions were
                # actually measured on the same number of successful cells.
                comparable=len(measured) >= 2 and len(sample_counts) == 1,
            )
        )
    return aggregates
