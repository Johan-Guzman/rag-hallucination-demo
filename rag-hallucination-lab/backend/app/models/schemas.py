from pydantic import BaseModel, Field
from typing import List, Optional, Literal
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


class Document(BaseModel):
    id: str
    name: str
    content: str
    score: float = 0.0
    metadata: dict = {}


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


class QueryResponse(BaseModel):
    query: str
    mode: Mode
    answer: str
    documents: List[Document]
    claims: List[Claim]
    evaluation: Evaluation
    pipeline: PipelineState
    educational_explanation: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    mock_mode: bool
    version: str = "1.0.0"