export type Mode = 'llm' | 'rag' | 'rag_eval';

export const MODE_ORDER: Mode[] = ['llm', 'rag', 'rag_eval'];

export type PipelineStage = 'idle' | 'processing' | 'success' | 'warning' | 'failure';

export type ClaimStatus = 'supported' | 'unsupported' | 'contradicted' | 'uncertain';

export interface Document {
  id: string;
  name: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
  fragment?: string | null;
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
  document_ids?: string[] | null;
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
  // Additive provider metadata (Gemini integration). Optional so older
  // backends keep working.
  provider?: string | null;
  model?: string | null;
  evidence_sufficient?: boolean | null;
  metrics?: ResponseMetrics | null;
  latency_ms?: number | null;
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
  provider?: string;
  model?: string | null;
  gemini_configured?: boolean;
  documents?: number;
  uploaded_documents?: number;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export type DocumentSource = 'builtin' | 'uploaded';
export type DocumentStatus = 'processed' | 'failed';

export interface DocumentRecord {
  id: string;
  name: string;
  source: DocumentSource;
  status: DocumentStatus;
  chars: number;
  words: number;
  size_bytes: number;
  error?: string | null;
  created_at?: string | null;
}

export interface DocumentDetail extends DocumentRecord {
  content: string;
}

export interface UploadResult {
  name: string;
  status: DocumentStatus;
  document_id?: string | null;
  chars: number;
  error?: string | null;
}

export interface UploadResponse {
  results: UploadResult[];
  documents: DocumentRecord[];
}

export interface DocumentClaim {
  text: string;
  status: 'supported' | 'unsupported' | 'uncertain';
  evidence?: string | null;
  location?: string | null;
  verified: boolean;
}

export interface DocumentAnalysis {
  document_id: string;
  name: string;
  chars: number;
  words: number;
  sentences: number;
  paragraphs: number;
  keywords: string[];
  headings: string[];
  provider?: string | null;
  model?: string | null;
  summary?: string | null;
  summary_note?: string | null;
  // Deep (LLM) analysis fields; empty when only local statistics are available.
  key_points: string[];
  claims: DocumentClaim[];
  conclusions?: string | null;
  strategy?: string | null;
  chunks_processed: number;
}

// ---------------------------------------------------------------------------
// Metrics + experiments
// ---------------------------------------------------------------------------
export interface ResponseMetrics {
  groundedness?: number | null;
  citation_attribution?: number | null;
  unsupported_rate?: number | null;
  abstention: boolean;
  retrieval_score?: number | null;
  latency_ms?: number | null;
  claims_total: number;
  claims_supported: number;
  claims_unsupported: number;
  citations_valid: number;
  citations_invalid: number;
}

export interface ExperimentCell {
  question: string;
  mode: Mode;
  status: 'ok' | 'error';
  error?: string | null;
  error_category?: string | null;
  answer?: string | null;
  documents: Document[];
  claims: Claim[];
  evaluation?: Evaluation | null;
  metrics?: ResponseMetrics | null;
  provider?: string | null;
  model?: string | null;
  evidence_sufficient?: boolean | null;
  latency_ms: number;
}

export interface MetricAggregate {
  key: string;
  label: string;
  unit: string;
  higher_is_better: boolean;
  definition: string;
  values: Record<string, number | null>;
  best_mode?: string | null;
  samples: Record<string, number>;
  comparable: boolean;
}

export interface Experiment {
  id: string;
  created_at: string;
  questions: string[];
  modes: Mode[];
  document_ids: string[];
  document_names: string[];
  top_k: number;
  provider?: string | null;
  model?: string | null;
  cells: ExperimentCell[];
  aggregates: MetricAggregate[];
  status_counts: Record<string, number>;
  notes: string[];
  is_demo: boolean;
}

export interface ExperimentSummary {
  id: string;
  created_at: string;
  questions: number;
  modes: Mode[];
  document_names: string[];
  provider?: string | null;
  status_counts: Record<string, number>;
  is_demo: boolean;
}

export interface ComparisonRun {
  id: string;
  created_at: string;
  questions: number;
  modes: Mode[];
  document_names: string[];
  status_counts: Record<string, number>;
  is_demo: boolean;
  aggregates: MetricAggregate[];
}

export interface ExperimentComparison {
  generated_at: string;
  runs: ComparisonRun[];
  overall: MetricAggregate[];
  status_totals: Record<string, number>;
  questions: string[];
  question?: string | null;
  notes: string[];
}

export interface ExperimentRequest {
  questions: string[];
  modes: Mode[];
  document_ids?: string[] | null;
  top_k?: number;
}

export interface AnalyzeRequest {
  document_ids?: string[];
  include_summary?: boolean;
  deep?: boolean;
}

// NOTE: the theme colors are stored as HSL triples (e.g. "--primary: 211 100% 50%"),
// so they must be consumed through hsl(...). Using `var(--primary)` directly as a
// CSS color is invalid and renders the value as transparent.
export const MODE_META: Record<
  Mode,
  { short: string; label: string; description: string; color: string; badge: string }
> = {
  llm: {
    short: 'A',
    label: 'A · Sin evidencia',
    description:
      'El modelo responde solo con su conocimiento paramétrico, sin fragmentos recuperados (línea base).',
    color: 'hsl(var(--warning))',
    badge: 'bg-warning',
  },
  rag: {
    short: 'B',
    label: 'B · Con evidencia',
    description:
      'Recupera fragmentos del corpus y genera la respuesta citándolos, sin un paso adicional de verificación.',
    color: 'hsl(var(--primary))',
    badge: 'bg-primary',
  },
  rag_eval: {
    short: 'C',
    label: 'C · Con verificación',
    description:
      'Igual que B, pero cada afirmación se contrasta contra el fragmento citado con un verificador (juez LLM).',
    color: 'hsl(var(--success))',
    badge: 'bg-success',
  },
};