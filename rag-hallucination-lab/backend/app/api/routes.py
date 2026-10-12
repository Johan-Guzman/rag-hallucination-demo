import logging
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from app.models.schemas import (
    AnalyzeRequest,
    DocumentAnalysis,
    DocumentDetail,
    Experiment,
    ExperimentComparison,
    ExperimentRequest,
    ExperimentSummary,
    HealthResponse,
    QueryRequest,
    QueryResponse,
    UploadResponse,
)
from app.services.rag_service import rag_service
from app.services.experiment import ExperimentRunner
from app.services.llm_client import LLMProviderError
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

experiment_runner = ExperimentRunner(rag_service, rag_service.data_dir / "experiments")

# Provider failure category -> HTTP status. A generation failure must never be
# returned as HTTP 200, otherwise a failed Gemini call is indistinguishable from
# a real answer for clients and automation.
_PROVIDER_ERROR_STATUS = {
    "config": 500,       # server misconfiguration (no key / SDK missing)
    "auth": 502,         # provider rejected our credentials
    "rate_limit": 429,
    "unavailable": 503,  # provider/model temporarily unavailable
    "empty": 502,
    "unknown": 502,
}


@router.post("/query", response_model=QueryResponse)
async def query_endpoint(request: QueryRequest):
    try:
        return await rag_service.query(request)
    except LLMProviderError as exc:
        status = _PROVIDER_ERROR_STATUS.get(exc.category, 502)
        logger.error(
            "Query generation failed | provider=%s category=%s status=%d",
            settings.effective_provider,
            exc.category,
            status,
        )
        raise HTTPException(status_code=status, detail=exc.message)
    except Exception as e:  # noqa: BLE001 - normalized to a safe 500
        logger.exception("Unexpected error handling /api/query")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------
@router.get("/documents")
async def get_documents():
    docs = rag_service.get_document_records()
    return {"documents": [doc.model_dump(mode="json") for doc in docs]}


@router.get("/documents/{doc_id}", response_model=DocumentDetail)
async def get_document(doc_id: str):
    detail = rag_service.get_document_detail(doc_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    return detail


@router.post("/documents/upload", response_model=UploadResponse)
async def upload_documents(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No se recibió ningún archivo.")
    payload: List[tuple[str, bytes]] = []
    for upload in files:
        data = await upload.read()
        payload.append((upload.filename or "archivo", data))
    results, records = rag_service.upload_documents(payload)
    return UploadResponse(
        results=results,
        documents=[r for r in records],
    )


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    if not rag_service.delete_document(doc_id):
        raise HTTPException(
            status_code=404,
            detail="No se puede eliminar: el documento no existe o es parte del "
            "corpus integrado.",
        )
    return {"deleted": doc_id}


@router.post("/documents/analyze", response_model=List[DocumentAnalysis])
async def analyze_documents(request: AnalyzeRequest):
    ids = request.document_ids or [r.id for r in rag_service.get_document_records()]
    analyses: List[DocumentAnalysis] = []
    for doc_id in ids:
        try:
            analysis = await rag_service.analyze_document(
                doc_id, request.include_summary, request.deep
            )
        except LLMProviderError as exc:
            status = _PROVIDER_ERROR_STATUS.get(exc.category, 502)
            logger.error(
                "Document analysis failed | doc=%s category=%s status=%d",
                doc_id,
                exc.category,
                status,
            )
            raise HTTPException(status_code=status, detail=exc.message)
        if analysis is None:
            raise HTTPException(
                status_code=404, detail=f"Documento no encontrado: {doc_id}"
            )
        analyses.append(analysis)
    return analyses


# ---------------------------------------------------------------------------
# Experiments
# ---------------------------------------------------------------------------
@router.post("/experiments/run", response_model=Experiment)
async def run_experiment(request: ExperimentRequest):
    try:
        return await experiment_runner.run(request)
    except Exception as e:  # noqa: BLE001
        logger.exception("Unexpected error running experiment")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/experiments", response_model=List[ExperimentSummary])
async def list_experiments():
    return experiment_runner.list()


# NOTE: declared before `/experiments/{experiment_id}` so "comparison" is not
# swallowed as an experiment id by the dynamic route.
@router.get("/experiments/comparison", response_model=ExperimentComparison)
async def compare_experiments(
    ids: str = Query(
        default="",
        description="Comma-separated experiment ids to compare (all when empty).",
    ),
    question: str = Query(
        default="",
        description="Optional question to filter every run by.",
    ),
):
    id_list = [item.strip() for item in ids.split(",") if item.strip()] or None
    return experiment_runner.comparison(id_list, question.strip() or None)


@router.post("/experiments/demo", response_model=Experiment)
async def run_demo_experiment():
    try:
        return await experiment_runner.run_demo()
    except Exception as e:  # noqa: BLE001
        logger.exception("Unexpected error running demo experiment")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/experiments/{experiment_id}", response_model=Experiment)
async def get_experiment(experiment_id: str):
    experiment = experiment_runner.get(experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experimento no encontrado.")
    return experiment


@router.delete("/experiments/{experiment_id}")
async def delete_experiment(experiment_id: str):
    if not experiment_runner.delete(experiment_id):
        raise HTTPException(status_code=404, detail="Experimento no encontrado.")
    return {"deleted": experiment_id}


# ---------------------------------------------------------------------------
# Demo data + health
# ---------------------------------------------------------------------------
@router.get("/demo-cases")
async def get_demo_cases():
    cases = rag_service.get_demo_cases()
    return {"cases": cases}


@router.get("/health", response_model=HealthResponse)
async def health_check():
    provider = rag_service.provider
    counts = rag_service.store.counts()
    return HealthResponse(
        status="healthy",
        mock_mode=provider == "mock",
        provider=provider,
        model=rag_service.model,
        gemini_configured=bool(settings.gemini_api_key),
        documents=counts["documents"],
        uploaded_documents=counts["uploaded_documents"],
    )
