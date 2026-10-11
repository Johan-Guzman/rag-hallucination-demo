'use client';

import React, { useState, useCallback } from 'react';
import { Send, Loader2, Zap, ArrowRight, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DemoCase } from '@/types';

interface QueryInputProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  isRunning: boolean;
  mode: 'llm' | 'rag' | 'rag_eval';
  demoCases: DemoCase[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
}

export function QueryInput({ 
  query, 
  onQueryChange, 
  onSubmit, 
  isRunning, 
  mode,
  demoCases,
  selectedCaseId,
  onSelectCase
}: QueryInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isRunning && query.trim()) {
        onSubmit();
      }
    }
  };

  const modeCases = demoCases.filter(c => c.mode === mode);

  return (
    <div className="surface rounded-2xl p-5">
      <div className="space-y-4">
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder={selectedCaseId 
              ? `Running demo case... (press Enter to run custom query)`
              : 'Enter your question about RAG, hallucinations, retrieval, groundedness, citations...'}
            className={cn(
              'w-full min-h-[100px] max-h-[200px] resize-y',
              'bg-background border-border/50 focus:border-primary/50',
              'px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground',
              'rounded-lg transition-colors',
              isRunning && 'opacity-50'
            )}
            rows={4}
          />
          {selectedCaseId && (
            <div className="absolute bottom-2 right-2">
              <button
                onClick={() => onSelectCase(null)}
                className="inline-flex items-center gap-1 rounded-md p-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="w-3 h-3" />
                Clear Case
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedCaseId && modeCases.find(c => c.id === selectedCaseId) && (
              <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded">
                Demo: {modeCases.find(c => c.id === selectedCaseId)!.name}
              </span>
            )}
            {!selectedCaseId && modeCases.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {modeCases.length} demo cases available for {mode.toUpperCase()} mode
              </span>
            )}
          </div>

          <button
            onClick={onSubmit}
            disabled={isRunning || !query.trim()}
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90',
              isRunning && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running Experiment...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Run Experiment
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to run, 
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
