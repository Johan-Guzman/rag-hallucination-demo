# RAG Hallucination Lab

Interactive educational demo demonstrating that **RAG reduces but does not eliminate hallucinations** in Large Language Models.

## Overview

This demo visually explains the central thesis of our paper:

> **"Hallucinations in Large Language Models: The Limits of Retrieval-Augmented Generation (RAG) as a Mitigation Mechanism"**

The key insight: **RAG REDUCES hallucinations, but does NOT eliminate them.**

## Features

- **Three comparison conditions**, named consistently everywhere
  (frontend, backend, charts):
  - **A · Sin evidencia** (`llm`) — no-retrieval baseline
  - **B · Con evidencia** (`rag`) — retrieves fragments and cites them
  - **C · Con verificación** (`rag_eval`) — B plus per-claim verification
- **Pipeline visualization**: Query → Retrieval → Context → Generation → Evaluation
- **Five demo cases** covering:
  1. Hallucination Risk (LLM only)
  2. Grounded Answer (RAG working correctly)
  3. Retrieval Failure (relevant info not found)
  4. **Groundedness Failure** (key paper finding: correct retrieval, wrong generation)
  5. Citation Failure (citation doesn't support claim)
- **Experiments**: run the same questions over the same documents in all three
  conditions; every cell records a real response and its metrics.
- **Compare**: aggregate saved runs into bar charts (hand-rolled, no chart
  library) and a numeric table per metric, filterable by run and by question.
  Diagrams reuse reusable components from `components/charts/MetricCharts.tsx`.
- **Claim-level analysis**: Supported / Unsupported / Contradicted / Uncertain
- **Real, reproducible metrics** computed from what the pipeline emits
  (groundedness, citation attribution, unsupported rate, abstention, retrieval
  proxy, latency). Undefined metrics are shown as **N/D**, never as `0`.
- **Paper Analysis**: upload a document and get real statistics plus an optional
  deep LLM analysis (summary, key ideas, claims with verbatim evidence,
  conclusions); long documents are chunked and synthesized.
- **Educational explanations** for each failure mode
- **Research basis** with real paper references
- **Pluggable LLM provider**:
  - **Full MOCK MODE** – runs without any API keys (default, reproducible)
  - **Google Gemini** – live generation grounded on the retrieved fragments,
    with validated citations, insufficient-evidence detection and graceful
    provider-error handling

## Architecture

```
Frontend (Next.js + TypeScript + Tailwind)
    ↓ HTTP
Backend (FastAPI + Python)
    ↓
RAG Service (retrieval + context building)
    ↓
Vector Store (Chroma - mock/in-memory in demo)
    ↓
LLM provider (pluggable)
    ├── Mock   - predefined responses, no API calls
    └── Gemini - Google Gen AI SDK (google-genai), grounded on retrieved fragments
    ↓
Metrics (derived from the real response, claims and retrieval; never fixed constants)
```

The retrieval/indexing stage is unchanged: both providers consume the **same**
retrieved documents. Only the generation stage is swapped, so the
with-RAG vs without-RAG comparison stays valid.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker (optional)

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at: http://localhost:8000
API docs at: http://localhost:8000/docs
Health check: http://localhost:8000/api/health

By default this runs in **mock mode**. To use Gemini, set `LLM_PROVIDER=gemini`
and a valid `GEMINI_API_KEY` in `backend/.env` (see
[Google Gemini Integration](#google-gemini-integration-live-mode)) and start the
server again — no code change is required.

The knowledge base is auto-detected from `DATA_DIR`, the current working
directory, or the repository `data/` folder, so it also works when the server is
started from inside `backend/`.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:3000

### Docker (Both Services)

From the project root (`rag-hallucination-lab/`):

```bash
docker compose up --build
```

- Backend: http://localhost:8000 (health: http://localhost:8000/api/health)
- Frontend: http://localhost:3000

Compose loads the backend service configuration from **`backend/.env`** (the same
file used for local runs), so to run the stack against Gemini you just edit that
file and restart:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your Google AI Studio key>
```

The file is excluded from the image by `.dockerignore`, so the key is never baked
into the image. The health check reports the active provider at
http://localhost:8000/api/health (`provider`, `model`, `gemini_configured`).

The backend healthcheck targets `/api/health` and uses Python's standard library
(the `python:3.11-slim` image has no `curl`). The frontend waits for the backend
to report healthy before starting.

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Backend (backend/.env)
LLM_PROVIDER=mock          # mock (offline demo) or gemini (live)
OPENAI_API_KEY=            # Reserved (no provider implemented yet)
ANTHROPIC_API_KEY=         # Reserved (no provider implemented yet)
MOCK_MODE=                 # unset => LLM_PROVIDER decides; false => force real APIs

# Google Gemini (only when LLM_PROVIDER=gemini)
GEMINI_API_KEY=            # NEVER commit; backend-only
# The model name lives in backend/app/core/config.py (single source of truth,
# default: gemini-3.5-flash-lite). Uncomment only to override it.
# GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TEMPERATURE=0.0
GEMINI_MAX_OUTPUT_TOKENS=2048

DATA_DIR=./data            # Knowledge base dir (documents + demo_cases.json)
CHROMA_PERSIST_DIR=./data/chroma
CORS_ORIGINS=*             # Comma-separated list of allowed origins

# Frontend (frontend/.env.local)
NEXT_PUBLIC_API_URL=       # Empty => same-origin proxy (recommended)
# BACKEND_URL=http://localhost:8000  # Proxy target; set by Docker Compose
```

`GEMINI_API_KEY` is read only by the backend, is never sent to the frontend,
never appears in API responses or logs, and `.env` is gitignored. Prefer a
Google AI Studio key and keep it out of source control.

`GEMINI_MAX_OUTPUT_TOKENS` is clamped to a safe ceiling (65536, the limit of the
current Flash models) and `LLM_PROVIDER` is normalized to lowercase, so an
invalid value (e.g. a typo or an absurd token limit) is reported in the logs and
cannot make every request fail.

The backend resolves this file by **absolute path** (`backend/.env`), so the
configuration is loaded no matter which directory you start the server from
(`cd backend && uvicorn app.main:app`, `uvicorn app.main:app --app-dir backend`,
Docker, tests, …). Docker Compose reads the *same* file (see
[Docker with Gemini](#docker-with-gemini)), so there is a single source of truth.

### How the frontend talks to the backend

All API calls are centralized in `frontend/src/lib/api.ts` and use the `/api`
prefix, e.g. `GET /api/health`.

By default (`NEXT_PUBLIC_API_URL` empty) requests are sent **same-origin** and
Next.js proxies them to the backend through the rewrite in `next.config.js`:

- Browser (or any client) → `http://localhost:3000/api/...`
- Next.js server → `BACKEND_URL` (Docker Compose: `http://backend:8000`;
  local default: `http://localhost:8000`)

Using a same-origin proxy avoids CORS issues and the classic Docker mistake of
pointing `localhost` at the frontend container instead of the backend service.
Setting `NEXT_PUBLIC_API_URL` to an absolute URL bypasses the proxy and makes
the browser call the backend directly.

## MOCK MODE

**The demo works completely without API keys.**

Use mock mode when you want the fully offline demo: `LLM_PROVIDER=mock` with
`MOCK_MODE` unset (the default). The mock RAG service
(`backend/app/services/rag_service.py`) is fully self-contained: it loads the five
documents and `demo_cases.json` from `DATA_DIR` and keeps everything in memory. No
external API calls are made, and all 5 demo cases work reproducibly. Metrics are
still *computed* from the emitted answer, claims and retrieval (they are not fixed
constants), but the answers themselves come from the curated demo set, so they
describe that mock run rather than a live LLM. **There is no Chroma dependency in
mock mode** — `CHROMA_PERSIST_DIR` is reserved for a future real vector store. This
enables offline presentation at conferences.

### How `MOCK_MODE` and `LLM_PROVIDER` interact

`LLM_PROVIDER` selects the provider; `MOCK_MODE` is the "use real APIs" override.
The effective provider is resolved once at startup:

| `LLM_PROVIDER` | `MOCK_MODE` | Effective provider |
| --- | --- | --- |
| `gemini` | any | **gemini** (explicit selection always wins) |
| `mock` | `false` | **gemini** (real APIs requested) |
| `mock` | `true` / unset | mock |

`MOCK_MODE=false` is therefore **not** silently ignored: it enables the real
provider even if `LLM_PROVIDER` was left at its default. If a real provider is
requested without a `GEMINI_API_KEY`, the backend logs an error and generation
fails with a clear HTTP error (never a fabricated answer). To go back to the
offline demo, set `MOCK_MODE=true` (or unset it and set `LLM_PROVIDER=mock`).

`GET /api/health` always reports the resolved state via `provider` and
`mock_mode`, so a contradiction in `.env` can never be mistaken for the real
running configuration.

## Google Gemini Integration (live mode)

Set `LLM_PROVIDER=gemini` and a valid `GEMINI_API_KEY` to route generation
through Google's official **`google-genai`** SDK. Retrieval, document loading and
context construction are **not** changed — Gemini receives exactly the fragments
the existing RAG stage retrieved.

```bash
# backend/.env
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your Google AI Studio key>
# GEMINI_MODEL is optional; the default (gemini-3.5-flash-lite) lives in
# backend/app/core/config.py and can be overridden here if your key needs another.
```

### What Gemini receives

- **RAG / RAG + Eval:** the user question plus the retrieved fragments, each
  labelled with its id (`[document_01]`), score and file name.
- **LLM Only (without RAG):** the question only — no retrieval runs, so the
  comparison condition is explicit.

The prompt instructs the model to answer **only** from the provided fragments,
to cite with `[document_id]`, and to say when the evidence is insufficient. The
model ends every answer with a machine-readable
`EVIDENCIA: SUFICIENTE|INSUFICIENTE` marker.

### Citation safety

After generation, every citation is validated against the retrieved set. Any
citation that does not point at a retrieved fragment (e.g. an invented
`[document_99]`) is **removed from the answer** and flagged as a warning in the
pipeline. Claims returned by the API only reference validated fragments. A
response truncated by the model's output-token limit is also cleaned up: an
incomplete trailing citation such as `[document_0` is dropped instead of being
shown to the user.

### Model choice

The default model is **`gemini-3.5-flash-lite`**, the only candidate that
survived sustained use against the configured key. The name lives in exactly one
place — `gemini_model` in `backend/app/core/config.py` — and can be overridden
with the `GEMINI_MODEL` environment variable. The full comparison
(`gemini-flash-latest` → 429, `gemini-2.5-*`/`gemini-2.0-flash` → 404 retired,
`gemini-3.5-flash` → 429 after ~5 calls, `gemini-flash-lite-latest` → 429 after
1, `gemini-3.5-flash-lite` → 15/15 OK) is documented in
[`docs/gemini-model-selection.md`](docs/gemini-model-selection.md).

Model availability depends on the API key's project; if the configured model is
not enabled, the request fails with a clear message rather than falling back to a
fabricated answer. The chosen model shows up in `/api/health` and in each
`QueryResponse`.

### Error handling

A generation failure is returned as a **real HTTP error**, never as an HTTP 200
that could be mistaken for a Gemini answer, and it is logged. The status is
derived from the failure category:

| Category | When | HTTP status |
|----------|------|-------------|
| `config` | `GEMINI_API_KEY` missing / SDK not installed | 500 |
| `auth` | Gemini rejected the key | 502 |
| `rate_limit` | Quota / rate limit exceeded | 429 |
| `unavailable` | Model or provider temporarily unavailable | 503 |
| `empty` / `unknown` | Empty or unexpected provider response | 502 |

The response body is `{ "detail": "<clear message>" }`. The API key is never
included in any response or log line. Successful Gemini responses that
*legitimately* cannot answer from the retrieved fragments are still HTTP 200 with
`evidence_sufficient: false` — that is a valid answer, not a failure.

### Verifying Gemini is actually used

Three independent signals, from fastest to most definitive:

1. **Health endpoint** — `GET /api/health` returns
   `{"provider":"gemini","model":"gemini-3.5-flash-lite","gemini_configured":true}`.
   In mock mode `provider` is `mock` and `model` is `null`.
2. **Server logs** — on startup the backend logs the resolved provider, and every
   generation logs the outbound call and its outcome (never the key):
   ```
   RAG Hallucination Lab API | provider=gemini | model=gemini-3.5-flash-lite | gemini_configured=True
   Calling Gemini API | model=gemini-3.5-flash-lite mode=rag context_fragments=5
   Gemini API responded | model=gemini-3.5-flash-lite chars=3073
   ```
   A provider failure logs `Gemini API call failed | model=... category=rate_limit`
   and the request returns a non-2xx status. In mock mode you instead see
   `Serving query with mock provider (offline, no external API call)`.
3. **The answer itself** — a real Gemini answer cites retrieved fragments
   (`[document_01]`, grouped `[document_02, document_05]`) written in prose,
   whereas the mock provider returns curated demo-case text. The response carries
   `provider: "gemini"` and the model name, and the UI shows a `gemini ·
   <model>` badge (instead of `Mock Mode`).

### Live smoke test

```bash
cd backend
# PowerShell
$env:LLM_PROVIDER="gemini"
$env:GEMINI_API_KEY="<your-key>"   # or put it in backend/.env
python scripts/gemini_smoke_test.py "¿Qué es RAG y qué limitaciones tiene según los documentos?"
```

The script prints the retrieved fragments, the grounded answer, the validated
citations, the evaluation and the pipeline state.

## API Endpoints

All routes are mounted under the `/api` prefix.

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/health` | — | `{ status, mock_mode, version, provider, model, gemini_configured, documents, uploaded_documents }` |
| POST | `/api/query` | `{ query, mode, top_k, document_ids }` | `QueryResponse` (answer, documents, claims, evaluation, pipeline, provider, model, evidence_sufficient, metrics) or an HTTP error (`detail`) on provider failure |
| GET | `/api/documents` | — | `{ documents: DocumentRecord[] }` (metadata only; bodies on demand) |
| GET | `/api/documents/{id}` | — | `DocumentDetail` (includes `content`) |
| POST | `/api/documents/upload` | multipart `files[]` | `{ results: UploadResult[], documents: DocumentRecord[] }` |
| DELETE | `/api/documents/{id}` | — | `{ deleted }` (built-in corpus documents cannot be deleted) |
| POST | `/api/documents/analyze` | `{ document_ids, include_summary, deep }` | `DocumentAnalysis[]` (local stats always; summary/claims/conclusions when a provider is active) |
| POST | `/api/experiments/run` | `{ questions[], modes[], document_ids?, top_k }` | `Experiment` (cells + aggregates, persisted) |
| GET | `/api/experiments` | — | `ExperimentSummary[]` |
| GET | `/api/experiments/comparison` | `?ids=a,b&question=…` | `ExperimentComparison` (per-run + overall aggregates) |
| POST | `/api/experiments/demo` | — | `Experiment` labelled `is_demo: true` |
| GET | `/api/experiments/{id}` | — | `Experiment` |
| DELETE | `/api/experiments/{id}` | — | `{ deleted }` |
| GET | `/api/demo-cases` | — | `{ cases: DemoCase[] }` |
| GET | `/` | — | API metadata |
| GET | `/docs` | — | Interactive OpenAPI docs |

`mode` is one of `llm` (A · Sin evidencia), `rag` (B · Con evidencia) or
`rag_eval` (C · Con verificación). The preset demo cases are answered live by the
active provider; with `LLM_PROVIDER=mock` they keep their curated, reproducible
answers. A provider failure (missing key, rate limit, retired model) is returned
as a real HTTP error with a clear `detail` message — never a fabricated answer.

## Demo Cases

| Case | Mode | Query | Demonstrates |
|------|------|-------|--------------|
| `no_rag_hallucination` | LLM | "Does RAG completely eliminate hallucinations?" | LLM confidently states false claims |
| `rag_correct` | RAG | "What problem does RAG mitigate?" | Successful retrieval + grounded generation |
| `retrieval_failure` | RAG | "What embedding model for biomedical domain?" | Relevant info exists but not retrieved |
| `groundedness_failure` | RAG+Eval | "What hallucination elimination rate does RAG achieve?" | **KEY: Correct retrieval, ungrounded generation** |
| `citation_failure` | RAG+Eval | "What does document_03 say about perfect retrieval?" | Citation contradicts the claim |

### Running a demo

The three conditions can be exercised in two ways from the **Experiments** page:

1. **Batería de preguntas** — write one question per line, pick the conditions
  (A/B/C), choose the source documents and run. Every question is executed in
   each selected condition and the results are persisted.
2. **Consulta rápida** — run a single question in one condition, or pick one of
  the shipped demo cases (marked "demo"; in mock mode their answers come from the
  curated set, not from a live LLM) and inspect the pipeline, evidence and claims.

Saved runs then appear in **Experiments** (charts + per-question comparison) and
in **Compare** (cross-run aggregation).

## Documents

The demo uses 5 controlled documents in `data/`:

- `document_01.txt` - What is RAG
- `document_02.txt` - Retrieval and Embeddings
- `document_03.txt` - Groundedness and Faithfulness
- `document_04.txt` - Citation Failure
- `document_05.txt` - Limitations of RAG

All content is factual and sourced from real papers.

## Metrics

Metrics are computed from signals the pipeline actually emits — the generated
answer, the claims after verification, the retrieved fragments and the measured
latency. They are **not** decorative constants. A metric that is undefined for a
condition is reported as **N/D** (never `0`, which would look like a measured
failure) and excluded from averages.

| Metric | Meaning |
|--------|---------|
| Groundedness | Supported claims / total claims. For condition C each claim is judged individually. |
| Citation attribution | Citations pointing at actually-retrieved fragments / citations emitted. Undefined without retrieval (condition A). |
| Unsupported rate | Unsupported or contradicted claims / total claims (lower is better). |
| Abstention | Share of answers where the system recognises the evidence is insufficient instead of inventing. |
| Retrieval relevance (proxy) | Mean heuristic (Jaccard) score of retrieved fragments — a relevance proxy, **not** a ground-truth recall. Undefined without retrieval. |
| Latency | Mean backend response time, in milliseconds. |

In **mock mode** the responses come from the curated demo set, so the metrics are
real measurements *of that run* but not of a live LLM. Run with
`LLM_PROVIDER=gemini` for metrics of real generation (condition C then runs the
claim verifier, so B and C genuinely differ).

## Experiments and Compare

- **Experiments** (`/experiments`): a single section with two tabs — *Batería de
  preguntas* runs the same questions across A/B/C and persists the run; *Consulta
  rápida* runs a single query and shows the pipeline, evidence and claims. Charts
  and a per-question comparison are rendered from the saved run.
- **Compare** (`/compare`): reads the backend comparison endpoint and aggregates
  the selected saved runs into bar charts plus a numeric table per metric, with a
  filter by run and by question. Every visualisation is labelled with its data
  source; a "Run demo" button creates a clearly-marked demo run.

## Paper Analysis

`/paper-analysis` performs a real pipeline: upload (validated) → text extraction
→ analysis. Local statistics (words, characters, sentences, paragraphs,
headings, frequent terms) are always computed from the stored text. Choosing deep
analysis adds an LLM pass (chunked map-reduce for long documents) that returns a
summary, key points, claims and conclusions.

A claim is marked **supported** only when its verbatim `evidence` quote is found
back in the document text; otherwise it is **uncertain** — invented citations are
never presented as support. Empty, unreadable or unsupported files are reported
as errors and are not added to the searchable corpus.

## Pipeline Stages

Each stage shows status:
- ⚪ **IDLE** - Not yet executed
- 🔄 **PROCESSING** - In progress
- ✅ **SUCCESS** - Completed successfully
- ⚠️ **WARNING** - Completed with issues
- ❌ **FAILURE** - Failed

Click any stage for details (future enhancement).

## Claim Statuses

| Status | Icon | Meaning |
|--------|------|---------|
| Supported | ✅ | Claim backed by cited source |
| Unsupported | ⚠️ | Claim lacks source support |
| Contradicted | ❌ | Source contradicts claim |
| Uncertain | ❓ | Insufficient info to verify |

## Research References

Real papers (no invented citations):
- Lewis et al. (2020) — Retrieval-Augmented Generation
- Ji et al. (2023) — Survey of Hallucination
- Shuster et al. (2021) — Retrieval Augmentation Reduces Hallucination
- Magesh et al. (2025) — Hallucination-Free?
- Huang et al. (2025) — Survey on Hallucination

## Project Structure

```
rag-hallucination-lab/
├── backend/
│   ├── app/
│   │   ├── api/routes.py           # FastAPI endpoints
│   │   ├── core/config.py          # Settings management (incl. Gemini model)
│   │   ├── models/schemas.py       # Pydantic models
│   │   └── services/
│   │       ├── rag_service.py      # Retrieval + generation + analysis
│   │       ├── experiment.py       # Experiment runner + persistence + comparison
│   │       ├── metrics.py          # Real per-response + aggregate metrics
│   │       ├── document_store.py   # Corpus storage / retrieval
│   │       └── llm_client.py       # Pluggable LLM providers (mock / Gemini)
│   ├── scripts/gemini_smoke_test.py# Live end-to-end Gemini check
│   ├── tests/                      # pytest suite (offline, stubs the SDK)
│   ├── requirements.txt
│   ├── requirements-dev.txt        # pytest + pytest-asyncio
│   ├── pytest.ini
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Overview
│   │   │   ├── documents/page.tsx  # Upload, corpus, local analysis
│   │   │   ├── experiments/page.tsx# Batch runs A/B/C + quick query
│   │   │   ├── compare/page.tsx    # Cross-run comparison + charts
│   │   │   ├── paper-analysis/page.tsx
│   │   │   └── research-basis/page.tsx
│   │   ├── components/
│   │   │   └── charts/MetricCharts.tsx  # Reusable chart components
│   │   ├── lib/api.ts              # API client
│   │   └── types/index.ts          # TypeScript types
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── next.config.js              # Same-origin /api proxy -> BACKEND_URL
│   ├── .env.example                # Frontend env template
│   └── Dockerfile
├── data/
│   ├── document_01.txt ... document_05.txt
│   └── demo_cases.json
├── docs/gemini-model-selection.md  # Why gemini-3.5-flash-lite
├── docker-compose.yml
└── README.md
```

## Testing

The test suite is offline: it fakes the Gemini SDK, so no API key or network is
needed. It covers retrieval reuse, citation validation (including invented
citations), insufficient-evidence handling, provider error mapping (provider
failures raise a typed error and map to a non-2xx HTTP status instead of a fake
200 answer), deep document analysis (chunking + verbatim-quote verification), the
experiment runner (comparison across runs, question filter, demo flag), the
comparison and demo endpoints, safe output-token clamping and CWD-independent
`.env` resolution.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   |   Unix: source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

### Docker with Gemini

Docker Compose reads the provider configuration from **`backend/.env`** (the same
file used for local runs) and never bakes it into the image. To run the stack
against Gemini, edit `backend/.env`:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your Google AI Studio key>
# GEMINI_MODEL is optional; the default lives in backend/app/core/config.py
```

then start the stack and confirm the provider:

```bash
docker compose up --build
# in another shell:
curl http://localhost:8000/api/health   # -> "provider":"gemini", "gemini_configured":true
docker compose logs -f backend           # -> "Calling Gemini API | model=gemini-3.5-flash-lite ..."
```

If `backend/.env` is missing, the stack still starts in the default mock mode.
Never commit the key: `backend/.env` is gitignored and excluded from the image by
`.dockerignore`.


## Presentation Guide

1. **Condition A (Sin evidencia)** — show hallucination risk from parametric knowledge
2. **Switch to B (Con evidencia)** — show the grounded answer
3. **Show Retrieval Failure** — RAG can't answer what it doesn't retrieve
4. **Show Groundedness Failure (KEY)** — correct retrieval BUT wrong answer
5. **Show Citation Failure** — a citation that looks valid but contradicts the claim
6. **Explain the thesis**: retrieval ≠ grounded generation

## License

MIT License - Educational use encouraged.

## Disclaimer

This is an **educational demonstration**. Metrics are computed from the signals the
pipeline actually emits and are shown with their definitions and sample counts;
they are still not a peer-reviewed benchmark. In mock mode the answers come from a
curated set, so treat those numbers as a demo of the measurement pipeline, not as
scientific results.