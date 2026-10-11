'use client';

import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, ExternalLink, Search } from 'lucide-react';
import { cn, formatScore, getScoreColor } from '@/lib/utils';
import type { Document } from '@/types';

interface RetrievedDocumentsProps {
  documents: Document[];
  query?: string;
}

export function RetrievedDocuments({ documents, query }: RetrievedDocumentsProps) {
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  if (!documents.length) {
    return (
      <div className="surface rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Retrieved Documents
        </h3>
        <div className="text-center py-8 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No documents retrieved</p>
          <p className="text-sm mt-1">Try a different query or mode</p>
        </div>
      </div>
    );
  }

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Retrieved Documents
          <span className="text-sm text-muted-foreground font-normal">({documents.length})</span>
        </h3>
      </div>

      <div className="space-y-3">
        {documents.map((doc, index) => (
          <div
            key={doc.id}
            className={cn(
              'group relative overflow-hidden rounded-lg border transition-all duration-200',
              'border-border/50 bg-card hover:border-primary/30'
            )}
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{index + 1}
                    </span>
                    <h4 className="font-medium text-foreground truncate">{doc.name}</h4>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={cn('font-medium', getScoreColor(doc.score))}>
                      Similarity: {formatScore(doc.score)}
                    </span>
                    <span className="text-muted-foreground">
                      {doc.content.length} chars
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                  className="flex-shrink-0 p-2 rounded-lg bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={expandedDoc === doc.id ? 'Collapse' : 'Expand'}
                >
                  {expandedDoc === doc.id ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>
              </div>

              <div className="mt-3 text-sm text-muted-foreground line-clamp-3 font-mono bg-muted/50 p-3 rounded">
                {doc.content.slice(0, 300)}{doc.content.length > 300 ? '...' : ''}
              </div>
            </div>

            {expandedDoc === doc.id && (
              <div className="border-t border-border/50 bg-muted/30 p-4 animate-slide-up">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="font-medium text-foreground">Full Content</h5>
                  <button
                    onClick={() => setExpandedDoc(null)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
                <div className="font-mono text-sm text-foreground whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {doc.content}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
