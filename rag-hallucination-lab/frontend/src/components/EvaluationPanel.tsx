'use client';

import React from 'react';
import { BarChart3, TrendingUp, Target, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn, formatScore, getScoreColor } from '@/lib/utils';
import type { Evaluation } from '@/types';

interface EvaluationPanelProps {
  evaluation: Evaluation;
  mode: 'llm' | 'rag' | 'rag_eval';
}

const METRICS = [
  {
    key: 'retrieval' as keyof Evaluation,
    label: 'Retrieval',
    description: 'Quality of document retrieval',
    icon: Target,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400',
  },
  {
    key: 'groundedness' as keyof Evaluation,
    label: 'Groundedness',
    description: 'Answer supported by retrieved docs',
    icon: CheckCircle2,
    color: 'text-green-400',
    bgColor: 'bg-green-400',
  },
  {
    key: 'citation' as keyof Evaluation,
    label: 'Citation',
    description: 'Accuracy of source citations',
    icon: BarChart3,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400',
  },
];

export function EvaluationPanel({ evaluation, mode }: EvaluationPanelProps) {
  const isMockMode = true;

  if (mode === 'llm') {
    return (
      <div className="surface rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Evaluation
          </h3>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Evaluation not available in LLM-only mode</p>
          <p className="text-sm mt-1">Switch to RAG or RAG + Evaluation mode to see metrics</p>
        </div>
        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
          <Info className="w-3 h-3 inline mr-1" />
          Demo metric — illustrative only
        </div>
      </div>
    );
  }

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Evaluation Metrics
        </h3>
      </div>

      <div className="space-y-5">
        {METRICS.map((metric) => {
          const score = evaluation[metric.key];
          const Icon = metric.icon;
          const percentage = Math.round(score * 100);
          
          return (
            <div className="group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className={cn('w-4 h-4', metric.color)} />
                  <span className="font-medium text-foreground">{metric.label}</span>
                </div>
                <span className={cn('font-mono font-semibold text-lg', getScoreColor(score))}>
                  {percentage}%
                </span>
              </div>
              <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-1000 ease-out',
                    metric.bgColor
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="w-3 h-3 flex-shrink-0" />
          <span>Demo metric — illustrative only. Not scientific results.</span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground/70">
          Mode: <span className="font-mono text-foreground">{mode.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
