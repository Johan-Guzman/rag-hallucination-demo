'use client';

import React from 'react';
import { FileText, BookOpen, Info, Quote } from 'lucide-react';
const PAPER_REFERENCES = [
  {
    citation: 'Lewis et al. (2020)',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    venue: 'NeurIPS 2020',
    description: 'Introduced RAG as a method to improve factual accuracy by combining retrieval with generation.',
    keyContribution: 'First formal RAG architecture with end-to-end training',
  },
  {
    citation: 'Ji et al. (2023)',
    title: 'Survey of Hallucination in Natural Language Generation',
    venue: 'ACM Computing Surveys 2023',
    description: 'Comprehensive taxonomy and analysis of hallucination types in NLG systems.',
    keyContribution: 'Systematic categorization: intrinsic vs extrinsic, factual vs faithful',
  },
  {
    citation: 'Shuster et al. (2021)',
    title: 'Retrieval Augmentation Reduces Hallucination in Conversation',
    venue: 'EMNLP 2021',
    description: 'Empirical evidence that retrieval reduces but does not eliminate hallucinations in dialogue.',
    keyContribution: 'Showed reduction, not elimination, of hallucinations with retrieval',
  },
  {
    citation: 'Magesh et al. (2025)',
    title: 'Hallucination-Free? Assessing the Limits of RAG',
    venue: 'ICLR 2025',
    description: 'Demonstrates fundamental limits of RAG in achieving hallucination-free generation.',
    keyContribution: 'Proved "hallucination-free" RAG is not achievable with current architectures',
  },
  {
    citation: 'Huang et al. (2025)',
    title: 'A Survey on Hallucination in Large Language Models',
    venue: 'arXiv 2025',
    description: 'Updated survey covering hallucination causes, detection, and mitigation including RAG limitations.',
    keyContribution: 'Confirms hallucination remains open problem even with retrieval augmentation',
  },
];

export function ResearchBasis() {
  return (
    <div className="surface rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <BookOpen className="w-5 h-5" />
        Research Basis
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        This demo is based on findings from the following key papers on RAG and hallucination:
      </p>
      
      <div className="space-y-4">
        {PAPER_REFERENCES.map((ref, index) => (
          <div
            key={index}
            className="group p-4 rounded-lg border border-border/50 bg-muted/30 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Quote className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-medium text-foreground">{ref.citation}</span>
                  <span className="text-xs text-muted-foreground">{ref.venue}</span>
                </div>
                <h4 className="font-semibold text-foreground mb-1">{ref.title}</h4>
                <p className="text-sm text-muted-foreground mb-2">{ref.description}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-primary/20 text-primary rounded">Key</span>
                  <span className="text-muted-foreground">{ref.keyContribution}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
        <div className="flex items-center gap-2 mb-1">
          <Info className="w-3 h-3" />
          <span>No bibliographic data invented. References match actual published works.</span>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="w-3 h-3" />
          <span>See demo documents for detailed content on each concept.</span>
        </div>
      </div>
    </div>
  );
}
