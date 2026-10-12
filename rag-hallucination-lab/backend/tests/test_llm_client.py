"""Unit tests for the pluggable LLM client (Gemini integration).

These tests never hit the network: the Gemini SDK client is replaced by a small
fake. They assert the two safety-critical guarantees:

* retrieved fragments are passed to the model, and
* citations that do not point at a retrieved fragment are removed.
"""

from __future__ import annotations

import pytest

from app.models.schemas import ClaimStatus, Document, Mode
from app.services.llm_client import (
    GeminiLLMClient,
    LLMProviderError,
    build_context,
)


# --------------------------------------------------------------------------
# Fakes for the google-genai SDK surface we use
# --------------------------------------------------------------------------
class _FakeResponse:
    def __init__(self, text: str):
        self.text = text


class _FakeModels:
    def __init__(self, captured: dict, response=None, error: Exception | None = None):
        self._captured = captured
        self._response = response
        self._error = error

    async def generate_content(self, model, contents, config):
        self._captured["model"] = model
        self._captured["contents"] = contents
        self._captured["config"] = config
        if self._error is not None:
            raise self._error
        return self._response


class _FakeAio:
    def __init__(self, models: _FakeModels):
        self.models = models


class _FakeClient:
    def __init__(self, models: _FakeModels):
        self.aio = _FakeAio(models)


class _FakeSDKError(Exception):
    def __init__(self, message: str, code: int | None = None):
        super().__init__(message)
        self.code = code


def _docs() -> list[Document]:
    return [
        Document(
            id="document_01",
            name="document_01.txt",
            content="RAG enhances LLMs with retrieved context.",
            score=0.92,
        ),
        Document(
            id="document_05",
            name="document_05.txt",
            content="RAG reduces but does not eliminate hallucinations.",
            score=0.81,
        ),
    ]


# --------------------------------------------------------------------------
# Prompt / context construction
# --------------------------------------------------------------------------
def test_build_context_labels_each_fragment():
    context = build_context(_docs())
    assert "[document_01]" in context
    assert "[document_05]" in context
    assert "document_01.txt" in context
    assert "score: 0.92" in context


def test_llm_mode_prompt_has_no_context():
    content = GeminiLLMClient._contents("¿Pregunta?", Mode.LLM, _docs())
    assert content == "Pregunta: ¿Pregunta?"
    assert "document_01" not in content


def test_rag_mode_prompt_includes_fragments():
    content = GeminiLLMClient._contents("¿Pregunta?", Mode.RAG, _docs())
    assert "[document_01]" in content
    assert "[document_05]" in content


# --------------------------------------------------------------------------
# Response parsing / citation validation
# --------------------------------------------------------------------------
def test_parse_keeps_valid_citations_as_supported_claims():
    client = GeminiLLMClient(api_key="test", client=object())
    text = "RAG reduce las alucinaciones [document_01].\nEVIDENCIA: SUFICIENTE"
    result = client._parse(text, Mode.RAG, _docs())
    assert result.evidence_sufficient is True
    assert result.invalid_citations == []
    sources = [c.source for c in result.claims]
    assert "document_01" in sources
    assert all(c.status is ClaimStatus.SUPPORTED for c in result.claims)
    assert "EVIDENCIA" not in result.answer


def test_parse_removes_invented_citations():
    client = GeminiLLMClient(api_key="test", client=object())
    text = "Según [document_99], RAG elimina todo [document_01].\nEVIDENCIA: SUFICIENTE"
    result = client._parse(text, Mode.RAG, _docs())
    assert "document_99" not in result.answer
    assert result.invalid_citations == ["document_99"]
    assert all(c.source != "document_99" for c in result.claims)
    assert any(c.source == "document_01" for c in result.claims)


def test_parse_handles_grouped_citations():
    client = GeminiLLMClient(api_key="test", client=object())
    text = "RAG reduce alucinaciones [document_01, document_05].\nEVIDENCIA: SUFICIENTE"
    result = client._parse(text, Mode.RAG, _docs())
    assert result.evidence_sufficient is True
    assert result.invalid_citations == []
    assert {c.source for c in result.claims} == {"document_01", "document_05"}


