import type {
  DemoCase,
  Document,
  HealthResponse,
  Mode,
  QueryResponse,
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
  topK = 5
): Promise<QueryResponse> {
  return request<QueryResponse>('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, mode, top_k: topK }),
  });
}

export async function apiGetDocuments(): Promise<{ documents: Document[] }> {
  return request<{ documents: Document[] }>('/documents');
}

export async function apiGetDemoCases(): Promise<{ cases: DemoCase[] }> {
  return request<{ cases: DemoCase[] }>('/demo-cases');
}

export async function apiHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}
