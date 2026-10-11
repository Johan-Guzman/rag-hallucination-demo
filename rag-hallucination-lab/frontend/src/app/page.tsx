'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGetDemoCases, apiHealth, apiGetDocuments } from '@/lib/api';
import type { DemoCase, HealthResponse, Document } from '@/types';
import {
  FlaskConical,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Brain,
  Search,
  Scale,
} from 'lucide-react';



export default function OverviewPage() {
  const [demoCases, setDemoCases] = useState<DemoCase[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [casesData, healthData, docsData] = await Promise.all([
          apiGetDemoCases(),
          apiHealth(),
          apiGetDocuments(),
        ]);
        setDemoCases(casesData.cases || []);
        setHealth(healthData);
        setDocuments(docsData.documents || []);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const hallucinationCases = demoCases.filter(
    (c) => c.expected_result === 'hallucination_risk' || c.expected_result === 'groundedness_failure'
  ).length;
  const groundedCases = demoCases.filter((c) => c.expected_result === 'grounded_answer').length;

  return (
    <div className="space-y-7">
      {/* Hero Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">v1.0.0</Badge>
          {health && (
            <Badge variant={health.mock_mode ? 'warning' : 'success'}>
              {health.mock_mode ? 'Mock Mode' : 'Live Mode'}
            </Badge>
          )}
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          RAG Hallucination Lab
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Understanding when retrieval helps — and when it doesn&apos;t.
        </p>
        <p className="text-sm text-muted-foreground max-w-3xl">
          An experimental environment for comparing LLM responses with and without retrieval augmentation,
          measuring factuality, groundedness and hallucination.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<FlaskConical className="h-4 w-4" />}
          label="Experiments"
          value={loading ? <Skeleton className="h-8 w-16" /> : demoCases.length}
          description="Demo cases available"
        />
        <MetricCard
          icon={<FileText className="h-4 w-4" />}
          label="Documents"
          value={loading ? <Skeleton className="h-8 w-16" /> : documents.length}
          description="In knowledge base"
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Hallucination Cases"
          value={loading ? <Skeleton className="h-8 w-16" /> : hallucinationCases}
          description="Demonstrated failures"
          variant="warning"
        />
        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Grounded Responses"
          value={loading ? <Skeleton className="h-8 w-16" /> : groundedCases}
          description="Successfully grounded"
          variant="success"
        />
      </div>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Without RAG */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <Brain className="h-4 w-4 text-foreground" />
                </div>
                <h3 className="font-semibold">Without RAG</h3>
              </div>
              <div className="space-y-2">
                <PipelineStep label="Question" />
                <PipelineArrow />
                <PipelineStep label="LLM" />
                <PipelineArrow />
                <PipelineStep label="Response" />
              </div>
              <p className="text-sm text-muted-foreground">
                The model relies solely on its parametric knowledge, which may contain
                incorrect or outdated information.
              </p>
            </div>

            {/* With RAG */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Search className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold">With RAG</h3>
              </div>
              <div className="space-y-2">
                <PipelineStep label="Question" />
                <PipelineArrow />
                <PipelineStep label="Retriever" />
                <PipelineArrow />
                <PipelineStep label="Context" />
                <PipelineArrow />
                <PipelineStep label="LLM" />
                <PipelineArrow />
                <PipelineStep label="Response" />
              </div>
              <p className="text-sm text-muted-foreground">
                Relevant documents are retrieved and provided as context, grounding the
                generation in verified information.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Insight */}
      <Card className="border-primary/15 bg-primary/[0.035]">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Scale className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-2">Key Insight</h3>
              <p className="text-sm text-muted-foreground">
                RAG <strong className="text-foreground">reduces</strong> hallucinations, but does{' '}
                <strong className="text-foreground">not eliminate</strong> them. Even with perfect retrieval,
                the generator may produce unsupported claims. This demo explores the boundaries of
                retrieval-augmented generation as a mitigation mechanism.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  description,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  description: string;
  variant?: 'default' | 'success' | 'warning';
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={
              variant === 'success'
                ? 'text-success'
                : variant === 'warning'
                ? 'text-warning'
                : 'text-muted-foreground'
            }
          >
            {icon}
          </div>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function PipelineStep({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5">
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function PipelineArrow() {
  return (
    <div className="flex justify-center">
      <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground/50" />
    </div>
  );
}
