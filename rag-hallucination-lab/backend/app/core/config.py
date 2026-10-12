import logging
from pathlib import Path
from typing import Optional

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# Resolve the .env file relative to this source file instead of the current
# working directory. `env_file = ".env"` silently falls back to defaults when the
# process is started from another directory (e.g. `uvicorn --app-dir backend`),
# which made the app run in mock mode even after the user selected Gemini.
BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"

# Output-token ceiling for the Gemini text models (2.5 Flash / 3.x support
# 65536). Values above this are rejected by the API with HTTP 400, so we clamp
# defensively and log it instead of failing every request.
GEMINI_MAX_OUTPUT_TOKENS_CEILING = 65536
VALID_LLM_PROVIDERS = {"mock", "gemini"}


class Settings(BaseSettings):
    # LLM Configuration
    # llm_provider: "mock" (default, offline demo) or "gemini" (live Google Gemini).
    llm_provider: str = "mock"
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    llm_model: str = "gpt-4o-mini"

    # Google Gemini (used when llm_provider == "gemini")
    # The API key is read from the environment/`.env` only and never leaves the
    # backend: it is not returned by any endpoint and is never logged.
    gemini_api_key: Optional[str] = None
    # Single source of truth for the model name. Every call site reads
    # ``settings.gemini_model``; override with the GEMINI_MODEL env var.
    #
    # Verified against the live API for the configured key
    # (see docs/gemini-model-selection.md):
    #   * gemini-flash-latest        -> HTTP 429 (quota exhausted) [old default]
    #   * gemini-2.5-* / gemini-2.0- -> HTTP 404 (retired for new users)
    #   * gemini-3.5-flash           -> works, but 429 after ~5 rapid calls
    #   * gemini-3.5-flash-lite      -> stable, 15/15 sustained calls OK  <-- default
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_temperature: float = 0.0
    # Generous enough that a cited, multi-section grounded answer is not cut off
    # mid-sentence (the model appends an evidence marker as its final line).
    gemini_max_output_tokens: int = 2048

    # Embedding Configuration
    embedding_provider: str = "mock"
    openai_embedding_model: str = "text-embedding-3-small"
    sentence_transformer_model: str = "all-MiniLM-L6-v2"

    # Vector Store
    vector_store: str = "chroma"
    chroma_persist_dir: str = "./data/chroma"

    # Data / knowledge base
    data_dir: str = "./data"

    # CORS (comma-separated list of origins, or "*" for any)
    cors_origins: str = "*"

    # Mock Mode switch.
    #   MOCK_MODE unset -> LLM_PROVIDER decides (back-compatible).
    #   MOCK_MODE=false -> use the real provider ("use real APIs"), even when
    #                      LLM_PROVIDER is left at its default.
    #   MOCK_MODE=true  -> allowed, but an explicit LLM_PROVIDER=gemini still wins
    #                      (avoids the .env.example trap, which ships MOCK_MODE=true).
    mock_mode: Optional[bool] = None

    @property
    def effective_provider(self) -> str:
        """Provider actually used, honouring both MOCK_MODE and LLM_PROVIDER.

        ``LLM_PROVIDER=gemini`` is always honoured. ``MOCK_MODE=false`` also
        enables the real provider even when ``LLM_PROVIDER`` is at its default, so
        "use real APIs" is not silently ignored.
        """
        if self.llm_provider == "gemini":
            return "gemini"
        if self.mock_mode is False:
            return "gemini"
        return "mock"

    @property
    def is_mock(self) -> bool:
        """Effective mock state, derived from the resolved provider."""
        return self.effective_provider == "mock"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    @field_validator("llm_provider")
    @classmethod
    def _normalize_provider(cls, value: str) -> str:
        # Normalize casing/whitespace and catch typos instead of silently
        # switching to mock without explanation.
        normalized = (value or "").strip().lower()
        if normalized not in VALID_LLM_PROVIDERS:
            logger.warning(
                "Unknown LLM_PROVIDER=%r; falling back to 'mock'. Valid values: %s",
                value,
                ", ".join(sorted(VALID_LLM_PROVIDERS)),
            )
            return "mock"
        return normalized

    @field_validator("gemini_max_output_tokens")
    @classmethod
    def _clamp_max_output_tokens(cls, value: int) -> int:
        if value > GEMINI_MAX_OUTPUT_TOKENS_CEILING:
            logger.warning(
                "GEMINI_MAX_OUTPUT_TOKENS=%d exceeds the supported ceiling (%d); "
                "clamping to the ceiling.",
                value,
                GEMINI_MAX_OUTPUT_TOKENS_CEILING,
            )
            return GEMINI_MAX_OUTPUT_TOKENS_CEILING
        if value < 1:
            logger.warning(
                "GEMINI_MAX_OUTPUT_TOKENS=%d is invalid; using 1 instead.", value
            )
            return 1
        return value

    @model_validator(mode="after")
    def _check_mock_mode(self) -> "Settings":
        if self.mock_mode is False and self.llm_provider != "gemini":
            if not self.gemini_api_key:
                logger.error(
                    "MOCK_MODE=false requests real generation, but no "
                    "GEMINI_API_KEY is configured; Gemini calls will fail with a "
                    "clear error instead of silently serving mock data."
                )
            else:
                logger.info(
                    "MOCK_MODE=false: using the real Gemini provider "
                    "(LLM_PROVIDER=%r).",
                    self.llm_provider,
                )
        elif self.mock_mode is True and self.llm_provider == "gemini":
            logger.warning(
                "MOCK_MODE=true ignored because LLM_PROVIDER=gemini; using Gemini."
            )
        return self

    class Config:
        env_file = str(ENV_FILE)
        case_sensitive = False


settings = Settings()