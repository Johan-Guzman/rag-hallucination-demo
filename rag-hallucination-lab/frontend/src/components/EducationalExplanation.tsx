'use client';

import React from 'react';
import { Lightbulb, AlertCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DemoCase, PipelineState } from '@/types';

interface EducationalExplanationProps {
  explanation?: string | null;
  case?: DemoCase | null;
  mode: 'llm' | 'rag' | 'rag_eval';
  pipeline: PipelineState;
}

export function EducationalExplanation({ explanation, case: demoCase, mode, pipeline }: EducationalExplanationProps) {
  if (!explanation && !demoCase) return null;

  const hasFailure = 
    pipeline.generation === 'warning' || 
    pipeline.generation === 'failure' ||
    pipeline.evaluation === 'warning' ||
    pipeline.evaluation === 'failure' ||
    pipeline.retrieval === 'warning' ||
    pipeline.retrieval === 'failure';

  const getIcon = () => {
    if (pipeline.retrieval === 'warning' || pipeline.retrieval === 'failure') return AlertCircle;
    if (pipeline.generation === 'warning' || pipeline.generation === 'failure') return AlertCircle;
    if (pipeline.evaluation === 'warning' || pipeline.evaluation === 'failure') return AlertCircle;
    return Lightbulb;
  };

  const Icon = getIcon();
  const isFailure = hasFailure;

  return (
    <div className={cn(
      'surface relative overflow-hidden rounded-2xl p-5',
      isFailure && 'border-warning/30 bg-warning/5'
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
          isFailure ? 'bg-warning/20 text-warning' : 'bg-primary/20 text-primary'
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-foreground mb-2">
            {isFailure ? 'Why did this happen?' : 'Educational Note'}
          </h4>
          
          {demoCase?.expected_result && (
            <div className="mb-3 p-3 bg-muted/50 rounded-lg text-sm">
              <span className="font-mono text-xs text-muted-foreground">Case: </span>
              <span className="font-medium text-foreground">{demoCase.name}</span>
            </div>
          )}

          <div className="prose prose-invert max-w-none text-sm">
            <p className="text-foreground/90">{explanation || demoCase?.educational_explanation}</p>
          </div>

          {demoCase?.expected_result === 'groundedness_failure' && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="font-semibold text-destructive">KEY FINDING FROM THE PAPER</span>
              </div>
              <p className="text-sm text-foreground/90">
                This demonstrates the central thesis: <strong>RAG can retrieve the correct documents 
                and still generate an incorrect answer.</strong> Retrieval and generation are separate 
                stages — successful retrieval does not guarantee grounded generation.
              </p>
            </div>
          )}

          {demoCase?.expected_result === 'retrieval_failure' && (
            <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                <span className="font-semibold text-warning">RETRIEVAL LIMITATION</span>
              </div>
              <p className="text-sm text-foreground/90">
                The relevant information was not in the corpus, or the embedding model failed to 
                retrieve it. RAG cannot answer questions about knowledge it doesn't have access to.
              </p>
            </div>
          )}

          {demoCase?.expected_result === 'citation_failure' && (
            <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                <span className="font-semibold text-warning">CITATION ACCURACY FAILURE</span>
              </div>
              <p className="text-sm text-foreground/90">
                The system cited a document that actually contradicts the claim. Citation accuracy 
                requires both correct retrieval AND faithful generation — neither alone is sufficient.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
