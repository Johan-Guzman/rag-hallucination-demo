from fastapi import APIRouter, HTTPException
from app.models.schemas import QueryRequest, QueryResponse, HealthResponse
from app.services.rag_service import rag_service
from app.core.config import settings

router = APIRouter()


@router.post("/query", response_model=QueryResponse)
async def query_endpoint(request: QueryRequest):
    try:
        response = await rag_service.query(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents")
async def get_documents():
    docs = rag_service.get_all_documents()
    return {"documents": [doc.model_dump() for doc in docs]}


@router.get("/demo-cases")
async def get_demo_cases():
    cases = rag_service.get_demo_cases()
    return {"cases": cases}


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        mock_mode=settings.mock_mode
    )