import type {
  AnalyzeRequest,
  DemoCase,
  DocumentAnalysis,
  DocumentDetail,
  DocumentRecord,
  Experiment,
  ExperimentComparison,
  ExperimentRequest,
  ExperimentSummary,
  HealthResponse,
  Mode,
  QueryResponse,
  UploadResponse,
} from '@/types';

// Backend routes are mounted under this prefix (see backend/app/main.py).
const API_PREFIX = '/api';

// Optional absolute override for direct browser -> backend access.
// When empty, requests are sent same-origin and proxied by Next.js
// (see next.config.js), which works both in the browser and inside Docker.
const RAW_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

export const API_BASE_URL = `${RAW_BASE_URL}${API_PREFIX}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data?.detail ?? detail;
    } catch {
      // response had no JSON body; keep the status text
    }
    throw new Error(`API ${response.status}: ${detail}`);
  }

  return response.json() as Promise<T>;
}

export async function apiQuery(
  query: string,
  mode: Mode,
  topK = 5,
  documentIds?: string[]
): Promise<QueryResponse> {
  return request<QueryResponse>('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, mode, top_k: topK, document_ids: documentIds ?? null }),
  });
}

export async function apiGetDemoCases(): Promise<{ cases: DemoCase[] }> {
  return request<{ cases: DemoCase[] }>('/demo-cases');
}

export async function apiHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function apiGetDocuments(): Promise<{ documents: DocumentRecord[] }> {
  return request<{ documents: DocumentRecord[] }>('/documents');
}

export async function apiGetDocument(id: string): Promise<DocumentDetail> {
  return request<DocumentDetail>(`/documents/${encodeURIComponent(id)}`);
}

export async function apiUploadDocuments(files: File[]): Promise<UploadResponse> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  // Content-Type is intentionally omitted so the browser sets the multipart
  // boundary.
  return request<UploadResponse>('/documents/upload', { method: 'POST', body: form });
}

export async function apiDeleteDocument(id: string): Promise<{ deleted: string }> {
  return request<{ deleted: string }>(`/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function apiAnalyzeDocuments(
  payload: AnalyzeRequest
): Promise<DocumentAnalysis[]> {
  return request<DocumentAnalysis[]>('/documents/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------
export async function apiRunExperiment(payload: ExperimentRequest): Promise<Experiment> {
  return request<Experiment>('/experiments/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function apiListExperiments(): Promise<ExperimentSummary[]> {
  return request<ExperimentSummary[]>('/experiments');
}

export async function apiGetExperiment(id: string): Promise<Experiment> {
  return request<Experiment>(`/experiments/${encodeURIComponent(id)}`);
}

export async function apiDeleteExperiment(id: string): Promise<{ deleted: string }> {
  return request<{ deleted: string }>(`/experiments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function apiRunDemoExperiment(): Promise<Experiment> {
  return request<Experiment>('/experiments/demo', { method: 'POST' });
}

// NOTE: uses GET so the comparison can be cached/refetched cheaply and so the
// same endpoint can be curled for verification.
export async function apiCompareExperiments(
  ids?: string[],
  question?: string
): Promise<ExperimentComparison> {
  const params = new URLSearchParams();
  if (ids && ids.length) params.set('ids', ids.join(','));
  if (question) params.set('question', question);
  const query = params.toString();
  return request<ExperimentComparison>(`/experiments/comparison${query ? `?${query}` : ''}`);
}
