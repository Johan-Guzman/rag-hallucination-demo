# RAG Hallucination Lab

Interactive educational demo demonstrating that **RAG reduces but does not eliminate hallucinations** in Large Language Models.

## Overview

This demo visually explains the central thesis of our paper:

> **"Hallucinations in Large Language Models: The Limits of Retrieval-Augmented Generation (RAG) as a Mitigation Mechanism"**

The key insight: **RAG REDUCES hallucinations, but does NOT eliminate them.**

## Features

- **Three comparison modes**: LLM Only, RAG, RAG + Evaluation
- **Pipeline visualization**: Query → Retrieval → Context → Generation → Evaluation
- **Five demo cases** covering:
  1. Hallucination Risk (LLM only)
  2. Grounded Answer (RAG working correctly)
  3. Retrieval Failure (relevant info not found)
  4. **Groundedness Failure** (key paper finding: correct retrieval, wrong generation)
  5. Citation Failure (citation doesn't support claim)
- **Claim-level analysis**: Supported / Unsupported / Contradicted / Uncertain
- **Evaluation metrics**: Retrieval, Groundedness, Citation (illustrative only)
- **Educational explanations** for each failure mode
- **Research basis** with real paper references
- **Full MOCK MODE** - runs without any API keys

## Architecture

```
Frontend (Next.js + TypeScript + Tailwind)
    ↓ HTTP
Backend (FastAPI + Python)
    ↓
RAG Service (Mock implementation)
    ↓
Vector Store (Chroma - mock in demo)
    ↓
LLM (Mock - returns predefined responses)
    ↓
Evaluation (Mock metrics)
```

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

The backend healthcheck targets `/api/health` and uses Python's standard library
(the `python:3.11-slim` image has no `curl`). The frontend waits for the backend
to report healthy before starting.

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Backend (backend/.env)
LLM_PROVIDER=mock          # mock, openai, anthropic
OPENAI_API_KEY=            # Required if not mock
ANTHROPIC_API_KEY=         # Required if not mock
MOCK_MODE=true             # Set false to use real APIs
DATA_DIR=./data            # Knowledge base dir (documents + demo_cases.json)
CHROMA_PERSIST_DIR=./data/chroma
CORS_ORIGINS=*             # Comma-separated list of allowed origins

# Frontend (frontend/.env.local)
NEXT_PUBLIC_API_URL=       # Empty => same-origin proxy (recommended)
# BACKEND_URL=http://localhost:8000  # Proxy target; set by Docker Compose
```

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

When `MOCK_MODE=true`:
- No external API calls are made
- Predefined responses simulate all pipeline stages
- Retrieval scores are simulated
- Groundedness and citation metrics are illustrative
- All 5 demo cases work reproducibly

The mock RAG service (`backend/app/services/rag_service.py`) is fully
self-contained: it loads the five documents and `demo_cases.json` from
`DATA_DIR` and keeps everything in memory. **There is no Chroma dependency in
MOCK MODE** — `CHROMA_PERSIST_DIR` is reserved for a future real vector store.

This enables offline presentation at conferences.

## API Endpoints

All routes are mounted under the `/api` prefix.

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/health` | — | `{ status, mock_mode, version }` |
| POST | `/api/query` | `{ query, mode, top_k }` | `QueryResponse` (answer, documents, claims, evaluation, pipeline) |
| GET | `/api/documents` | — | `{ documents: Document[] }` |
| GET | `/api/demo-cases` | — | `{ cases: DemoCase[] }` |
| GET | `/` | — | API metadata |
| GET | `/docs` | — | Interactive OpenAPI docs |

`mode` is one of `llm`, `rag`, `rag_eval`.

## Demo Cases

| Case | Mode | Query | Demonstrates |
|------|------|-------|--------------|
| `no_rag_hallucination` | LLM | "Does RAG completely eliminate hallucinations?" | LLM confidently states false claims |
| `rag_correct` | RAG | "What problem does RAG mitigate?" | Successful retrieval + grounded generation |
| `retrieval_failure` | RAG | "What embedding model for biomedical domain?" | Relevant info exists but not retrieved |
| `groundedness_failure` | RAG+Eval | "What hallucination elimination rate does RAG achieve?" | **KEY: Correct retrieval, ungrounded generation** |
| `citation_failure` | RAG+Eval | "What does document_03 say about perfect retrieval?" | Citation contradicts the claim |

### Running a Demo

1. Select mode (LLM / RAG / RAG + Evaluation)
2. Click a demo case in the sidebar → "Run This Case"
3. Or type your own question and press Enter

## Documents

The demo uses 5 controlled documents in `data/`:

- `document_01.txt` - What is RAG
- `document_02.txt` - Retrieval and Embeddings
- `document_03.txt` - Groundedness and Faithfulness
- `document_04.txt` - Citation Failure
- `document_05.txt` - Limitations of RAG

All content is factual and sourced from real papers.

## Evaluation Metrics

**⚠️ Demo metrics — illustrative only**

| Metric | Meaning |
|--------|---------|
| Retrieval | Quality of document retrieval (0-100%) |
| Groundedness | Answer claims supported by retrieved docs (0-100%) |
| Citation | Citations accurately support claims (0-100%) |

These are **simulated** in MOCK MODE and should not be presented as scientific results.

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
│   │   ├── api/routes.py          # FastAPI endpoints
│   │   ├── core/config.py         # Settings management
│   │   ├── models/schemas.py      # Pydantic models
│   │   └── services/rag_service.py # Mock RAG implementation
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/page.tsx           # Main dashboard
│   │   ├── components/            # React components
│   │   ├── lib/api.ts             # API client
│   │   ├── lib/utils.ts           # Helpers
│   │   └── types/index.ts         # TypeScript types
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── next.config.js             # Same-origin /api proxy -> BACKEND_URL
│   ├── .env.example               # Frontend env template
│   └── Dockerfile
├── data/
│   ├── document_01.txt ... document_05.txt
│   └── demo_cases.json
├── docker-compose.yml
└── README.md
```

## Presentation Guide

1. **Start with LLM mode** - Show hallucination risk
2. **Switch to RAG** - Show correct grounded answer
3. **Show Retrieval Failure** - RAG can't answer what it doesn't know
4. **Show Groundedness Failure (KEY)** - Correct retrieval BUT wrong answer
5. **Show Citation Failure** - Citation looks valid but contradicts claim
6. **Explain the thesis**: Retrieval ≠ Grounded Generation

## License

MIT License - Educational use encouraged.

## Disclaimer

This is an **educational demonstration**. Metrics are simulated for illustration. Not a benchmark or scientific evaluation tool.