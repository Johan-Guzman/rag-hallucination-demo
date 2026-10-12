"""Live end-to-end smoke test for the Gemini integration.

It loads the knowledge base, runs the existing retrieval stage, sends the
question plus the retrieved fragments to Gemini, and prints the grounded answer
with its validated citations. It never prints the API key.

Usage (PowerShell)::

    cd backend
    $env:LLM_PROVIDER = "gemini"
    $env:GEMINI_API_KEY = "<your-key>"     # or put it in backend/.env
    python scripts/gemini_smoke_test.py "¿Qué es RAG y qué limitaciones tiene?"

Exits with code 2 when the provider is not Gemini / the key is missing, so it is
safe to run in CI without secrets.
"""

from __future__ import annotations

import asyncio
import os
import sys

# Make ``app`` importable when the script is run directly from backend/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402
from app.models.schemas import Mode, QueryRequest  # noqa: E402
from app.services.llm_client import LLMProviderError  # noqa: E402
from app.services.rag_service import rag_service  # noqa: E402


DEFAULT_QUESTION = "¿Qué es RAG y qué limitaciones tiene según los documentos?"


async def main() -> int:
    if rag_service.provider != "gemini":
        print("LLM_PROVIDER is not 'gemini'. Set LLM_PROVIDER=gemini to run this test.")
        return 2
    if not settings.gemini_api_key:
        print("GEMINI_API_KEY is not set. Add it to backend/.env or the environment.")
        return 2

    question = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_QUESTION

    print("=" * 72)
    print(f"Provider : {rag_service.provider}")
    print(f"Model    : {rag_service.model}")
    print(f"Documents: {[d.id for d in rag_service.get_all_documents()]}")
    print("=" * 72)

    try:
        response = await rag_service.query(
            QueryRequest(query=question, mode=Mode.RAG, top_k=5)
        )
    except LLMProviderError as exc:
        print(
            f"\nGemini generation failed (category={exc.category}): {exc.message}"
        )
        return 3

    print(f"\nQuestion: {question}\n")
    print("Retrieved fragments (RAG):")
    for doc in response.documents:
        print(f"  - {doc.id}  score={doc.score:.2f}  ({doc.name})")

    print(f"\nAnswer (provider={response.provider}, model={response.model}):")
    print(f"  {response.answer}")

    print(f"\nEvidence sufficient: {response.evidence_sufficient}")

    print("\nValidated claims / citations:")
    for claim in response.claims:
        src = claim.source or "-"
        print(f"  [{claim.status.value}] source={src} :: {claim.text}")

    print("\nEvaluation:", response.evaluation.model_dump())
    print("Pipeline  :", response.pipeline.model_dump())
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
