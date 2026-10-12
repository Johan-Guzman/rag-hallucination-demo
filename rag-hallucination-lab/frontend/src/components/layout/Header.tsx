'use client';

import { useEffect, useState } from 'react';
import { FlaskConical, Github, BookOpen, AlertTriangle, Sparkles, Database } from 'lucide-react';
import Link from 'next/link';
import { apiHealth } from '@/lib/api';
import type { HealthResponse } from '@/types';

export function Header() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    apiHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const isMock = health ? health.mock_mode : true;
  const providerLabel = health
    ? health.provider === 'gemini'
      ? `GEMINI${health.model ? ` · ${health.model}` : ''}`
      : 'MOCK MODE'
    : '…';

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FlaskConical className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">RAG Hallucination Lab</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Evidence-led RAG evaluation</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="#"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Documentation</span>
          </Link>
          <Link
            href="#"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Link>

          {health && (
            <div className="hidden items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground md:flex">
              <Database className="h-3 w-3" />
              <span>{health.documents ?? 0} docs</span>
            </div>
          )}

          <div
            className={
              isMock
                ? 'flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning'
                : 'flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success'
            }
            title={
              isMock
                ? 'Modo mock: respuestas del conjunto de demostración, sin llamadas a un LLM real.'
                : 'Modo Gemini: generación real a través de Google Gemini.'
            }
          >
            {isMock ? <AlertTriangle className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            <span className="max-w-[160px] truncate">{providerLabel}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
