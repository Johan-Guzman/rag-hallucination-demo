import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router
from app.core.config import settings
from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)

# Uvicorn configures only its *own* loggers; the root logger stays at WARNING,
# which silently swallowed the provider diagnostics below. Configure one root
# handler so the application's INFO logs (active provider, Gemini calls) are
# visible when running `uvicorn app.main:app`.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Make the active generation provider obvious in the server logs."""
    logger.info(
        "RAG Hallucination Lab API | provider=%s | model=%s | "
        "gemini_configured=%s",
        rag_service.provider,
        rag_service.model or "-",
        bool(settings.gemini_api_key),
    )
    logger.info("CORS allowed origins: %s", ", ".join(cors_origins))
    if rag_service.provider == "gemini" and not settings.gemini_api_key:
        logger.error(
            "LLM_PROVIDER=gemini but GEMINI_API_KEY is not configured; queries "
            "will fail with HTTP 500 until the key is set."
        )
    yield


app = FastAPI(
    title="RAG Hallucination Lab API",
    description="Backend for RAG Hallucination Lab - Educational Demo",
    version="1.0.0",
    lifespan=lifespan,
)

# Origins are configurable via CORS_ORIGINS (comma-separated, or "*").
# Credentials are disabled so that the wildcard default stays spec-compliant.
cors_origins = settings.cors_origin_list

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/")
async def root():
    return {
        "name": "RAG Hallucination Lab API",
        "version": "1.0.0",
        "mock_mode": settings.is_mock,
        "provider": rag_service.provider,
        "model": rag_service.model,
        "docs": "/docs"
    }