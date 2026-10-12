from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Literal
from enum import Enum


class Mode(str, Enum):
    LLM = "llm"
    RAG = "rag"
    RAG_EVAL = "rag_eval"


class PipelineStage(str, Enum):
    IDLE = "idle"
    PROCESSING = "processing"
    SUCCESS = "success"
    WARNING = "warning"
    FAILURE = "failure"


class ClaimStatus(str, Enum):
    SUPPORTED = "supported"
    UNSUPPORTED = "unsupported"
    CONTRADICTED = "contradicted"
    UNCERTAIN = "uncertain"


class DocumentSource(str, Enum):
    BUILTIN = "builtin"
    UPLOADED = "uploaded"


class DocumentStatus(str, Enum):
    PROCESSED = "processed"
    FAILED = "failed"


class Document(BaseModel):
    id: str
    name: str
    content: str
    score: float = 0.0
    metadata: dict = {}
    # Best-matching passage of ``content`` for the issued query. Populated by the
    # retrieval stage so the UI can show, inspect and contrast the exact evidence
    # fragment a claim rests on (it is not a correctness proof).
    fragment: Optional[str] = None


class DocumentRecord(BaseModel):
    """Metadata-only view of a corpus document (no body), for list endpoints.

    ``content`` is intentionally omitted so listing the corpus does not ship the
    full text on every page load; the body is fetched on demand.
    """

    id: str
    name: str
    source: DocumentSource = DocumentSource.BUILTIN
    status: DocumentStatus = DocumentStatus.PROCESSED
    chars: int = 0
    words: int = 0
    size_bytes: int = 0
    error: Optional[str] = None
    created_at: Optional[str] = None


class DocumentDetail(DocumentRecord):
    content: str = ""


class UploadResult(BaseModel):
    name: str
    status: DocumentStatus
    document_id: Optional[str] = None
    chars: int = 0
    error: Optional[str] = None


class UploadResponse(BaseModel):
    results: List[UploadResult]
    documents: List[DocumentRecord]


class DocumentClaim(BaseModel):
    """An assertion extracted from a document, with its supporting fragment.

    ``evidence`` is a verbatim quote copied from the document. ``verified`` is
    true only when that quote was actually found back in the stored text, so an
    invented citation is never presented as support. ``location`` is the nearest
    heading/section when one can be determined.
    """

    text: str
    status: Literal["supported", "unsupported", "uncertain"] = "uncertain"
    evidence: Optional[str] = None
    location: Optional[str] = None
    verified: bool = False


class DocumentAnalysis(BaseModel):
    """Real, reproducible statistics derived from the stored text.

    ``summary`` / ``key_points`` / ``claims`` / ``conclusions`` are only set when
    a generation provider (Gemini) is active; they are LLM-generated and labelled
    as such, never presented as a measured fact. The counts and keywords are
    always computed locally from the stored text.
    """

    document_id: str
    name: str
    chars: int
    words: int
    sentences: int
    paragraphs: int
    keywords: List[str] = []
    headings: List[str] = []
    provider: Optional[str] = None
    model: Optional[str] = None
    summary: Optional[str] = None
    summary_note: Optional[str] = None
    # Deep (LLM) analysis fields. Empty / None when only local stats are used.
    key_points: List[str] = []
    claims: List[DocumentClaim] = []
    conclusions: Optional[str] = None
    strategy: Optional[str] = None
    chunks_processed: int = 0


class Claim(BaseModel):
    text: str
    status: ClaimStatus
    source: Optional[str] = None
    confidence: float = 0.0
    explanation: Optional[str] = None


class Evaluation(BaseModel):
    retrieval: float = Field(ge=0.0, le=1.0)
    groundedness: float = Field(ge=0.0, le=1.0)
    citation: float = Field(ge=0.0, le=1.0)


class PipelineState(BaseModel):
    query: PipelineStage = PipelineStage.IDLE
    retrieval: PipelineStage = PipelineStage.IDLE
    context: PipelineStage = PipelineStage.IDLE
    generation: PipelineStage = PipelineStage.IDLE
    evaluation: PipelineStage = PipelineStage.IDLE


class QueryRequest(BaseModel):
    query: str
    mode: Mode
    top_k: int = 5
    # Optional restriction to a subset of the corpus. Empty/None means "all
    # available documents" (builtin + uploaded).
    document_ids: Optional[List[str]] = None


class ResponseMetrics(BaseModel):
    """Per-response metrics computed from signals the pipeline actually emits.

    Every field is derived from the generated answer, the verified claims or the
    retrieval scores -- none is a decorative constant. ``None`` means the metric
    is not defined for that response (e.g. groundedness without claims).
    """

    groundedness: Optional[float] = None
    citation_attribution: Optional[float] = None
    unsupported_rate: Optional[float] = None
    abstention: bool = False
    retrieval_score: Optional[float] = None
    latency_ms: Optional[float] = None
    claims_total: int = 0
    claims_supported: int = 0
    claims_unsupported: int = 0
    citations_valid: int = 0
    citations_invalid: int = 0