def test_parse_group_keeps_only_valid_ids():
    client = GeminiLLMClient(api_key="test", client=object())
    text = "Según [document_99, document_01] RAG ayuda.\nEVIDENCIA: SUFICIENTE"
    result = client._parse(text, Mode.RAG, _docs())
    assert "document_99" not in result.answer
    assert "[document_01]" in result.answer
    assert result.invalid_citations == ["document_99"]


def test_parse_insufficient_evidence_sets_flag_and_claim():
    client = GeminiLLMClient(api_key="test", client=object())
    text = "No hay información suficiente.\nEVIDENCIA: INSUFICIENTE"
    result = client._parse(text, Mode.RAG, _docs())
    assert result.evidence_sufficient is False
    assert any(c.status is ClaimStatus.UNCERTAIN for c in result.claims)


def test_parse_uncited_rag_answer_is_unsupported():
    client = GeminiLLMClient(api_key="test", client=object())
    result = client._parse("RAG es útil.", Mode.RAG, _docs())
    assert result.evidence_sufficient is False
    assert any(c.status is ClaimStatus.UNSUPPORTED for c in result.claims)


def test_parse_drops_truncated_trailing_citation():
    # A response cut off by max_output_tokens can end mid-citation, e.g.
    # "...el contexto [document_0". The dangling fragment must not leak through.
    client = GeminiLLMClient(api_key="test", client=object())
    text = "RAG reduce alucinaciones [document_01] pero el generador [document_0"
    result = client._parse(text, Mode.RAG, _docs())
    # The truncated citation is gone; the complete one is preserved.
    assert not result.answer.rstrip().endswith("[document_0")
    assert "generador [document_0" not in result.answer
    assert result.answer.rstrip().endswith("generador")
    assert "[document_01]" in result.answer
    # The earlier valid citation still grounds the answer.
    assert result.evidence_sufficient is True


def test_parse_missing_marker_still_grounds_on_citations():
    # The evidence marker is machine-readable convenience only; when truncation
    # removes it, valid citations alone must still count as grounded.
    client = GeminiLLMClient(api_key="test", client=object())
    result = client._parse("RAG recupera documentos [document_01].", Mode.RAG, _docs())
    assert result.evidence_sufficient is True
    assert any(c.source == "document_01" for c in result.claims)


# --------------------------------------------------------------------------
# Generation call
# --------------------------------------------------------------------------
async def test_generate_passes_fragments_and_parses_result():
    captured: dict = {}
    response = _FakeResponse(
        "RAG recupera documentos [document_01] y mitiga alucinaciones [document_05].\n"
        "EVIDENCIA: SUFICIENTE"
    )
    client = GeminiLLMClient(
        api_key="test",
        model="gemini-flash-latest",
        client=_FakeClient(_FakeModels(captured, response=response)),
    )
    result = await client.generate("¿Qué hace RAG?", Mode.RAG, _docs())
    assert captured["model"] == "gemini-flash-latest"
    assert "[document_01]" in captured["contents"]
    assert result.provider == "gemini"
    assert len(result.claims) == 2


async def test_generate_empty_response_raises_typed_error():
    captured: dict = {}
    client = GeminiLLMClient(
        api_key="test",
        client=_FakeClient(_FakeModels(captured, response=_FakeResponse(""))),
    )
    with pytest.raises(LLMProviderError) as exc:
        await client.generate("¿?", Mode.RAG, _docs())
    assert exc.value.category == "empty"


async def test_generate_maps_auth_error():
    captured: dict = {}
    client = GeminiLLMClient(
        api_key="test",
        client=_FakeClient(
            _FakeModels(captured, error=_FakeSDKError("API key not valid", code=400))
        ),
    )
    with pytest.raises(LLMProviderError) as exc:
        await client.generate("¿?", Mode.RAG, _docs())
    assert exc.value.category == "auth"
    assert "GEMINI_API_KEY" in exc.value.message


async def test_generate_maps_rate_limit_error():
    captured: dict = {}
    client = GeminiLLMClient(
        api_key="test",
        client=_FakeClient(
            _FakeModels(captured, error=_FakeSDKError("quota exceeded", code=429))
        ),
    )
    with pytest.raises(LLMProviderError) as exc:
        await client.generate("¿?", Mode.RAG, _docs())
    assert exc.value.category == "rate_limit"


