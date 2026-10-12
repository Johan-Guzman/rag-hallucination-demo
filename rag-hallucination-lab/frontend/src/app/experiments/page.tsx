'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MetricGrid, ModeLegend } from '@/components/charts/MetricCharts';
import {
  apiDeleteExperiment,
  apiGetDemoCases,
  apiGetDocuments,
  apiGetExperiment,
  apiListExperiments,
  apiQuery,
  apiRunExperiment,
} from '@/lib/api';
import type {
  ClaimStatus,
  DemoCase,
  DocumentRecord,
  Experiment,
  ExperimentCell,
  ExperimentSummary,
  Mode,
  QueryResponse,
} from '@/types';
import { MODE_META } from '@/types';
import { cn } from '@/lib/utils';
import {
  FlaskConical,
  Loader2,
  Play,
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Quote,
  History,
  Info,
  ClipboardList,
  Zap,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  XCircle,
} from 'lucide-react';

const MODES: Mode[] = ['llm', 'rag', 'rag_eval'];

const CLAIM_STYLE: Record<ClaimStatus, { variant: 'success' | 'warning' | 'destructive' | 'outline'; label: string }> = {
  supported: { variant: 'success', label: 'Respaldada' },
  unsupported: { variant: 'warning', label: 'Sin respaldo' },
  contradicted: { variant: 'destructive', label: 'Contradicha' },
  uncertain: { variant: 'outline', label: 'Incierta' },
};

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/D';
  return `${Math.round(value * 100)}%`;
}

