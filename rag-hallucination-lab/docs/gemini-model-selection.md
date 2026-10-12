# Gemini model selection

This document records **how the default Gemini model was chosen** and why the
model name lives in exactly one place.

## Single source of truth

The model name is defined once, in
[`backend/app/core/config.py`](../backend/app/core/config.py):

```python
gemini_model: str = "gemini-3.5-flash-lite"
```

Every call site reads `settings.gemini_model`; nothing else hard-codes a model
name. To use a different model, set the `GEMINI_MODEL` environment variable in
`backend/.env` (it is left commented out in `.env.example` on purpose, so the
code default is the authoritative value). `GET /api/health` reports the resolved
model, and each response carries it in `model`, so the running configuration is
always observable.

## Candidates tested

The candidates below were exercised against the configured API key (Google AI
Studio). "Sustained" means repeated calls over time, not a single request.

| Model | Observed result | Verdict |
| --- | --- | --- |
| `gemini-flash-latest` (previous default) | HTTP **429** (quota exhausted) | Rejected |
| `gemini-2.5-*` / `gemini-2.0-flash` | HTTP **404** (retired for new users) | Rejected |
| `gemini-3.5-flash` | Works, but **429 after ~5** rapid calls | Rejected |
| `gemini-flash-lite-latest` (alias) | **429 after 1** call | Rejected |
| **`gemini-3.5-flash-lite`** | **15/15** sustained calls OK | **Chosen** |

## Why `gemini-3.5-flash-lite`

- **Stable under sustained use.** It was the only candidate that kept answering
  across a 15-call sequence; the others hit rate/quota limits quickly or are no
  longer served to new accounts.
- **"Lite" is enough for this workload.** The generation and verification prompts
  are short and constrained (answer from retrieved fragments, cite ids, emit a
  machine-readable `EVIDENCIA:` marker, classify claims). A fast, inexpensive
  model keeps the demo responsive and the quota healthy.
- **No hard pinning problem.** A model can still be overridden without touching
  code via `GEMINI_MODEL`; if Google ever retires this one, the change is a single
  line in `config.py` (or an env var).

## How the app behaves when a model fails

Model/availability problems never degrade silently into fabricated answers. A
provider failure is a real HTTP error, mapped by category (see the README's
"Error handling" table): rate limits return **429**, unavailable models **503**,
auth failures **502**, and a missing key or SDK **500**. The error body is a clear
`detail` message and the API key is never included in a response or a log line.

In offline/mock mode (`LLM_PROVIDER=mock`) no model is contacted at all and the
provider reports `mock` with `model: null`.
