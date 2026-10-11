export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function apiQuery(query: string, mode: 'llm' | 'rag' | 'rag_eval', topK = 5) {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, mode, top_k: topK }),
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  
  return response.json();
}

export async function apiGetDocuments() {
  const response = await fetch(`${API_BASE_URL}/documents`);
  return response.json();
}

export async function apiGetDemoCases() {
  const response = await fetch(`${API_BASE_URL}/demo-cases`);
  return response.json();
}

export async function apiHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  return response.json();
}