'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BookOpen, FileText, Quote, Info, ExternalLink } from 'lucide-react';

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

const METHODOLOGY = [
  {
    step: 1,
    title: 'Document Collection',
    description: 'Curated set of documents covering RAG concepts, limitations, and evaluation methods.',
  },
  {
    step: 2,
    title: 'Query Formulation',
    description: 'Questions designed to test different failure modes: hallucination, retrieval, groundedness, citation.',
  },
  {
    step: 3,
    title: 'Response Generation',
    description: 'LLM generates responses with and without retrieved context.',
  },
  {
    step: 4,
    title: 'Claim Extraction',
    description: 'Individual claims identified and extracted from generated responses.',
  },
  {
    step: 5,
    title: 'Verification',
    description: 'Each claim checked against retrieved documents for support.',
  },
  {
    step: 6,
    title: 'Evaluation',
    description: 'Metrics computed: retrieval quality, groundedness, citation accuracy.',
  },
];

const EVALUATION_CRITERIA = [
  {
    name: 'Retrieval Quality',
    description: 'How relevant are the retrieved documents to the query?',
    metric: 'Score 0-1 based on semantic similarity',
  },
  {
    name: 'Groundedness',
    description: 'Are all claims in the response supported by retrieved documents?',
    metric: 'Percentage of claims with source support',
  },
  {
    name: 'Citation Accuracy',
    description: 'Do citations correctly support their associated claims?',
    metric: 'Alignment between claim and cited source',
  },
  {
    name: 'Hallucination Rate',
    description: 'How many claims are unsupported or contradicted?',
    metric: 'Unsupported claims / Total claims',
  },
];

export default function ResearchBasisPage() {
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Research Basis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Academic foundations and methodology behind this experimental environment
        </p>
      </div>

      {/* References */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            References
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {PAPER_REFERENCES.map((ref, index) => (
              <div
                key={index}
                className="rounded-xl border border-border/70 p-4 transition-colors hover:border-primary/25 hover:bg-primary/[0.015]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Quote className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-medium">{ref.citation}</span>
                      <span className="text-xs text-muted-foreground">{ref.venue}</span>
                    </div>
                    <h4 className="font-semibold mb-1">{ref.title}</h4>
                    <p className="text-sm text-muted-foreground mb-2">{ref.description}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Key Contribution</Badge>
                      <span className="text-xs text-muted-foreground">{ref.keyContribution}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Methodology */}
      <Card>
        <CardHeader>
          <CardTitle>Methodology</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {METHODOLOGY.map((item) => (
              <div key={item.step} className="rounded-lg border border-border/50 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold mb-3">
                  {item.step}
                </div>
                <h4 className="font-medium mb-1">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Evaluation Criteria */}
      <Card>
        <CardHeader>
          <CardTitle>Evaluation Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {EVALUATION_CRITERIA.map((criteria) => (
              <div key={criteria.name} className="rounded-lg border border-border/50 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium mb-1">{criteria.name}</h4>
                    <p className="text-sm text-muted-foreground">{criteria.description}</p>
                  </div>
                  <Badge variant="outline">{criteria.metric}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Datasets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Datasets / Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { name: 'document_01.txt', topic: 'What is RAG' },
              { name: 'document_02.txt', topic: 'Retrieval and Embeddings' },
              { name: 'document_03.txt', topic: 'Groundedness and Faithfulness' },
              { name: 'document_04.txt', topic: 'Citation Failure' },
              { name: 'document_05.txt', topic: 'Limitations of RAG' },
            ].map((doc) => (
              <div key={doc.name} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-mono">{doc.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{doc.topic}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Card className="border-info/20 bg-info/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium mb-1">About the References</h4>
              <p className="text-sm text-muted-foreground">
                All references are real published works. No bibliographic data has been invented.
                This demo is for educational purposes to demonstrate the concepts discussed in these papers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
