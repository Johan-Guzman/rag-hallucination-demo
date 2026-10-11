'use client';

import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, HelpCircle, Info, FileText } from 'lucide-react';
import { cn, getClaimStatusColor, getClaimStatusLabel } from '@/lib/utils';
import type { Claim, Document, PipelineState } from '@/types';

interface AnswerCardProps {
  answer: string;
  claims: Claim[];
  documents: Document[];
  mode: 'llm' | 'rag' | 'rag_eval';
  pipeline: PipelineState;
}

const statusIcons = {
  supported: CheckCircle,
  unsupported: AlertTriangle,
  contradicted: XCircle,
  uncertain: HelpCircle,
};

const statusLabels = {
  supported: 'Supported',
  unsupported: 'Unsupported',
  contradicted: 'Contradicted',
  uncertain: 'Uncertain',
};

const statusDescriptions = {
  supported: 'Claim is supported by the cited source',
  unsupported: 'Claim lacks support from the cited source',
  contradicted: 'Claim is contradicted by the cited source',
  uncertain: 'Insufficient information to verify',
};

export function AnswerCard({ answer, claims, documents, mode, pipeline }: AnswerCardProps) {
  const hasClaims = claims.length > 0;
  const generationStatus = pipeline.generation || 'idle';
  const evaluationStatus = pipeline.evaluation || 'idle';

  return (
    <div className="surface flex h-full flex-col rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Generated Answer
        </h3>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-xs px-2 py-1 rounded-full font-medium',
            generationStatus === 'warning' && 'text-warning border-warning/30 bg-warning/10',
            generationStatus === 'success' && 'text-success border-success/30 bg-success/10',
            generationStatus === 'failure' && 'text-destructive border-destructive/30 bg-destructive/10',
            generationStatus === 'idle' && 'text-muted-foreground border-border/30 bg-muted/30',
          )}>
            Gen: {generationStatus}
          </span>
          <span className={cn(
            'text-xs px-2 py-1 rounded-full font-medium',
            evaluationStatus === 'warning' && 'text-warning border-warning/30 bg-warning/10',
            evaluationStatus === 'success' && 'text-success border-success/30 bg-success/10',
            evaluationStatus === 'failure' && 'text-destructive border-destructive/30 bg-destructive/10',
            evaluationStatus === 'idle' && 'text-muted-foreground border-border/30 bg-muted/30',
          )}>
            Eval: {evaluationStatus}
          </span>
        </div>
      </div>

      <div className="prose prose-invert max-w-none mb-6 p-4 bg-muted/30 rounded-lg">
        <p className="whitespace-pre-wrap text-foreground">{answer}</p>
      </div>

      {hasClaims && (
        <div className="border-t border-border/50 pt-4">
          <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Claim Analysis
            <span className="text-xs text-muted-foreground font-normal">
              ({claims.length} claims detected)
            </span>
          </h4>
          
          <div className="space-y-3">
            {claims.map((claim, index) => {
              const Icon = statusIcons[claim.status];
              const sourceDoc = claim.source 
                ? documents.find(d => d.id === claim.source)
                : null;
              
              return (
                <div
                  key={index}
                  className={cn(
                    'rounded-lg p-4 transition-all duration-200',
                    getClaimStatusColor(claim.status)
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          getClaimStatusColor(claim.status)
                        )}>
                          {getClaimStatusLabel(claim.status)}
                        </span>
                        {claim.confidence > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Confidence: {(claim.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground/90 font-mono">{claim.text}</p>
                      {claim.explanation && (
                        <p className="text-xs text-muted-foreground mt-1">{claim.explanation}</p>
                      )}
                      {sourceDoc && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <FileText className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Source:</span>
                          <span className="font-mono text-primary">{sourceDoc.name}</span>
                          <span className="text-muted-foreground">(score: {(sourceDoc.score * 100).toFixed(0)}%)</span>
                        </div>
                      )}
                      {!claim.source && claim.status !== 'supported' && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          No source cited
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasClaims && mode !== 'llm' && (
        <div className="border-t border-border/50 pt-4 text-center text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No claims extracted for analysis</p>
          <p className="text-xs mt-1">Enable RAG + Evaluation mode for claim-level analysis</p>
        </div>
      )}
    </div>
  );
}