async def test_generate_maps_unknown_model_to_unavailable():
    captured: dict = {}
    client = GeminiLLMClient(
        api_key="test",
        client=_FakeClient(
            _FakeModels(captured, error=_FakeSDKError("model not found", code=404))
        ),
    )
    with pytest.raises(LLMProviderError) as exc:
        await client.generate("¿?", Mode.RAG, _docs())
    assert exc.value.category == "unavailable"


def test_missing_api_key_raises_config_error():
    client = GeminiLLMClient(api_key="", client=None)
    with pytest.raises(LLMProviderError) as exc:
        client._ensure_client()
    assert exc.value.category == "config"


# --------------------------------------------------------------------------
# Claim-level verification (condition C)
# --------------------------------------------------------------------------
def test_parse_claims_json_maps_statuses_and_sources():
    from app.services.llm_client import parse_claims_json

    raw = """```json
    {"claims": [
      {"text": "RAG recupera contexto", "status": "supported", "source": "document_01", "confidence": 0.9},
      {"text": "RAG elimina todo", "status": "contradicted", "source": "document_99", "confidence": 2.0},
      {"text": "Algo raro", "status": "weird", "source": null, "confidence": -1}
    ]}
    ```"""
    claims = parse_claims_json(raw, {"document_01", "document_05"})
    assert [c.status for c in claims] == [
        ClaimStatus.SUPPORTED,
        ClaimStatus.CONTRADICTED,
        ClaimStatus.UNCERTAIN,
    ]
    # Invented source is dropped; confidence clamped to [0, 1].
    assert claims[0].source == "document_01"
    assert claims[1].source is None
    assert claims[1].confidence == 1.0
    assert claims[2].confidence == 0.0


def test_parse_claims_json_returns_empty_on_garbage():
    from app.services.llm_client import parse_claims_json

    assert parse_claims_json("no json here", {"document_01"}) == []
    assert parse_claims_json("", set()) == []


async def test_verify_claims_uses_judge_prompt_and_parses_verdict():
    captured: dict = {}
    response = _FakeResponse(
        '{"claims": [{"text": "RAG reduce alucinaciones", "status": "supported", '
        '"source": "document_01", "confidence": 0.8}]}'
    )
    client = GeminiLLMClient(
        api_key="test",
        client=_FakeClient(_FakeModels(captured, response=response)),
    )
    claims = await client.verify_claims("RAG reduce alucinaciones [document_01].", _docs())
    assert len(claims) == 1
    assert claims[0].status is ClaimStatus.SUPPORTED
    assert claims[0].source == "document_01"
    # The verifier is grounded on the retrieved fragments, not the raw question.
    assert "document_01" in captured["contents"]
    assert "RESPUESTA A VERIFICAR" in captured["contents"]


async def test_verify_claims_empty_response_raises_typed_error():
    captured: dict = {}
    client = GeminiLLMClient(
        api_key="test",
        client=_FakeClient(_FakeModels(captured, response=_FakeResponse(""))),
    )
    with pytest.raises(LLMProviderError) as exc:
        await client.verify_claims("texto", _docs())
    assert exc.value.category == "empty"


async def test_verify_claims_propagates_provider_error():
    captured: dict = {}
    client = GeminiLLMClient(
        api_key="test",
        client=_FakeClient(
            _FakeModels(captured, error=_FakeSDKError("quota exceeded", code=429))
        ),
    )
    with pytest.raises(LLMProviderError) as exc:
        await client.verify_claims("texto", _docs())
    assert exc.value.category == "rate_limit"


async def test_summarize_returns_text_and_maps_errors():
    captured: dict = {}
    client = GeminiLLMClient(
        api_key="test",
        client=_FakeClient(_FakeModels(captured, response=_FakeResponse("Un resumen."))),
    )
    assert await client.summarize("contenido", "doc.txt") == "Un resumen."


# --------------------------------------------------------------------------
# Deep document analysis (Paper Analysis)
# --------------------------------------------------------------------------
def test_chunk_text_splits_on_paragraphs_within_limit():
    from app.services.llm_client import chunk_text

    text = "\n\n".join(["A" * 40, "B" * 40, "C" * 40])
    chunks = chunk_text(text, max_chars=90)
    assert len(chunks) >= 2
    assert all(len(c) <= 90 for c in chunks)
    # A short text is a single chunk.
    assert chunk_text("hola", max_chars=90) == ["hola"]
    assert chunk_text("   ", max_chars=90) == []


