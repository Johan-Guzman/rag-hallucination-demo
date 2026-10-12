import logging
import re
import time
from collections import Counter
from typing import Dict, List, Optional

from app.models.schemas import (
    Claim,
    ClaimStatus,
    Document,
    DocumentAnalysis,
    DocumentDetail,
    DocumentRecord,
    Evaluation,
    MetricAggregate,
    Mode,
    PipelineStage,
    PipelineState,
    QueryRequest,
    QueryResponse,
    ResponseMetrics,
    UploadResult,
)
from app.core.config import settings
from app.services.document_store import DocumentStore, resolve_data_dir
from app.services.metrics import aggregate_experiment, compute_metrics
from app.services.llm_client import (
    GenerationResult,
    GeminiLLMClient,
    LLMProviderError,
)

logger = logging.getLogger(__name__)


class MockRAGService:
    def __init__(self):
        self.data_dir = resolve_data_dir()
        self.store = DocumentStore(self.data_dir)
        self.demo_cases = self._load_demo_cases()
        self._initialized = False
        # Generation provider. "mock" keeps the offline demo behavior; "gemini"
        # routes generation through Google Gemini while reusing retrieval as-is.
        self._gemini_client: Optional[GeminiLLMClient] = None
        if self._use_gemini:
            self._gemini_client = GeminiLLMClient()
            if not settings.gemini_api_key:
                logger.error(
                    "LLM_PROVIDER=gemini but GEMINI_API_KEY is empty; every "
                    "query will fail until the key is configured."
                )
        logger.info(
            "LLM generation provider resolved: provider=%s model=%s documents=%d",
            self.provider,
            self.model or "-",
            self.store.counts()["documents"],
        )

    @property
    def provider(self) -> str:
        return "gemini" if self._use_gemini else "mock"

    @property
    def model(self) -> Optional[str]:
        return settings.gemini_model if self._use_gemini else None

    @property
    def _use_gemini(self) -> bool:
        return settings.effective_provider == "gemini"

    # ------------------------------------------------------------------
    # Corpus access
    # ------------------------------------------------------------------
    def _load_demo_cases(self) -> dict:
        import json

        cases_path = self.data_dir / "demo_cases.json"
        if cases_path.exists():
            with open(cases_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"cases": []}

    def get_all_documents(self) -> List[Document]:
        """Full-content view of the corpus (with scores defaulted to 0)."""
        docs: List[Document] = []
        for record in self.store.records():
            content = self.store.get_content(record.id) or ""
            docs.append(
                Document(
                    id=record.id,
                    name=record.name,
                    content=content,
                    score=0.0,
                    metadata={"source": record.source.value},
                )
            )
        return docs

    def get_document_records(self) -> List[DocumentRecord]:
        return self.store.records()

    def get_document_detail(self, doc_id: str) -> Optional[DocumentDetail]:
        return self.store.get_detail(doc_id)

    def _find_matching_case(self, query: str, mode: Mode) -> Optional[dict]:
        query_lower = query.lower().strip()
        for case in self.demo_cases.get("cases", []):
            if case["query"].lower().strip() == query_lower and case["mode"] == mode.value:
                return case
        return None

    def _simulate_retrieval(
        self, query: str, top_k: int = 5, document_ids: Optional[List[str]] = None
    ) -> List[Document]:
        return self.store.search(query, top_k, document_ids)

    def _generate_mock_answer(
        self, query: str, mode: Mode, retrieved_docs: List[Document]
    ) -> tuple[str, List[Claim]]:
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
            answer = (
                "Sí, RAG elimina completamente las alucinaciones. Al proporcionar "
                "contexto externo verificado, RAG garantiza que el modelo solo "
                "genere información factual y precisa. Estudios han demostrado que "
                "RAG reduce las alucinaciones a cero en benchmarks estándar como "
                "TruthfulQA y HaluEval."
            )
            claims = [
                Claim(text="RAG elimina completamente las alucinaciones", status=ClaimStatus.UNSUPPORTED, source=None, confidence=0.0, explanation="Afirmación falsa: RAG reduce pero no elimina las alucinaciones"),
                Claim(text="RAG garantiza que el modelo solo genere información factual y precisa", status=ClaimStatus.UNSUPPORTED, source=None, confidence=0.0, explanation="Afirmación falsa: No hay garantía de precisión factual"),
                Claim(text="Estudios han demostrado que RAG reduce las alucinaciones a cero", status=ClaimStatus.CONTRADICTED, source=None, confidence=0.0, explanation="Contradicho por la literatura: Shuster et al. (2021), Magesh et al. (2025)"),
            ]
        else:
            answer = (
                "Los Grandes Modelos de Lenguaje pueden generar información que "
                "suena plausible pero es incorrecta. RAG es una técnica que ayuda a "
                "mitigar este problema proporcionando contexto externo."
            )
            claims = [
                Claim(text="Los Grandes Modelos de Lenguaje pueden generar información que suena plausible pero es incorrecta", status=ClaimStatus.SUPPORTED, source=None, confidence=0.85, explanation="Conocimiento general sobre alucinaciones en LLM"),
                Claim(text="RAG es una técnica que ayuda a mitigar este problema proporcionando contexto externo", status=ClaimStatus.SUPPORTED, source=None, confidence=0.80, explanation="Definición básica de RAG"),
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
                explanation=f"Documento recuperado con score {top_doc.score:.2f}",
            )
        ]

        return answer, claims

    def _rag_eval_answer(self, query: str, retrieved_docs: List[Document]) -> tuple[str, List[Claim]]:
        return self._rag_answer(query, retrieved_docs)

    def _compute_evaluation(
        self, mode: Mode, retrieved_docs: List[Document], claims: List[Claim]
    ) -> Evaluation:
        if mode == Mode.LLM:
            return Evaluation(retrieval=0.0, groundedness=0.15, citation=0.0)
        retrieval_score = max([d.score for d in retrieved_docs], default=0.0)
        supported_claims = sum(1 for c in claims if c.status == ClaimStatus.SUPPORTED)
        total_claims = len(claims) if claims else 1
        groundedness = supported_claims / total_claims
        return Evaluation(
            retrieval=retrieval_score,
            groundedness=groundedness,
            citation=groundedness * (0.85 if mode == Mode.RAG_EVAL else 0.9),
        )

    def _compute_pipeline_state(
        self, mode: Mode, retrieved_docs: List[Document], claims: List[Claim]
    ) -> PipelineState:
        if mode == Mode.LLM:
            has_unsupported = any(
                c.status in [ClaimStatus.UNSUPPORTED, ClaimStatus.CONTRADICTED] for c in claims
            )
            return PipelineState(
                query=PipelineStage.SUCCESS,
                retrieval=PipelineStage.IDLE,
                context=PipelineStage.IDLE,
                generation=PipelineStage.WARNING if has_unsupported else PipelineStage.SUCCESS,
                evaluation=PipelineStage.WARNING if has_unsupported else PipelineStage.SUCCESS,
            )
        retrieval_success = len(retrieved_docs) > 0 and retrieved_docs[0].score > 0.5
        has_warnings = any(
            c.status in [ClaimStatus.UNSUPPORTED, ClaimStatus.CONTRADICTED] for c in claims
        )
        return PipelineState(
            query=PipelineStage.SUCCESS,
            retrieval=PipelineStage.SUCCESS if retrieval_success else PipelineStage.WARNING,
            context=PipelineStage.SUCCESS if retrieval_success else PipelineStage.WARNING,
            generation=PipelineStage.WARNING if has_warnings else PipelineStage.SUCCESS,
            evaluation=PipelineStage.WARNING if has_warnings else PipelineStage.SUCCESS,
        )

    def _get_educational_explanation(self, query: str, mode: Mode) -> Optional[str]:
        case = self._find_matching_case(query, mode)
        if case:
            return case.get("educational_explanation")
        return None

    def _evaluation_from_metrics(self, metrics: ResponseMetrics) -> Evaluation:
        return Evaluation(
            retrieval=metrics.retrieval_score or 0.0,
            groundedness=metrics.groundedness or 0.0,
            citation=metrics.citation_attribution or 0.0,
        )

    # ------------------------------------------------------------------
    # Query execution
    # ------------------------------------------------------------------
    async def query(self, request: QueryRequest) -> QueryResponse:
        started = time.perf_counter()
        if self._use_gemini:
            return await self._query_gemini(request, started)
        return self._query_mock(request, started)

    def _query_mock(self, request: QueryRequest, started: float) -> QueryResponse:
        logger.info(
            "Serving query with mock provider (offline, no external API call) | mode=%s",
            request.mode.value,
        )
        case = self._find_matching_case(request.query, request.mode)

        invalid_citations: List[str] = []
        if case:
            retrieved_docs = [Document(**d) for d in case["documents"]]
            answer = case["answer"]
            claims = [Claim(**c) for c in case["claims"]]
            evaluation = Evaluation(**case["evaluation"])
            pipeline = PipelineState(**case["pipeline"])
            educational_explanation = case.get("educational_explanation")
        else:
            if request.mode == Mode.LLM:
                # The "without RAG" condition must not retrieve: that difference
                # is the whole point of the comparison, so it stays explicit.
                retrieved_docs = []
            else:
                retrieved_docs = self._simulate_retrieval(
                    request.query, request.top_k, request.document_ids
                )
            answer, claims = self._generate_mock_answer(request.query, request.mode, retrieved_docs)
            evaluation = self._compute_evaluation(request.mode, retrieved_docs, claims)
            pipeline = self._compute_pipeline_state(request.mode, retrieved_docs, claims)
            educational_explanation = self._get_educational_explanation(request.query, request.mode)

        latency_ms = (time.perf_counter() - started) * 1000
        evidence_sufficient = None
        if request.mode in (Mode.RAG, Mode.RAG_EVAL):
            evidence_sufficient = bool(retrieved_docs)
        metrics = compute_metrics(
            answer=answer,
            claims=claims,
            documents=retrieved_docs,
            evidence_sufficient=evidence_sufficient,
            invalid_citations=invalid_citations,
            latency_ms=latency_ms,
        )

        return QueryResponse(
            query=request.query,
            mode=request.mode,
            answer=answer,
            documents=retrieved_docs,
            claims=claims,
            evaluation=evaluation,
            pipeline=pipeline,
            educational_explanation=educational_explanation,
            provider="mock",
            model=None,
            evidence_sufficient=evidence_sufficient,
            metrics=metrics,
            latency_ms=round(latency_ms, 1),
        )

    # ------------------------------------------------------------------
    # Gemini generation path
    #
    # Retrieval is unchanged: ``store.search`` produces the documents, scores
    # and fragments exactly as the RAG pipeline did. Only the generation (and,
    # for condition C, the verification) stage is delegated to Gemini.
    # ------------------------------------------------------------------
    async def _query_gemini(self, request: QueryRequest, started: float) -> QueryResponse:
        if request.mode == Mode.LLM:
            retrieved_docs: List[Document] = []
        else:
            retrieved_docs = self._simulate_retrieval(
                request.query, request.top_k, request.document_ids
            )

        client = self._gemini_client
        try:
            result = await client.generate(request.query, request.mode, retrieved_docs)
            claims = result.claims
            verification_ran = False
            if request.mode == Mode.RAG_EVAL and retrieved_docs:
                # Condition C: contrast every atomic claim with the cited
                # fragments using an independent verifier prompt.
                claims = await client.verify_claims(result.answer, retrieved_docs)
                verification_ran = True
        except LLMProviderError:
            raise
        except Exception as exc:  # noqa: BLE001 - normalize unexpected failures
            logger.exception("Unexpected Gemini generation failure")
            raise LLMProviderError(
                "unknown",
                "Error inesperado al generar la respuesta con Gemini.",
            ) from exc

        latency_ms = (time.perf_counter() - started) * 1000
        metrics = compute_metrics(
            answer=result.answer,
            claims=claims,
            documents=retrieved_docs,
            evidence_sufficient=result.evidence_sufficient,
            invalid_citations=result.invalid_citations,
            latency_ms=latency_ms,
        )
        evaluation = self._evaluation_from_metrics(metrics)
        pipeline = self._compute_pipeline_state(request.mode, retrieved_docs, claims)
        if not result.evidence_sufficient or result.invalid_citations:
            pipeline = pipeline.model_copy(
                update={
                    "generation": PipelineStage.WARNING,
                    "evaluation": PipelineStage.WARNING,
                }
            )

        return QueryResponse(
            query=request.query,
            mode=request.mode,
            answer=result.answer,
            documents=retrieved_docs,
            claims=claims,
            evaluation=evaluation,
            pipeline=pipeline,
            educational_explanation=self._gemini_explanation(
                request.mode, result, verification_ran
            ),
            provider=result.provider,
            model=result.model,
            evidence_sufficient=result.evidence_sufficient,
            metrics=metrics,
            latency_ms=round(latency_ms, 1),
        )

    def _gemini_explanation(
        self, mode: Mode, result: GenerationResult, verification_ran: bool
    ) -> str:
        if mode == Mode.LLM:
            base = (
                "Condición A: generación SIN RAG (solo conocimiento paramétrico). "
                "No hay fragmentos recuperados que sustenten la respuesta."
            )
        elif mode == Mode.RAG_EVAL:
            base = (
                "Condición C: generación CON RAG y verificación afirmación por "
                "afirmación contra los fragmentos citados."
            )
        elif result.evidence_sufficient:
            base = (
                "Condición B: generación CON RAG. La respuesta se apoya en los "
                "fragmentos recuperados y las citas se validaron contra ellos."
            )
        else:
            base = (
                "Condición B: generación CON RAG. Los fragmentos recuperados no "
                "bastan para responder; el modelo lo reconoce en lugar de inventar."
            )
        if verification_ran:
            base += (
                " El verificador (juez LLM) clasificó cada afirmación; es un "
                "evaluador imperfecto y sus juicios pueden contener errores."
            )
        if result.invalid_citations:
            unique = sorted(set(result.invalid_citations))
            base += (
                " Se eliminaron citas no válidas (no corresponden a fragmentos "
                f"recuperados): {', '.join(unique)}."
            )
        return base

    # ------------------------------------------------------------------
    # Document management
    # ------------------------------------------------------------------
    def upload_documents(
        self, files: List[tuple[str, bytes]]
    ) -> tuple[List[UploadResult], List[DocumentRecord]]:
        """Validate and store uploaded files, returning a per-file result.

        A single bad file never aborts the batch: each is reported as
        ``processed`` or ``failed`` with a user-safe message.
        """
        results: List[UploadResult] = []
        for name, data in files:
            try:
                record = self.store.add_upload(name, data)
            except ValueError as exc:
                results.append(
                    UploadResult(name=name, status="failed", error=str(exc))
                )
            except Exception as exc:  # noqa: BLE001 - never leak internals
                logger.exception("Unexpected upload failure for %s", name)
                results.append(
                    UploadResult(
                        name=name,
                        status="failed",
                        error="Error inesperado al procesar el archivo.",
                    )
                )
            else:
                results.append(
                    UploadResult(
                        name=name,
                        status="processed",
                        document_id=record.id,
                        chars=record.chars,
                    )
                )
        return results, self.store.records()

    def delete_document(self, doc_id: str) -> bool:
        return self.store.delete(doc_id)

    async def analyze_document(
        self, doc_id: str, include_summary: bool = True, deep: bool = False
    ) -> Optional[DocumentAnalysis]:
        detail = self.store.get_detail(doc_id)
        if detail is None:
            return None
        text = detail.content or ""
        analysis = self._local_analysis(detail, text)
        if deep:
            await self._deep_analysis(analysis, detail, text)
        elif include_summary and self._use_gemini and self._gemini_client is not None:
            try:
                analysis.summary = await self._gemini_client.summarize(text, detail.name)
                analysis.provider = self.provider
                analysis.model = self.model
                analysis.summary_note = (
                    "Resumen generado por un LLM (Gemini); puede contener "
                    "imprecisiones. No es una medición."
                )
            except LLMProviderError as exc:
                analysis.summary_note = f"No se pudo generar el resumen: {exc.message}"
        elif include_summary:
            analysis.summary_note = (
                "El resumen automático requiere un proveedor de generación "
                "(LLM_PROVIDER=gemini). Las estadísticas anteriores sí se calculan "
                "localmente."
            )
        return analysis

    async def _deep_analysis(
        self, analysis: DocumentAnalysis, detail: DocumentDetail, text: str
    ) -> None:
        """Fill the deep LLM fields, or an honest local fallback in mock mode."""
        if self._use_gemini and self._gemini_client is not None:
            try:
                result = await self._gemini_client.analyze(text, detail.name)
            except LLMProviderError as exc:
                analysis.summary_note = (
                    f"No se pudo completar el análisis profundo: {exc.message}"
                )
                return
            analysis.summary = result.summary
            analysis.key_points = result.key_points
            analysis.claims = result.claims
            analysis.conclusions = result.conclusions
            analysis.chunks_processed = result.chunks_processed
            analysis.provider = self.provider
            analysis.model = self.model
            analysis.strategy = (
                f"map-reduce por fragmentos ({result.chunks_processed} "
                "fragmento(s)) + verificación literal de citas (Gemini)"
            )
            verified = sum(1 for c in result.claims if c.verified)
            analysis.summary_note = (
                "Resumen, ideas clave, afirmaciones y conclusiones generados por un "
                "LLM (Gemini). Una afirmación solo se marca como respaldada cuando su "
                "cita textual aparece en el documento; el resto queda como incierta. "
                f"Citas verificadas: {verified}/{len(result.claims)}. No es una "
                "medición."
            )
            return

        analysis.key_points = self._extractive_key_points(text, analysis.keywords)
        analysis.strategy = "extractivo local (sin LLM)"
        analysis.summary_note = (
            "El resumen, las afirmaciones y las conclusiones requieren un proveedor "
            "de generación (LLM_PROVIDER=gemini). Las ideas clave mostradas se "
            "extraen localmente del propio texto; no son una interpretación del "
            "modelo."
        )

    @staticmethod
    def _extractive_key_points(
        text: str, keywords: List[str], limit: int = 5
    ) -> List[str]:
        """Rank sentences by keyword overlap; returns verbatim sentences."""
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        if not sentences:
            return []
        lowered = [k.lower() for k in keywords]

        def score(sentence: str) -> float:
            words = re.findall(r"[a-záéíóúñ]+", sentence.lower())
            if not words:
                return 0.0
            hits = sum(1 for w in words if w in lowered)
            return hits / (len(words) ** 0.5)

        ranked = sorted(sentences, key=score, reverse=True)
        selected: List[str] = []
        for sentence in ranked:
            if len(sentence) < 40:
                continue
            selected.append(sentence)
            if len(selected) >= limit:
                break
        return selected

    @staticmethod
    def _local_analysis(detail: DocumentDetail, text: str) -> DocumentAnalysis:
        paragraphs = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
        sentences = [s for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        headings = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("#"):
                headings.append(line.lstrip("#").strip())
            elif len(line) <= 80 and line.endswith(":") and len(line.split()) <= 12:
                headings.append(line.rstrip(":"))
        words = re.findall(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]+", text.lower())
        stop = {
            "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "for",
            "with", "that", "this", "as", "by", "on", "it", "be", "can", "not",
            "from", "at", "which", "when", "used", "use", "than", "but", "its",
            "de", "la", "el", "los", "las", "que", "y", "en", "un", "una", "es",
            "se", "del", "al", "por", "con", "para", "como", "no", "su", "más",
        }
        counts = Counter(w for w in words if w not in stop and len(w) > 2)
        return DocumentAnalysis(
            document_id=detail.id,
            name=detail.name,
            chars=detail.chars,
            words=detail.words,
            sentences=len(sentences),
            paragraphs=len(paragraphs),
            keywords=[w for w, _ in counts.most_common(8)],
            headings=headings[:8],
        )

    # ------------------------------------------------------------------
    # Experiments
    # ------------------------------------------------------------------
    def get_demo_cases(self) -> List[dict]:
        return self.demo_cases.get("cases", [])


rag_service = MockRAGService()
