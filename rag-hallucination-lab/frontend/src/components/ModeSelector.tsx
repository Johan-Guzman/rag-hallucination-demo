'use client';

import React from 'react';
import { Brain, Search, Scale, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModeSelectorProps {
  mode: 'llm' | 'rag' | 'rag_eval';
  onModeChange: (mode: 'llm' | 'rag' | 'rag_eval') => void;
  disabled?: boolean;
}

const MODES = [
  {
    value: 'llm' as const,
    label: 'LLM Only',
    description: 'Pure parametric knowledge\nNo retrieval',
    icon: Brain,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/30',
  },
  {
    value: 'rag' as const,
    label: 'RAG',
    description: 'Retrieval + Generation\nDocuments as context',
    icon: Search,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
  },
  {
    value: 'rag_eval' as const,
    label: 'RAG + Evaluation',
    description: 'Full pipeline with\ngroundedness & citation check',
    icon: Scale,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    borderColor: 'border-green-400/30',
  },
];

export function ModeSelector({ mode, onModeChange, disabled }: ModeSelectorProps) {
  return (
    <div className="surface rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-foreground mb-4">Mode Selector</h3>
      <div className="grid grid-cols-3 gap-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => !disabled && onModeChange(m.value)}
            disabled={disabled}
            className={cn(
              'relative p-4 rounded-lg border-2 transition-all duration-200 text-left',
              mode === m.value
                ? `${m.borderColor} ${m.bgColor}`
                : 'border-border/50 hover:border-primary/30 hover:bg-accent'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <m.icon className="w-5 h-5" />
              <span className="font-semibold text-foreground">{m.label}</span>
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-line">
              {m.description}
            </p>
            {mode === m.value && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Info className="w-3 h-3" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
