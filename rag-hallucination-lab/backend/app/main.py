from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router
from app.core.config import settings

app = FastAPI(
    title="RAG Hallucination Lab API",
    description="Backend for RAG Hallucination Lab - Educational Demo",
    version="1.0.0"
)

# Origins are configurable via CORS_ORIGINS (comma-separated, or "*").
# Credentials are disabled so that the wildcard default stays spec-compliant.
cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

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
        "mock_mode": settings.mock_mode,
        "docs": "/docs"
    }