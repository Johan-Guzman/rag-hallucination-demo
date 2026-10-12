"""HTTP-level demonstration of the Gemini integration.

Exercises the real FastAPI routes (via httpx ASGITransport, so no server is
needed) to prove the full flow: load documents -> query -> grounded Gemini
answer. It also shows the with-RAG vs without-RAG comparison and the
insufficient-evidence behavior. The API key is never printed.

Usage (PowerShell)::

    cd backend
    $env:LLM_PROVIDER = "gemini"   # key from backend/.env
    python scripts/gemini_http_demo.py "¿Qué es RAG y qué limitaciones tiene?"
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402


DEFAULT_QUESTION = "¿Qué es RAG y qué limitaciones tiene según los documentos?"
NO_EVIDENCE_QUESTION = "¿Cuál es la capital de Francia y cuántos habitantes tiene?"


def _print_query_response(label: str, response) -> None:
    print("\n" + "-" * 72)
    if response.status_code != 200:
        detail = response.json().get("detail", response.text)
        print(f"{label}  -> HTTP {response.status_code} (provider error)")
        print(f"  {detail}")
        return
    body = response.json()
    print(f"{label}  (mode={body['mode']}, provider={body.get('provider')}, "
          f"model={body.get('model')})")
    print("-" * 72)
    print("Retrieved fragments:")
    for doc in body["documents"]:
        print(f"  - {doc['id']} (score={doc['score']:.2f})")
    print(f"Answer:\n  {body['answer']}")
    print(f"Evidence sufficient: {body.get('evidence_sufficient')}")
    print("Validated claims:")
    for claim in body["claims"]:
        print(f"  [{claim['status']}] source={claim['source'] or '-'} :: {claim['text']}")
    print("Evaluation:", json.dumps(body["evaluation"]))
    print("Pipeline  :", json.dumps(body["pipeline"]))


async def main() -> int:
    question = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_QUESTION
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        health = (await client.get("/api/health")).json()
        print("Health:", json.dumps(
            {k: health.get(k) for k in ("provider", "model", "gemini_configured", "mock_mode")}
        ))
        docs = (await client.get("/api/documents")).json()["documents"]
        print(f"Loaded {len(docs)} documents: {[d['id'] for d in docs]}")

        if health.get("provider") != "gemini":
            print("\nLLM_PROVIDER is not 'gemini'. Set LLM_PROVIDER=gemini to run this demo.")
            return 2

        with_rag = await client.post(
            "/api/query", json={"query": question, "mode": "rag", "top_k": 5}
        )
        _print_query_response("CON RAG", with_rag)

        without_rag = await client.post(
            "/api/query", json={"query": question, "mode": "llm"}
        )
        _print_query_response("SIN RAG (solo pregunta)", without_rag)

        no_evidence = await client.post(
            "/api/query", json={"query": NO_EVIDENCE_QUESTION, "mode": "rag", "top_k": 5}
        )
        _print_query_response("CON RAG (evidencia insuficiente)", no_evidence)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
