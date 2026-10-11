from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # LLM Configuration
    llm_provider: str = "mock"
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    llm_model: str = "gpt-4o-mini"

    # Embedding Configuration
    embedding_provider: str = "mock"
    openai_embedding_model: str = "text-embedding-3-small"
    sentence_transformer_model: str = "all-MiniLM-L6-v2"

    # Vector Store
    vector_store: str = "chroma"
    chroma_persist_dir: str = "./data/chroma"

    # Mock Mode
    mock_mode: bool = True

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()