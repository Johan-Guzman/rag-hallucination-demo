import json
import os
from typing import List, Optional
from pathlib import Path

from app.models.schemas import Document, QueryRequest, QueryResponse, Mode, Claim, ClaimStatus, Evaluation, PipelineState, PipelineStage
from app.core.config import settings


class MockRAGService:
    def __init__(self):
        self.documents = self._load_documents()
        self.demo_cases = self._load_demo_cases()
        self._initialized = False

    def _load_documents(self) -> List[Document]:
        docs = []
        data_dir = Path("data")
        for i in range(1, 6):
            file_path = data_dir / f"document_0{i}.txt"
            if file_path.exists():
                content = file_path.read_text(encoding="utf-8")
                docs.append(Document(
                    id=f"document_0{i}",
                    name=f"document_0{i}.txt",
                    content=content,
                    score=0.0
                ))
        return docs

    def _load_demo_cases(self) -> dict:
        cases_path = Path("data/demo_cases.json")
        if cases_path.exists():
            with open(cases_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"cases": []}

    def _find_matching_case(self, query: str, mode: Mode) -> Optional[dict]:
        query_lower = query.lower().strip()
        for case in self.demo_cases.get("cases", []):
            if case["query"].lower().strip() == query_lower and case["mode"] == mode.value:
                return case
        return None

    def _simulate_retrieval(self, query: str, top_k: int = 5) -> List[Document]:
        query_lower = query.lower()
        scored_docs = []
        
        for doc in self.documents:
            score = self._compute_mock_similarity(query_lower, doc.content.lower())
            doc_copy = doc.model_copy()
            doc_copy.score = score
            scored_docs.append(doc_copy)
        
        scored_docs.sort(key=lambda d: d.score, reverse=True)
        return scored_docs[:top_k]

    def _compute_mock_similarity(self, query: str, content: str) -> float:
        query_words = set(query.split())
        content_words = set(content.split())
        
        if not query_words or not content_words:
            return 0.0
        
        intersection = query_words.intersection(content_words)
        union = query_words.union(content_words)
        
        jaccard = len(intersection) / len(union) if union else 0.0
        
        boost_keywords = {
            "rag": 0.15, "retrieval": 0.1, "embedding": 0.1, "groundedness": 0.1,
            "hallucination": 0.15, "citation": 0.1, "faithfulness": 0.1,
            "limitation": 0.1, "eliminate": 0.1, "reduce": 0.1
        }
        
        boost = sum(boost_keywords.get(w, 0) for w in query_words if w in content)
        
        return min(0.95, jaccard * 0.7 + boost + 0.1)

    def _generate_mock_answer(self, query: str, mode: Mode, retrieved_docs: List[Document]) -> tuple[str, List[Claim]]:
        case = self._find_matching_case(query, mode)
        if case:
            answer = case["answer"]
            claims = [Claim(**c) for c in case["claims"]]
            return answer, claims
        
        if mode == Mode.LLM:
            return self._llm_only_answer(query)
        elif mode == Mode.RAG:
            return self._rag_answer(query, retrieved_docs)
        else:
            return self._rag_eval_answer(query, retrieved_docs)

    def _llm_only_answer(self, query: str) -> tuple[str, List[Claim]]:
        query_lower = query.lower()
        
        if "elimina" in query_lower and "alucinacion" in query_lower:
            answer = "Sí, RAG elimina completamente las alucinaciones. Al proporcionar contexto externo verificado, RAG garantiza que el modelo solo genere información factual y precisa. Estudios han demostrado que RAG reduce las alucinaciones a cero en benchmarks estándar como TruthfulQA y HaluEval."
            claims = [
                Claim(text="RAG elimina completamente las alucinaciones", status=ClaimStatus.UNSUPPORTED, source=None, confidence=0.0, explanation="Afirmación falsa: RAG reduce pero no elimina las alucinaciones"),
                Claim(text="RAG garantiza que el modelo solo genere información factual y precisa", status=ClaimStatus.UNSUPPORTED, source=None, confidence=0.0, explanation="Afirmación falsa: No hay garantía de precisión factual"),
                Claim(text="Estudios han demostrado que RAG reduce las alucinaciones a cero", status=ClaimStatus.CONTRADICTED, source=None, confidence=0.0, explanation="Contradicho por la literatura: Shuster et al. (2021), Magesh et al. (2025)")
            ]
        else:
            answer = "Los Grandes Modelos de Lenguaje pueden generar información que suena plausible pero es incorrecta. RAG es una técnica que ayuda a mitigar este problema proporcionando contexto externo."
            claims = [
                Claim(text="Los Grandes Modelos de Lenguaje pueden generar información que suena plausible pero es incorrecta", status=ClaimStatus.SUPPORTED, source=None, confidence=0.85, explanation="Conocimiento general sobre alucinaciones en LLM"),
                Claim(text="RAG es una técnica que ayuda a mitigar este problema proporcionando contexto externo", status=ClaimStatus.SUPPORTED, source=None, confidence=0.80, explanation="Definición básica de RAG")
            ]
        
        return answer, claims

    def _rag_answer(self, query: str, retrieved_docs: List[Document]) -> tuple[str, List[Claim]]:
        if not retrieved_docs:
            answer = "No se encontraron documentos relevantes para responder a esta pregunta."
            return answer, []
        
        top_doc = retrieved_docs[0]
        answer = f"Basado en los documentos recuperados, {top_doc.content[:300]}..."
        
        claims = [
            Claim(
                text=f"La información proviene de {top_doc.name}",
                status=ClaimStatus.SUPPORTED,
                source=top_doc.id,
                confidence=top_doc.score,
                explanation=f"Documento recuperado con score {top_doc.score:.2f}"
            )
        ]
        
        return answer, claims

    def _rag_eval_answer(self, query: str, retrieved_docs: List[Document]) -> tuple[str, List[Claim]]:
        return self._rag_answer(query, retrieved_docs)

    def _compute_evaluation(self, mode: Mode, retrieved_docs: List[Document], claims: List[Claim]) -> Evaluation:
        case = self._find_matching_case("", mode)
        
        if mode == Mode.LLM:
            return Evaluation(retrieval=0.0, groundedness=0.15, citation=0.0)
        elif mode == Mode.RAG:
            retrieval_score = max([d.score for d in retrieved_docs], default=0.0)
            supported_claims = sum(1 for c in claims if c.status == ClaimStatus.SUPPORTED)
            total_claims = len(claims) if claims else 1
            groundedness = supported_claims / total_claims
            return Evaluation(
                retrieval=retrieval_score,
                groundedness=groundedness,
                citation=groundedness * 0.9
            )
        else:
            retrieval_score = max([d.score for d in retrieved_docs], default=0.0)
            supported_claims = sum(1 for c in claims if c.status == ClaimStatus.SUPPORTED)
            total_claims = len(claims) if claims else 1
            groundedness = supported_claims / total_claims
            citation_score = groundedness * 0.85
            return Evaluation(
                retrieval=retrieval_score,
                groundedness=groundedness,
                citation=citation_score
            )

    def _compute_pipeline_state(self, mode: Mode, retrieved_docs: List[Document], claims: List[Claim]) -> PipelineState:
        if mode == Mode.LLM:
            has_unsupported = any(c.status in [ClaimStatus.UNSUPPORTED, ClaimStatus.CONTRADICTED] for c in claims)
            return PipelineState(
                query=PipelineStage.SUCCESS,
                retrieval=PipelineStage.IDLE,
                context=PipelineStage.IDLE,
                generation=PipelineStage.WARNING if has_unsupported else PipelineStage.SUCCESS,
                evaluation=PipelineStage.WARNING if has_unsupported else PipelineStage.SUCCESS
            )
        else:
            retrieval_success = len(retrieved_docs) > 0 and retrieved_docs[0].score > 0.5
            has_warnings = any(c.status in [ClaimStatus.UNSUPPORTED, ClaimStatus.CONTRADICTED] for c in claims)
            
            return PipelineState(
                query=PipelineStage.SUCCESS,
                retrieval=PipelineStage.SUCCESS if retrieval_success else PipelineStage.WARNING,
                context=PipelineStage.SUCCESS if retrieval_success else PipelineStage.WARNING,
                generation=PipelineStage.WARNING if has_warnings else PipelineStage.SUCCESS,
                evaluation=PipelineStage.WARNING if has_warnings else PipelineStage.SUCCESS
            )

    def _get_educational_explanation(self, query: str, mode: Mode) -> Optional[str]:
        case = self._find_matching_case(query, mode)
        if case:
            return case.get("educational_explanation")
        return None

    async def query(self, request: QueryRequest) -> QueryResponse:
        case = self._find_matching_case(request.query, request.mode)
        
        if case:
            retrieved_docs = [Document(**d) for d in case["documents"]]
            answer = case["answer"]
            claims = [Claim(**c) for c in case["claims"]]
            evaluation = Evaluation(**case["evaluation"])
            pipeline = PipelineState(**case["pipeline"])
            educational_explanation = case.get("educational_explanation")
        else:
            retrieved_docs = self._simulate_retrieval(request.query, request.top_k)
            answer, claims = self._generate_mock_answer(request.query, request.mode, retrieved_docs)
            evaluation = self._compute_evaluation(request.mode, retrieved_docs, claims)
            pipeline = self._compute_pipeline_state(request.mode, retrieved_docs, claims)
            educational_explanation = self._get_educational_explanation(request.query, request.mode)
        
        return QueryResponse(
            query=request.query,
            mode=request.mode,
            answer=answer,
            documents=retrieved_docs,
            claims=claims,
            evaluation=evaluation,
            pipeline=pipeline,
            educational_explanation=educational_explanation
        )

    def get_all_documents(self) -> List[Document]:
        return self.documents

    def get_demo_cases(self) -> List[dict]:
        return self.demo_cases.get("cases", [])


rag_service = MockRAGService()