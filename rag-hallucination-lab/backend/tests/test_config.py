"""Configuration loading tests.

They lock in the fixes for the "app runs in mock even though Gemini is selected"
bug: the .env must be resolved relative to the backend source (not the current
working directory), and unsafe values must be normalized/clamped.
"""

from __future__ import annotations

from app.core.config import (
    ENV_FILE,
    GEMINI_MAX_OUTPUT_TOKENS_CEILING,
    Settings,
)


def test_env_file_is_absolute_and_points_to_dot_env():
    # Absolute path => loaded no matter which directory the process starts in.
    assert ENV_FILE.is_absolute()
    assert ENV_FILE.name == ".env"


def test_absolute_env_file_actually_exists_next_to_backend():
    assert ENV_FILE.parent.is_dir()
    assert (ENV_FILE.parent / ".env.example").is_file()


def test_max_output_tokens_is_clamped_to_supported_ceiling():
    s = Settings(gemini_max_output_tokens=10_000_000)
    assert s.gemini_max_output_tokens == GEMINI_MAX_OUTPUT_TOKENS_CEILING


def test_max_output_tokens_lower_bound():
    s = Settings(gemini_max_output_tokens=0)
    assert s.gemini_max_output_tokens == 1


def test_unknown_provider_falls_back_to_mock():
    s = Settings(llm_provider="gpt-4o")
    assert s.llm_provider == "mock"


def test_provider_is_normalized():
    s = Settings(llm_provider="  GeMiNi ")
    assert s.llm_provider == "gemini"


# ---------------------------------------------------------------------------
# MOCK_MODE semantics. These build isolated Settings (no .env) so the developer's
# ambient .env cannot influence the assertions.
# ---------------------------------------------------------------------------
def test_mock_mode_unset_defers_to_llm_provider():
    s = Settings(llm_provider="mock", _env_file=None)
    assert s.mock_mode is None
    assert s.effective_provider == "mock"
    assert s.is_mock is True


def test_mock_mode_false_enables_real_provider():
    # The reported bug: MOCK_MODE=false must not be silently ignored.
    s = Settings(llm_provider="mock", mock_mode=False, gemini_api_key="k", _env_file=None)
    assert s.effective_provider == "gemini"
    assert s.is_mock is False


def test_llm_provider_gemini_wins_even_with_mock_mode_true():
    # Guards against the .env.example trap (it ships MOCK_MODE=true).
    s = Settings(llm_provider="gemini", mock_mode=True, _env_file=None)
    assert s.effective_provider == "gemini"
    assert s.is_mock is False


# ---------------------------------------------------------------------------
# CORS. The production frontend origin must be allowed by default, and values
# coming from a hosting dashboard (often stored with a trailing slash) must be
# normalized so they match the browser's Origin header.
# ---------------------------------------------------------------------------
def test_default_cors_allows_production_frontend_origin():
    s = Settings(_env_file=None)
    assert "https://rag-hallucination-demo-front.onrender.com" in s.cors_origin_list


def test_cors_origins_are_trimmed_split_and_de_slashed():
    s = Settings(
        cors_origins="https://rag-hallucination-demo-front.onrender.com/, http://localhost:3000",
        _env_file=None,
    )
    assert s.cors_origin_list == [
        "https://rag-hallucination-demo-front.onrender.com",
        "http://localhost:3000",
    ]


def test_cors_wildcard_is_preserved():
    s = Settings(cors_origins="*", _env_file=None)
    assert s.cors_origin_list == ["*"]


def test_cors_empty_falls_back_to_wildcard():
    s = Settings(cors_origins="", _env_file=None)
    assert s.cors_origin_list == ["*"]
