'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiGetDemoCases } from '@/lib/api';
import type { DemoCase } from '@/types';
import { cn } from '@/lib/utils';
import { GitCompare, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ComparisonData {
  metric: string;
  withoutRag: number;
  withRag: number;
  unit: string;
}

export default function ComparePage() {
  const [demoCases, setDemoCases] = useState<DemoCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await apiGetDemoCases();
        setDemoCases(data.cases || []);
      } catch (err) {
        console.error('Failed to load demo cases:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Calculate comparison data from real demo cases
  const llmCase = demoCases.find((c) => c.mode === 'llm');
  const ragCase = demoCases.find((c) => c.mode === 'rag');
  const ragEvalCase = demoCases.find((c) => c.mode === 'rag_eval');

  const comparisonData: ComparisonData[] = [];

  if (llmCase && ragCase) {
    comparisonData.push(
      { metric: 'Retrieval', withoutRag: llmCase.evaluation.retrieval, withRag: ragCase.evaluation.retrieval, unit: '%' },
      { metric: 'Groundedness', withoutRag: llmCase.evaluation.groundedness, withRag: ragCase.evaluation.groundedness, unit: '%' },
      { metric: 'Citation', withoutRag: llmCase.evaluation.citation, withRag: ragCase.evaluation.citation, unit: '%' },
    );
  }

  const getChange = (without: number, withRag: number) => {
    const diff = withRag - without;
    if (diff > 0.1) return { icon: TrendingUp, color: 'text-success', label: 'Improved' };
    if (diff < -0.1) return { icon: TrendingDown, color: 'text-destructive', label: 'Decreased' };
    return { icon: Minus, color: 'text-muted-foreground', label: 'No change' };
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Compare</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visual comparison of LLM responses with and without retrieval augmentation
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          {/* Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="h-4 w-4" />
                Metric Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Metric</th>
                      <th className="pb-3 text-right text-sm font-medium text-muted-foreground">Without RAG</th>
                      <th className="pb-3 text-right text-sm font-medium text-muted-foreground">With RAG</th>
                      <th className="pb-3 text-right text-sm font-medium text-muted-foreground">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonData.map((row) => {
                      const change = getChange(row.withoutRag, row.withRag);
                      const ChangeIcon = change.icon;
                      return (
                        <tr key={row.metric} className="border-b border-border/50 last:border-0">
                          <td className="py-4 text-sm font-medium">{row.metric}</td>
                          <td className="py-4 text-right">
                            <span className="font-mono text-sm">{(row.withoutRag * 100).toFixed(0)}{row.unit}</span>
                          </td>
                          <td className="py-4 text-right">
                            <span className="font-mono text-sm">{(row.withRag * 100).toFixed(0)}{row.unit}</span>
                          </td>
                          <td className="py-4 text-right">
                            <div className={cn('flex items-center justify-end gap-1', change.color)}>
                              <ChangeIcon className="h-4 w-4" />
                              <span className="text-xs">{change.label}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Visual Comparison */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {comparisonData.map((row) => (
              <Card key={row.metric}>
                <CardHeader>
                  <CardTitle className="text-base">{row.metric}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Without RAG</span>
                        <span className="text-xs font-mono">{(row.withoutRag * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-3 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-muted-foreground transition-all duration-500"
                          style={{ width: `${row.withoutRag * 100}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">With RAG</span>
                        <span className="text-xs font-mono">{(row.withRag * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-3 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${row.withRag * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Case Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Case-by-Case Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demoCases.map((demoCase) => (
                  <div key={demoCase.id} className="rounded-lg border border-border/50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{demoCase.name}</span>
                      <Badge variant="outline">{demoCase.mode}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{demoCase.description}</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <span className="text-xs text-muted-foreground">Retrieval</span>
                        <p className="text-sm font-mono">{(demoCase.evaluation.retrieval * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Groundedness</span>
                        <p className="text-sm font-mono">{(demoCase.evaluation.groundedness * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Citation</span>
                        <p className="text-sm font-mono">{(demoCase.evaluation.citation * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
