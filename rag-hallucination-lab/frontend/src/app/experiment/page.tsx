'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiQuery, apiGetDemoCases } from '@/lib/api';
import type { QueryResponse, DemoCase, Mode } from '@/types';
import { cn } from '@/lib/utils';
import {
  Play,
  Loader2,
  Brain,
  Search,
  Scale,
  CheckCircle,
  AlertTriangle,
  XCircle,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  FlaskConical,
} from 'lucide-react';

const MODES = [
  { value: 'llm' as const, label: 'LLM Only', icon: Brain, color: 'text-foreground' },
  { value: 'rag' as const, label: 'RAG', icon: Search, color: 'text-primary' },
  { value: 'rag_eval' as const, label: 'RAG + Eval', icon: Scale, color: 'text-success' },
];

const RESULT_CONFIG: Record<string, { icon: typeof AlertTriangle; color: string; label: string }> = {
  hallucination_risk: { icon: AlertTriangle, color: 'text-destructive', label: 'Hallucination Risk' },
  grounded_answer: { icon: CheckCircle, color: 'text-success', label: 'Grounded Answer' },
  retrieval_failure: { icon: AlertTriangle, color: 'text-warning', label: 'Retrieval Failure' },
  groundedness_failure: { icon: XCircle, color: 'text-destructive', label: 'Groundedness Failure' },
  citation_failure: { icon: AlertTriangle, color: 'text-warning', label: 'Citation Failure' },
};

