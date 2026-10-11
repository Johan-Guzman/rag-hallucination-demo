from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router
from app.core.config import settings

app = FastAPI(
    title="RAG Hallucination Lab API",
    description="Backend for RAG Hallucination Lab - Educational Demo",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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