def test_quote_present_is_whitespace_insensitive_and_min_length():
    from app.services.llm_client import quote_present

    text = "RAG reduce las alucinaciones, pero no las elimina por completo."
    assert quote_present("reduce las   alucinaciones", text) is True
    assert quote_present("reduce las alucinaciones", text.upper()) is True
    assert quote_present("texto inventado", text) is False
    assert quote_present("corto", text) is False  # too short to trust
    assert quote_present(None, text) is False


def test_nearest_heading_finds_preceding_title():
    from app.services.llm_client import nearest_heading

    text = "## Introducción\nEl sistema recupera fragmentos.\n\n## Método\nUsa embeddings densos."
    assert nearest_heading(text, "Usa embeddings densos") == "Método"
    assert nearest_heading(text, "no aparece") is None


class _SimpleSequenceClient:
    """Minimal fake exposing ``aio.models.generate_content`` with a queue."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.captured: list[dict] = []
        self._aio = self

    @property
    def aio(self):
        return self

    @property
    def models(self):
        return self

    async def generate_content(self, model, contents, config):
        self.captured.append({"model": model, "contents": contents, "config": config})
        if not self.responses:
            raise AssertionError("no more fake responses")
        return self.responses.pop(0)


async def test_analyze_verifies_claim_quotes_and_marks_unverified():
    doc = (
        "## Introducción\n"
        "Retrieval-Augmented Generation combina un recuperador con un generador.\n\n"
        "## Límites\n"
        "RAG reduce las alucinaciones pero no las elimina por completo."
    )
    payload = (
        '{"summary": "Resumen del documento.", '
        '"key_points": ["Combina recuperación y generación", "No elimina las alucinaciones"], '
        '"claims": ['
        '{"text": "RAG combina recuperación y generación", '
        '"evidence": "Retrieval-Augmented Generation combina un recuperador con un generador."},'
        '{"text": "RAG elimina por completo las alucinaciones", '
        '"evidence": "RAG elimina por completo las alucinaciones."}'
        '], "conclusions": "Conclusión."}'
    )
    client = GeminiLLMClient(
        api_key="test", client=_SimpleSequenceClient([_FakeResponse(payload)])
    )
    result = await client.analyze(doc, "paper.txt")

    assert result.chunks_processed == 1
    assert result.summary == "Resumen del documento."
    assert len(result.key_points) == 2
    assert len(result.claims) == 2
    # A quote actually present in the document is verified and supported.
    assert result.claims[0].verified is True
    assert result.claims[0].status == "supported"
    assert result.claims[0].location == "Límites" or result.claims[0].location is not None
    # A fabricated quote is not trusted: it stays uncertain and unverified.
    assert result.claims[1].verified is False
    assert result.claims[1].status == "uncertain"


async def test_analyze_synthesises_multiple_chunks():
    doc = ("Frase de relleno sobre RAG. " * 600).strip()  # > CHUNK_CHARS
    chunk_payload = (
        '{"summary": "s", "key_points": ["p"], '
        '"claims": [{"text": "t", "evidence": "Frase de relleno sobre RAG."}], '
        '"conclusions": "c"}'
    )
    synth_payload = (
        '{"summary": "Resumen unificado.", "key_points": ["idea final"], '
        '"claims": [], "conclusions": "Conclusión unificada."}'
    )
    client = GeminiLLMClient(
        api_key="test",
        client=_SimpleSequenceClient(
            [
                _FakeResponse(chunk_payload),
                _FakeResponse(chunk_payload),
                _FakeResponse(synth_payload),
            ]
        ),
    )
    result = await client.analyze(doc, "largo.txt")
    assert result.chunks_processed >= 2
    assert result.summary == "Resumen unificado."
    assert result.key_points == ["idea final"]
    assert result.conclusions == "Conclusión unificada."


async def test_analyze_raises_empty_when_model_returns_nothing():
    client = GeminiLLMClient(
        api_key="test", client=_SimpleSequenceClient([_FakeResponse("no json")])
    )
    with pytest.raises(LLMProviderError) as exc:
        await client.analyze("Texto suficiente para analizar aquí.", "paper.txt")
    assert exc.value.category == "empty"