function CellColumn({ cell }: { cell: ExperimentCell }) {
  const meta = MODE_META[cell.mode];
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/80 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ background: meta.color }} aria-hidden />
        <span className="text-sm font-semibold">{meta.label}</span>
        {cell.status === 'ok' ? (
          cell.evidence_sufficient === false ? (
            <Badge variant="warning">Evidencia insuficiente</Badge>
          ) : (
            <Badge variant="success">Completado</Badge>
          )
        ) : (
          <Badge variant="destructive">Error</Badge>
        )}
      </div>

      {cell.status === 'error' ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {cell.error || 'La condición falló.'}
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-6">{cell.answer}</p>

          {/* Evidence */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Quote className="h-3 w-3" /> Evidencia recuperada ({cell.documents.length})
            </p>
            {cell.documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Esta condición no recupera fragmentos (sin RAG).
              </p>
            ) : (
              <ul className="space-y-2">
                {cell.documents.map((doc) => (
                  <li key={doc.id} className="rounded-lg border border-border/70 bg-card p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{doc.name}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        score {doc.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {(doc.fragment || doc.content || '').slice(0, 320)}
                      {(doc.fragment || doc.content || '').length > 320 ? ' …' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Claims */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Afirmaciones ({cell.claims.length})
            </p>
            {cell.claims.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin afirmaciones evaluadas.</p>
            ) : (
              <ul className="space-y-1.5">
                {cell.claims.map((claim, index) => {
                  const style = CLAIM_STYLE[claim.status];
                  return (
                    <li key={index} className="flex items-start gap-2">
                      <Badge variant={style.variant}>{style.label}</Badge>
                      <span className="text-xs leading-5">
                        {claim.text}
                        {claim.source ? (
                          <span className="text-muted-foreground"> [{claim.source}]</span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 gap-2 border-t border-border/70 pt-2 text-[11px]">
            <span className="text-muted-foreground">
              Fundamentación:{' '}
              <span className="font-medium text-foreground">
                {pct(cell.metrics?.groundedness)}
              </span>
            </span>
            <span className="text-muted-foreground">
              Citas válidas:{' '}
              <span className="font-medium text-foreground">
                {cell.metrics ? `${cell.metrics.citations_valid}` : 'N/D'}
              </span>
            </span>
            <span className="text-muted-foreground">
              Sin soporte:{' '}
              <span className="font-medium text-foreground">
                {pct(cell.metrics?.unsupported_rate)}
              </span>
            </span>
            <span className="text-muted-foreground">
              Latencia:{' '}
              <span className="font-medium text-foreground">{Math.round(cell.latency_ms)} ms</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function ExperimentResults({ experiment }: { experiment: Experiment }) {
  const [activeQuestion, setActiveQuestion] = useState(experiment.questions[0] ?? '');

  useEffect(() => {
    setActiveQuestion(experiment.questions[0] ?? '');
  }, [experiment.id, experiment.questions]);

  const cellsForQuestion = useMemo(
    () => experiment.cells.filter((c) => c.question === activeQuestion),
    [experiment.cells, activeQuestion]
  );

  const ok = experiment.status_counts.ok ?? 0;
  const error = experiment.status_counts.error ?? 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Resumen de la ejecución
          </CardTitle>
          <CardDescription>Ejecución {experiment.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Preguntas', String(experiment.questions.length)],
              ['Modalidades', experiment.modes.map((m) => MODE_META[m].short).join(' · ')],
              ['Respuestas correctas', String(ok)],
              ['Evaluaciones fallidas', String(error)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/80 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>
              <span className="font-medium text-foreground">Fecha:</span> {experiment.created_at}
            </p>
            <p>
              <span className="font-medium text-foreground">Proveedor:</span>{' '}
              {experiment.provider || 'mock'} {experiment.model ? `(${experiment.model})` : ''}
            </p>
            <p className="sm:col-span-2">
              <span className="font-medium text-foreground">Documentos:</span>{' '}
              {experiment.document_names.length
                ? experiment.document_names.join(', ')
                : '—'}
            </p>
          </div>

          {experiment.notes.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-info/20 bg-info/5 p-3 text-xs text-muted-foreground">
              {experiment.notes.map((note, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Metric comparison */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Comparación de métricas</h2>
          <ModeLegend />
        </div>
        {experiment.aggregates.length ? (
          <MetricGrid aggregates={experiment.aggregates} />
        ) : (
          <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No hay métricas agregadas para esta ejecución.
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          No todas las métricas están definidas para todas las condiciones (por ejemplo, la
          condición A no recupera fragmentos). Se muestran como «N/D» y se excluyen de los
          promedios para no comparar datos que no existen.
        </p>
      </div>

      {/* Per-question comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Comparación por pregunta</CardTitle>
          <CardDescription>
            Selecciona una pregunta para ver la respuesta, la evidencia y la evaluación de cada
            modalidad.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {experiment.questions.map((question, index) => (
              <button
                key={question}
                onClick={() => setActiveQuestion(question)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-left text-xs transition-colors',
                  activeQuestion === question
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <span className="font-semibold">P{index + 1}</span> · {question.slice(0, 44)}
                {question.length > 44 ? '…' : ''}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {cellsForQuestion.map((cell) => (
              <CellColumn key={cell.mode} cell={cell} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PipelineStrip({ response }: { response: QueryResponse }) {
  const stages: (keyof QueryResponse['pipeline'])[] = [
    'query',
    'retrieval',
    'context',
    'generation',
    'evaluation',
  ];
  const labels: Record<string, string> = {
    query: 'Consulta',
    retrieval: 'Recuperación',
    context: 'Contexto',
    generation: 'Generación',
    evaluation: 'Evaluación',
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {stages.map((stage, index) => {
        const status = response.pipeline[stage];
        return (
          <div key={stage} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full border',
                status === 'success' && 'border-success/50 bg-success/10 text-success',
                status === 'warning' && 'border-warning/50 bg-warning/10 text-warning',
                status === 'failure' && 'border-destructive/50 bg-destructive/10 text-destructive',
                (status === 'idle' || status === 'processing') &&
                  'border-border/60 bg-muted/40 text-muted-foreground'
              )}
              title={`${labels[stage]}: ${status}`}
            >
              {status === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {status === 'warning' && <AlertTriangle className="h-4 w-4" />}
              {status === 'failure' && <XCircle className="h-4 w-4" />}
              {(status === 'idle' || status === 'processing') && (
                <div className="h-2 w-2 rounded-full bg-muted-foreground/60" />
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">{labels[stage]}</span>
            {index < stages.length - 1 && <div className="hidden h-px w-5 bg-border sm:block" />}
          </div>
        );
      })}
    </div>
  );
}

function QuickQueryTab({
  demoCases,
  topK,
}: {
  demoCases: DemoCase[];
  topK: number;
}) {
  const [mode, setMode] = useState<Mode>('rag_eval');
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const runQuery = useCallback(
    async (q: string, m: Mode) => {
      if (!q.trim() || running) return;
      setRunning(true);
      setError(null);
      setResponse(null);
      try {
        setResponse(await apiQuery(q, m, topK));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'La consulta falló.');
      } finally {
        setRunning(false);
      }
    },
    [running, topK]
  );

  const runCase = (demoCase: DemoCase) => {
    setQuery(demoCase.query);
    setMode(demoCase.mode);
    runQuery(demoCase.query, demoCase.mode);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Consulta rápida
            </CardTitle>
            <CardDescription>
              Ejecuta una pregunta concreta en una modalidad y examina el pipeline, la evidencia
              recuperada y las afirmaciones evaluadas. Para comparar las tres modalidades a la vez,
              usa la pestaña «Batería de preguntas».
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors',
                    mode === m ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-accent'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: MODE_META[m].color }} />
                    <span className="text-sm font-medium">{MODE_META[m].label}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {MODE_META[m].description}
                  </p>
                </button>
              ))}
            </div>

            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={3}
              placeholder="Escribe una pregunta sobre RAG, alucinaciones, recuperación, groundedness…"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/30"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {running ? 'Ejecutando…' : `top_k = ${topK}`}
              </span>
              <Button onClick={() => runQuery(query, mode)} disabled={running || !query.trim()}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? 'Ejecutando…' : 'Ejecutar consulta'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {response && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <PipelineStrip response={response} />
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Quote className="h-4 w-4 text-muted-foreground" /> Evidencia ({response.documents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {response.documents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Esta condición no recupera fragmentos (sin RAG).
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {response.documents.map((doc) => (
                        <li key={doc.id} className="rounded-lg border border-border/70 p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="truncate text-xs font-medium">{doc.name}</span>
                            <Badge variant="outline">{doc.score.toFixed(2)}</Badge>
                          </div>
                          <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                            {doc.fragment || doc.content}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span>Respuesta</span>
                    {response.provider && (
                      <Badge variant="outline" className="font-normal">
                        {response.provider}
                        {response.model ? ` · ${response.model}` : ''}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-6">{response.answer}</p>
                  {response.evidence_sufficient === false && (
                    <p className="mt-3 text-xs font-medium text-warning">
                      Evidencia insuficiente: los fragmentos recuperados no bastan para responder.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Afirmaciones evaluadas ({response.claims.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {response.claims.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin afirmaciones evaluadas.</p>
                ) : (
                  <ul className="space-y-2">
                    {response.claims.map((claim, index) => {
                      const style = CLAIM_STYLE[claim.status];
                      return (
                        <li key={index} className="flex items-start gap-2">
                          <Badge variant={style.variant}>{style.label}</Badge>
                          <span className="text-xs leading-5">
                            {claim.text}
                            {claim.source ? (
                              <span className="text-muted-foreground"> [{claim.source}]</span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/70 pt-3 text-xs sm:grid-cols-4">
                  <span className="text-muted-foreground">
                    Fundamentación:{' '}
                    <span className="font-medium text-foreground">{pct(response.metrics?.groundedness)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Citas válidas:{' '}
                    <span className="font-medium text-foreground">
                      {response.metrics ? response.metrics.citations_valid : 'N/D'}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Sin soporte:{' '}
                    <span className="font-medium text-foreground">
                      {pct(response.metrics?.unsupported_rate)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Latencia:{' '}
                    <span className="font-medium text-foreground">
                      {Math.round(response.latency_ms ?? 0)} ms
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!response && !running && !error && (
          <div className="rounded-2xl border border-dashed border-border py-10 text-center">
            <FlaskConical className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Escribe una pregunta o elige un caso de demostración.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-4 w-4 text-muted-foreground" /> Casos de demostración
            </CardTitle>
            <CardDescription>
              Respuestas con guion incluidas para ilustrar fallos concretos. En modo mock provienen
              del conjunto de demostración, no de un LLM en vivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {demoCases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay casos disponibles.</p>
            ) : (
              <div className="space-y-2">
                {demoCases.map((demoCase) => (
                  <div key={demoCase.id} className="rounded-xl border border-border/70">
                    <button
                      className="flex w-full items-center gap-2 p-3 text-left"
                      onClick={() =>
                        setExpandedCase((prev) => (prev === demoCase.id ? null : demoCase.id))
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: MODE_META[demoCase.mode].color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {demoCase.name}
                      </span>
                      {expandedCase === demoCase.id ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                    {expandedCase === demoCase.id && (
                      <div className="space-y-2 border-t border-border/70 p-3">
                        <p className="text-[11px] text-muted-foreground">{demoCase.description}</p>
                        <p className="rounded-lg bg-muted/40 p-2 text-[11px]">{demoCase.query}</p>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => runCase(demoCase)}
                          disabled={running}
                        >
                          {running ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          Ejecutar caso
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ExperimentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [summaries, setSummaries] = useState<ExperimentSummary[]>([]);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [questionsText, setQuestionsText] = useState('');
  const [selectedModes, setSelectedModes] = useState<Mode[]>(['llm', 'rag', 'rag_eval']);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [topK, setTopK] = useState(5);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [demoCases, setDemoCases] = useState<DemoCase[]>([]);
  const [tab, setTab] = useState<'batch' | 'quick'>('batch');

  const processedDocs = useMemo(
    () => documents.filter((d) => d.status === 'processed'),
    [documents]
  );

  const loadList = useCallback(async () => {
    try {
      setError(null);
      const list = await apiListExperiments();
      setSummaries(list);
      if (list.length && !experiment) {
        const full = await apiGetExperiment(list[0].id);
        setExperiment(full);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los experimentos.');
    } finally {
      setLoadingList(false);
    }
  }, [experiment]);

  useEffect(() => {
    (async () => {
      try {
        const [docs, cases] = await Promise.all([apiGetDocuments(), apiGetDemoCases()]);
        setDocuments(docs.documents || []);
        setSelectedDocs((docs.documents || []).filter((d) => d.status === 'processed').map((d) => d.id));
        const allCases = cases.cases || [];
        setDemoCases(allCases);
        const unique = Array.from(new Set(allCases.map((c) => c.query)));
        setSuggested(unique);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el corpus.');
        setLoadingList(false);
      }
    })();
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const questions = useMemo(
    () =>
      questionsText
        .split('\n')
        .map((q) => q.trim())
        .filter(Boolean),
    [questionsText]
  );

  const toggleMode = (mode: Mode) =>
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );

  const toggleDoc = (id: string) =>
    setSelectedDocs((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));

  const run = useCallback(async () => {
    if (!questions.length || !selectedModes.length) return;
    setRunning(true);
    setError(null);
    try {
      const result = await apiRunExperiment({
        questions,
        modes: selectedModes,
        document_ids: selectedDocs.length ? selectedDocs : null,
        top_k: topK,
      });
      setExperiment(result);
      const list = await apiListExperiments();
      setSummaries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La ejecución del experimento falló.');
    } finally {
      setRunning(false);
    }
  }, [questions, selectedModes, selectedDocs, topK]);

  const selectExperiment = useCallback(async (id: string) => {
    try {
      setError(null);
      const full = await apiGetExperiment(id);
      setExperiment(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el experimento.');
    }
  }, []);

  const removeExperiment = useCallback(
    async (id: string) => {
      try {
        await apiDeleteExperiment(id);
        const list = await apiListExperiments();
        setSummaries(list);
        if (experiment?.id === id) {
          setExperiment(list.length ? await apiGetExperiment(list[0].id) : null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo eliminar el experimento.');
      }
    },
    [experiment]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Experimentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ejecuta las mismas preguntas sobre los mismos documentos en las tres modalidades y
          compara métricas reales, evidencia y respuestas por pregunta.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* One consolidated Experiments section with two ways to run. */}
      <div className="inline-flex rounded-xl border border-border/80 bg-card p-1">
        <button
          onClick={() => setTab('batch')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'batch' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
          )}
        >
          <ClipboardList className="h-4 w-4" /> Batería de preguntas
        </button>
        <button
          onClick={() => setTab('quick')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'quick' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
          )}
        >
          <Zap className="h-4 w-4" /> Consulta rápida
        </button>
      </div>

      {tab === 'batch' ? (
        <>
      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" /> Configurar ejecución
          </CardTitle>
          <CardDescription>
            Las tres modalidades se ejecutan con las mismas fuentes para que la comparación sea
            justa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Documents */}
          <div>
            <p className="mb-2 text-sm font-medium">Documentos fuente</p>
            {processedDocs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay documentos procesados. Carga documentos en la sección «Documentos».
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {processedDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => toggleDoc(doc.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors',
                      selectedDocs.includes(doc.id)
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {doc.name}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {selectedDocs.length} de {processedDocs.length} seleccionado(s).
              {selectedDocs.length === 0 && ' Sin selección se usan todos los procesados.'}
            </p>
          </div>

          {/* Questions */}
          <div>
            <label htmlFor="questions" className="mb-2 block text-sm font-medium">
              Preguntas (una por línea)
            </label>
            <textarea
              id="questions"
              value={questionsText}
              onChange={(e) => setQuestionsText(e.target.value)}
              rows={4}
              placeholder="¿Qué es RAG?&#10;¿RAG elimina completamente las alucinaciones?"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/30"
            />
            {suggested.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Preguntas sugeridas
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggested.map((q) => (
                    <button
                      key={q}
                      onClick={() =>
                        setQuestionsText((prev) => (prev ? `${prev}\n${q}` : q))
                      }
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      + {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Modes */}
          <div>
            <p className="mb-2 text-sm font-medium">Modalidades</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => toggleMode(mode)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors',
                    selectedModes.includes(mode)
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: MODE_META[mode].color }} />
                    <span className="text-sm font-medium">{MODE_META[mode].label}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {MODE_META[mode].description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Fragmentos por consulta (top_k)</span>
              <input
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value) || 1)}
                className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <Button onClick={run} disabled={running || !questions.length || !selectedModes.length}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? 'Ejecutando…' : 'Ejecutar experimento'}
            </Button>
            {running && (
              <span className="text-xs text-muted-foreground">
                Ejecutando {questions.length * selectedModes.length} consultas…
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Saved experiments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Ejecuciones guardadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : summaries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Todavía no hay experimentos. Configura y ejecuta uno para ver métricas y gráficas
              reales.
            </div>
          ) : (
            <ul className="space-y-2">
              {summaries.map((summary) => (
                <li
                  key={summary.id}
                  className={cn(
                    'flex flex-col gap-2 rounded-xl border px-3 py-2 sm:flex-row sm:items-center sm:justify-between',
                    experiment?.id === summary.id
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/80'
                  )}
                >
                  <button className="min-w-0 text-left" onClick={() => selectExperiment(summary.id)}>
                    <p className="truncate text-sm font-medium">{summary.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {summary.questions} pregunta(s) · {summary.modes.map((m) => MODE_META[m].short).join('/')}{' '}
                      · ok {summary.status_counts.ok ?? 0} / err {summary.status_counts.error ?? 0}
                      {summary.provider ? ` · ${summary.provider}` : ''}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    {experiment?.id === summary.id && (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> En vista
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => removeExperiment(summary.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {experiment ? (
        <ExperimentResults experiment={experiment} />
      ) : (
        summaries.length === 0 &&
        !loadingList && (
          <div className="rounded-2xl border border-dashed border-border py-12 text-center">
            <FlaskConical className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Ejecuta un experimento para ver el panel de resultados.
            </p>
          </div>
        )
      )}
        </>
      ) : (
        <QuickQueryTab demoCases={demoCases} topK={topK} />
      )}
    </div>
  );
}
