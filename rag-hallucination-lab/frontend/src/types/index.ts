export type Mode = 'llm' | 'rag' | 'rag_eval';

export type PipelineStage = 'idle' | 'processing' | 'success' | 'warning' | 'failure';

export type ClaimStatus = 'supported' | 'unsupported' | 'contradicted' | 'uncertain';

export interface Document {
  id: string;
  name: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface Claim {
  text: string;
  status: ClaimStatus;
  source?: string | null;
  confidence: number;
  explanation?: string | null;
}

export interface Evaluation {
  retrieval: number;
  groundedness: number;
  citation: number;
}

export interface PipelineState {
  query: PipelineStage;
  retrieval: PipelineStage;
  context: PipelineStage;
  generation: PipelineStage;
  evaluation: PipelineStage;
}

export interface QueryRequest {
  query: string;
  mode: Mode;
  top_k?: number;
}

export interface QueryResponse {
  query: string;
  mode: Mode;
  answer: string;
  documents: Document[];
  claims: Claim[];
  evaluation: Evaluation;
  pipeline: PipelineState;
  educational_explanation?: string | null;
}

export interface DemoCase {
  id: string;
  name: string;
  query: string;
  mode: Mode;
  description: string;
  expected_result: string;
  answer: string;
  documents: Document[];
  claims: Claim[];
  evaluation: Evaluation;
  pipeline: PipelineState;
  educational_explanation?: string | null;
}

export interface HealthResponse {
  status: string;
  mock_mode: boolean;
  version: string;
}