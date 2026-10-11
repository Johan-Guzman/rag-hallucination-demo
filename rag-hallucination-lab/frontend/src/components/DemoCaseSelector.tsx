
'use client';

import React, { useState } from 'react';
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DemoCase, Mode } from '@/types';

interface DemoCaseSelectorProps {
  cases: DemoCase[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
  onRunCase: (caseId: string) => void;
  isRunning: boolean;
  currentMode: Mode;
}

const modeLabels = {
  llm: 'LLM Only',
  rag: 'RAG',
  rag_eval: 'RAG + Eval',
};

const resultIcons: Record<string, typeof AlertTriangle> = {
  hallucination_risk: AlertTriangle,
  grounded_answer: CheckCircle2,
  retrieval_failure: AlertTriangle,
  groundedness_failure: AlertTriangle,
  citation_failure: AlertTriangle,
};

const resultLabels: Record<string, string> = {
  hallucination_risk: 'Hallucination Risk',
  grounded_answer: 'Grounded Answer',
  retrieval_failure: 'Retrieval Failure',
  groundedness_failure: 'Groundedness Failure',
  citation_failure: 'Citation Failure',
};

const resultColors: Record<string, string> = {
  hallucination_risk: 'border-destructive/30 bg-destructive/5',
  grounded_answer: 'border-success/30 bg-success/5',
  retrieval_failure: 'border-warning/30 bg-warning/5',
  groundedness_failure: 'border-destructive/30 bg-destructive/5',
  citation_failure: 'border-warning/30 bg-warning/5',
};

export function DemoCaseSelector({
  cases,
  selectedCaseId,
  onSelectCase,
  onRunCase,
  isRunning,
  currentMode,
}: DemoCaseSelectorProps) {
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const filteredCases = cases.filter((c) => c.mode === currentMode);

  if (filteredCases.length === 0) {
    return (
      <div className="surface rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Demo Cases
        </h3>

        <p className="text-muted-foreground text-sm">
          No demo cases available for this mode
        </p>
      </div>
    );
  }

  return (
    <div className="surface rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Demo Cases
      </h3>

      <div className="space-y-2">
        {filteredCases.map((demoCase) => {
          const isSelected = selectedCaseId === demoCase.id;
          const isExpanded = expandedCase === demoCase.id;

          const Icon = resultIcons[demoCase.expected_result] || Info;

          return (
            <div
              key={demoCase.id}
              className={cn(
                'group relative overflow-hidden rounded-lg border transition-all duration-200',
                isSelected
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border/50 hover:border-primary/30',
                resultColors[demoCase.expected_result]
              )}
            >
              {/* Header del caso */}
              <div className="w-full p-4 flex items-start gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onSelectCase(isSelected ? null : demoCase.id)
                  }
                  className="flex-1 min-w-0 text-left flex items-start gap-3"
                >
                  <div
                    className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                      isSelected
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted/50 text-muted-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-foreground truncate">
                        {demoCase.name}
                      </h4>

                      {isSelected && (
                        <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded-full">
                          SELECTED
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {demoCase.description}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs px-2 py-0.5 bg-muted/50 rounded text-muted-foreground">
                        {modeLabels[demoCase.mode]}
                      </span>

                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor:
                            demoCase.expected_result === 'grounded_answer'
                              ? 'rgba(34, 197, 94, 0.15)'
                              : demoCase.expected_result ===
                                  'hallucination_risk' ||
                                demoCase.expected_result ===
                                  'groundedness_failure'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(234, 179, 8, 0.15)',

                          color:
                            demoCase.expected_result === 'grounded_answer'
                              ? 'rgb(34, 197, 94)'
                              : demoCase.expected_result ===
                                  'hallucination_risk' ||
                                demoCase.expected_result ===
                                  'groundedness_failure'
                              ? 'rgb(239, 68, 68)'
                              : 'rgb(234, 179, 8)',
                        }}
                      >
                        {resultLabels[demoCase.expected_result]}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Botón expandir */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCase(isExpanded ? null : demoCase.id)
                  }
                  className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Contenido expandido */}
              {isExpanded && (
                <div className="border-t border-border/50 p-4 bg-muted/30 animate-slide-up">
                  <div className="mb-3">
                    <span className="font-medium text-muted-foreground">
                      Query:{' '}
                    </span>

                    <span className="font-mono text-sm text-foreground">
                      {demoCase.query}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onRunCase(demoCase.id)}
                      disabled={isRunning}
                      className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isRunning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}

                      {isRunning ? 'Running...' : 'Run This Case'}
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectCase(null)}
                      className="flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