export default function ExperimentPage() {
  const [mode, setMode] = useState<Mode>('rag_eval');
  const [query, setQuery] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [demoCases, setDemoCases] = useState<DemoCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDemoCases();
  }, []);

  const loadDemoCases = async () => {
    try {
      const data = await apiGetDemoCases();
      setDemoCases(data.cases || []);
    } catch (err) {
      console.error('Failed to load demo cases:', err);
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!query.trim() || isRunning) return;
    setIsRunning(true);
    setError(null);
    try {
      const result = await apiQuery(query, mode);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsRunning(false);
    }
  }, [query, mode, isRunning]);

  const handleRunDemoCase = useCallback(async (caseId: string) => {
    const demoCase = demoCases.find((c) => c.id === caseId);
    if (!demoCase) return;
    setSelectedCaseId(caseId);
    setQuery(demoCase.query);
    setMode(demoCase.mode);
    setIsRunning(true);
    setError(null);
    try {
      const result = await apiQuery(demoCase.query, demoCase.mode);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsRunning(false);
    }
  }, [demoCases]);

  const filteredCases = demoCases.filter((c) => c.mode === mode);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Experiment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run experiments comparing LLM responses with and without retrieval augmentation
        </p>
      </div>

      {/* Mode Selector */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-border/70 bg-card p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.02)]">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              mode === m.value
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <m.icon className="h-4 w-4" />
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Query Input */}
          <Card>
            <CardHeader>
              <CardTitle>Query</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter your question about RAG, hallucinations, retrieval, groundedness..."
                  className="w-full min-h-[120px] rounded-xl border border-input bg-background px-4 py-3 text-sm leading-6 placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                  rows={4}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Press Enter to run, Shift+Enter for new line
                  </span>
                  <Button onClick={handleSubmit} disabled={isRunning || !query.trim()}>
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Run Experiment
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Error:</span>
                  <span className="text-sm">{error}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {response && (
            <>
              {/* Pipeline */}
              <Card>
                <CardHeader>
                  <CardTitle>Pipeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    {['query', 'retrieval', 'context', 'generation', 'evaluation'].map((stage, i) => {
                      const status = response.pipeline[stage as keyof typeof response.pipeline];
                      return (
                        <div key={stage} className="flex items-center">
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                'flex h-10 w-10 items-center justify-center rounded-full border-2',
                                status === 'success' && 'border-success/50 bg-success/10 text-success',
                                status === 'warning' && 'border-warning/50 bg-warning/10 text-warning',
                                status === 'failure' && 'border-destructive/50 bg-destructive/10 text-destructive',
                                status === 'idle' && 'border-border/50 bg-muted/30 text-muted-foreground'
                              )}
                            >
                              {status === 'success' && <CheckCircle className="h-5 w-5" />}
                              {status === 'warning' && <AlertTriangle className="h-5 w-5" />}
                              {status === 'failure' && <XCircle className="h-5 w-5" />}
                              {status === 'idle' && <div className="h-2 w-2 rounded-full bg-muted-foreground" />}
                            </div>
                            <span className="mt-2 text-xs capitalize">{stage}</span>
                          </div>
                          {i < 4 && (
                            <div className="mx-2 h-0.5 w-8 bg-border/50" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Response Comparison */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Documents */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Retrieved Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {response.documents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No documents retrieved</p>
                    ) : (
                      <div className="space-y-2">
                        {response.documents.map((doc, i) => (
                          <div key={doc.id} className="rounded-lg border border-border/50 p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{doc.name}</span>
                              <Badge variant="outline">{(doc.score * 100).toFixed(0)}%</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{doc.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Answer */}
                <Card>
                  <CardHeader>
                    <CardTitle>Response</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{response.answer}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Claims */}
              {response.claims.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Claim Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {response.claims.map((claim, i) => {
                        const statusConfig = {
                          supported: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
                          unsupported: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
                          contradicted: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
                          uncertain: { icon: HelpCircle, color: 'text-info', bg: 'bg-info/10' },
                        }[claim.status];
                        const Icon = statusConfig.icon;
                        return (
                          <div key={i} className={cn('rounded-lg border border-border/50 p-4', statusConfig.bg)}>
                            <div className="flex items-start gap-3">
                              <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', statusConfig.color)} />
                              <div>
                                <p className="text-sm font-medium">{claim.text}</p>
                                {claim.explanation && (
                                  <p className="mt-1 text-xs text-muted-foreground">{claim.explanation}</p>
                                )}
                                {claim.source && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Source: {claim.source}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Evaluation */}
              <Card>
                <CardHeader>
                  <CardTitle>Evaluation Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { key: 'retrieval', label: 'Retrieval', value: response.evaluation.retrieval },
                      { key: 'groundedness', label: 'Groundedness', value: response.evaluation.groundedness },
                      { key: 'citation', label: 'Citation', value: response.evaluation.citation },
                    ].map((metric) => (
                      <div key={metric.key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{metric.label}</span>
                          <span className="text-sm font-mono">{(metric.value * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              metric.value >= 0.8 ? 'bg-success' : metric.value >= 0.6 ? 'bg-warning' : 'bg-destructive'
                            )}
                            style={{ width: `${metric.value * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Empty State */}
          {!response && !isRunning && (
            <Card>
              <CardContent className="py-12 text-center">
                <FlaskConical className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <h3 className="text-lg font-medium mb-2">Ready to Experiment</h3>
                <p className="text-sm text-muted-foreground">
                  Enter a question above or select a demo case from the sidebar
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Demo Cases */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Demo Cases</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredCases.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cases for this mode</p>
              ) : (
                <div className="space-y-2">
                  {filteredCases.map((demoCase) => {
                    const config = RESULT_CONFIG[demoCase.expected_result];
                    const Icon = config.icon;
                    const isExpanded = expandedCase === demoCase.id;
                    return (
                      <div
                        key={demoCase.id}
                        className="rounded-lg border border-border/50 overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedCase(isExpanded ? null : demoCase.id)}
                          className="w-full p-3 text-left hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={cn('h-4 w-4', config.color)} />
                            <span className="text-sm font-medium flex-1 truncate">{demoCase.name}</span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-border/50 p-3 bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-2">{demoCase.description}</p>
                            <p className="text-xs font-mono mb-3 p-2 bg-background rounded">{demoCase.query}</p>
                            <Button
                              size="sm"
                              onClick={() => handleRunDemoCase(demoCase.id)}
                              disabled={isRunning}
                              className="w-full"
                            >
                              {isRunning ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                              Run Case
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