class QueryResponse(BaseModel):
    query: str
    mode: Mode
    answer: str
    documents: List[Document]
    claims: List[Claim]
    evaluation: Evaluation
    pipeline: PipelineState
    educational_explanation: Optional[str] = None
    # Additive metadata making the comparison condition explicit (with/without
    # RAG and which generation provider produced the answer).
    provider: Optional[str] = None
    model: Optional[str] = None
    evidence_sufficient: Optional[bool] = None
    metrics: Optional[ResponseMetrics] = None
    latency_ms: Optional[float] = None


class HealthResponse(BaseModel):
    status: str
    mock_mode: bool
    version: str = "1.0.0"
    provider: str = "mock"
    model: Optional[str] = None
    gemini_configured: bool = False
    # Corpus size, useful for the header/docs panel.
    documents: int = 0
    uploaded_documents: int = 0


# ---------------------------------------------------------------------------
# Experiments: run the same questions across the three conditions and compare
# the real per-condition metrics. Nothing here is precomputed or simulated.
# ---------------------------------------------------------------------------


class ExperimentRequest(BaseModel):
    questions: List[str] = Field(min_length=1)
    modes: List[Mode] = Field(default_factory=lambda: [Mode.LLM, Mode.RAG, Mode.RAG_EVAL])
    document_ids: Optional[List[str]] = None
    top_k: int = 5


class ExperimentCell(BaseModel):
    question: str
    mode: Mode
    status: Literal["ok", "error"] = "ok"
    error: Optional[str] = None
    error_category: Optional[str] = None
    answer: Optional[str] = None
    documents: List[Document] = []
    claims: List[Claim] = []
    evaluation: Optional[Evaluation] = None
    metrics: Optional[ResponseMetrics] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    evidence_sufficient: Optional[bool] = None
    latency_ms: float = 0.0


class MetricAggregate(BaseModel):
    """Aggregated comparison of one metric across the executed conditions."""

    key: str
    label: str
    unit: str = ""
    higher_is_better: bool = True
    definition: str = ""
    # mode value -> metric (None when undefined/not applicable)
    values: Dict[str, Optional[float]] = {}
    best_mode: Optional[str] = None
    # Number of cells contributing to each mode value.
    samples: Dict[str, int] = {}
    # True when every mode was measured on the same number of successful cells,
    # i.e. the comparison is apples-to-apples.
    comparable: bool = True


class Experiment(BaseModel):
    id: str
    created_at: str
    questions: List[str]
    modes: List[Mode]
    document_ids: List[str] = []
    document_names: List[str] = []
    top_k: int = 5
    provider: Optional[str] = None
    model: Optional[str] = None
    cells: List[ExperimentCell] = []
    aggregates: List[MetricAggregate] = []
    status_counts: Dict[str, int] = {}
    notes: List[str] = []
    # Demo runs are executed from the built-in demo questions. They are real
    # executions, but the frontend labels them so they are never confused with
    # a user-designed experiment.
    is_demo: bool = False


class ExperimentSummary(BaseModel):
    """Lightweight list entry (no cells)."""

    id: str
    created_at: str
    questions: int
    modes: List[Mode]
    document_names: List[str] = []
    provider: Optional[str] = None
    status_counts: Dict[str, int] = {}
    is_demo: bool = False


class AnalyzeRequest(BaseModel):
    document_ids: List[str] = []
    include_summary: bool = True
    # Deep analysis adds LLM-extracted key points, supported claims (with
    # verbatim evidence) and conclusions. Requires a generation provider.
    deep: bool = False


# ---------------------------------------------------------------------------
# Cross-experiment comparison: aggregates per saved run plus an overall
# aggregate across the selected runs. Built entirely from persisted results.
# ---------------------------------------------------------------------------


class ComparisonRun(BaseModel):
    id: str
    created_at: str
    provider: Optional[str] = None
    model: Optional[str] = None
    questions: int
    modes: List[Mode]
    document_names: List[str] = []
    status_counts: Dict[str, int] = {}
    is_demo: bool = False
    aggregates: List[MetricAggregate] = []


class ExperimentComparison(BaseModel):
    """Comparison dataset consumed directly by the Compare view."""

    generated_at: str
    runs: List[ComparisonRun] = []
    # Aggregate across every selected run.
    overall: List[MetricAggregate] = []
    status_totals: Dict[str, int] = {}
    # Distinct questions available across the selected runs (for the filter).
    questions: List[str] = []
    # Question currently filtered, if any.
    question: Optional[str] = None
    notes: List[str] = []
