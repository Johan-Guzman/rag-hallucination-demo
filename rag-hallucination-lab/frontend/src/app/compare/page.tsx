'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MetricGrid, ModeLegend, formatMetricValue } from '@/components/charts/MetricCharts';
import {
  apiCompareExperiments,
  apiListExperiments,
  apiRunDemoExperiment,
} from '@/lib/api';
import type {
  ComparisonRun,
  ExperimentComparison,
  ExperimentSummary,
  MetricAggregate,
  Mode,
} from '@/types';
import { MODE_META, MODE_ORDER } from '@/types';
import { cn } from '@/lib/utils';
import {
  GitCompare,
  Loader2,
  Play,
  RefreshCw,
  Info,
  AlertTriangle,
  Database,
  FlaskConical,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

function statusBadge(run: { status_counts: Record<string, number> }) {
  const ok = run.status_counts.ok ?? 0;
  const error = run.status_counts.error ?? 0;
  if (error > 0) {
    return (
      <Badge variant="warning">
        <AlertTriangle className="mr-1 h-3 w-3" />
        {ok} ok · {error} error
      </Badge>
    );
  }
  return (
    <Badge variant="success">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      {ok} celdas ok
    </Badge>
  );
}

function RunMeta({ run }: { run: ComparisonRun | ExperimentSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="font-mono">{run.id}</span>
      <span>{run.created_at}</span>
      <span>{run.questions} pregunta(s)</span>
      <span>{run.modes.map((m) => MODE_META[m].short).join(' · ')}</span>
      {run.is_demo && (
        <Badge variant="outline" className="gap-1">
          <FlaskConical className="h-3 w-3" /> Demo
        </Badge>
      )}
    </div>
  );
}

/** Compact numeric companion to the bar charts: metrics (rows) × conditions. */
function MetricTable({ aggregates }: { aggregates: MetricAggregate[] }) {
  if (!aggregates.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="border-b border-border/70 pb-2 pr-4 font-medium">Métrica</th>
            {MODE_ORDER.map((mode) => (
              <th key={mode} className="border-b border-border/70 pb-2 px-3 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: MODE_META[mode].color }}
                    aria-hidden
                  />
                  {MODE_META[mode].short}
                </span>
              </th>
            ))}
            <th className="border-b border-border/70 pb-2 pl-3 font-medium">Mejor</th>
          </tr>
        </thead>
        <tbody>
          {aggregates.map((aggregate) => (
            <tr key={aggregate.key} className="align-top">
              <td className="border-b border-border/50 py-2.5 pr-4">
                <span className="font-medium">{aggregate.label}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {aggregate.definition}
                </span>
              </td>
              {MODE_ORDER.map((mode) => {
                const value = aggregate.values[mode];
                const best = aggregate.best_mode === mode && value != null;
                return (
                  <td
                    key={mode}
                    className={cn(
                      'border-b border-border/50 py-2.5 px-3 tabular-nums',
                      best ? 'font-semibold text-foreground' : 'text-foreground/90'
                    )}
                  >
                    {formatMetricValue(value, aggregate.unit)}
                  </td>
                );
              })}
              <td className="border-b border-border/50 py-2.5 pl-3 text-xs text-muted-foreground">
                {aggregate.best_mode ? MODE_META[aggregate.best_mode as Mode]?.label ?? '—' : 'N/D'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ComparePage() {
  const [summaries, setSummaries] = useState<ExperimentSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionReady, setSelectionReady] = useState(false);
  const [question, setQuestion] = useState('');
  const [comparison, setComparison] = useState<ExperimentComparison | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningDemo, setRunningDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    const list = await apiListExperiments();
    setSummaries(list);
    return list;
  }, []);

  // Initial load: select every saved run so the page opens with a full
  // comparison (an empty selection is otherwise indistinguishable from "all").
  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const list = await loadRuns();
        setSelectedIds(list.map((s) => s.id));
        setSelectionReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los experimentos.');
        setSelectionReady(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRuns]);

  // Fetch the real comparison dataset whenever the selection/question changes.
  const fetchComparison = useCallback(
    async (ids: string[], activeQuestion: string, showSpinner: boolean) => {
      if (!ids.length) {
        setComparison(null);
        return;
      }
      if (showSpinner) setRefreshing(true);
      try {
        setError(null);
        const data = await apiCompareExperiments(ids, activeQuestion || undefined);
        setComparison(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la comparación.');
        setComparison(null);
      } finally {
        if (showSpinner) setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectionReady) return;
    fetchComparison(selectedIds, question, false);
  }, [selectionReady, selectedIds, question, fetchComparison]);

  // Keep the selected detail run valid as the dataset changes.
  useEffect(() => {
    if (!comparison) return;
    const ids = comparison.runs.map((r) => r.id);
    if (!ids.length) {
      setDetailRunId(null);
    } else if (!detailRunId || !ids.includes(detailRunId)) {
      setDetailRunId(ids[0]);
    }
  }, [comparison, detailRunId]);

  // Drop a question filter that no longer exists in the selected runs.
  useEffect(() => {
    if (question && comparison && !comparison.questions.includes(question)) {
      setQuestion('');
    }
  }, [comparison, question]);

  const detailRun = useMemo(
    () => comparison?.runs.find((r) => r.id === detailRunId) ?? comparison?.runs[0] ?? null,
    [comparison, detailRunId]
  );

  const allSelected = summaries.length > 0 && selectedIds.length === summaries.length;
  const isMock = summaries.every((s) => !s.provider || s.provider === 'mock');
  const hasDemo = summaries.some((s) => s.is_demo);

  const toggleRun = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const selectAll = () => setSelectedIds(summaries.map((s) => s.id));
  const clearAll = () => setSelectedIds([]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const list = await loadRuns();
      const keep = selectedIds.filter((id) => list.some((s) => s.id === id));
      setSelectedIds(keep);
      await fetchComparison(keep, question, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron actualizar los datos.');
    } finally {
      setRefreshing(false);
    }
  };

  const runDemo = async () => {
    setRunningDemo(true);
    try {
      setError(null);
      const demo = await apiRunDemoExperiment();
      const list = await loadRuns();
      // Include the new demo run so its results are visible immediately.
      const next = Array.from(new Set([...selectedIds, demo.id]));
      setSelectedIds(next.filter((id) => list.some((s) => s.id === id)));
      setQuestion('');
      await fetchComparison(next, '', false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ejecutar la demo.');
    } finally {
      setRunningDemo(false);
    }
  };

  const anyError = comparison?.status_totals.error ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comparar modalidades</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contrasta las tres condiciones sobre las ejecuciones guardadas: A · Sin evidencia
          (línea base), B · Con evidencia (RAG) y C · Con verificación (RAG + juez). Todas las
          cifras proceden de ejecuciones reales; lo no definido para una condición se muestra
          como «N/D».
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Provenance: never let a simulated or demo number pass as a measurement. */}
      <Card className={cn('border-info/25', isMock && 'bg-warning/[0.04]')}>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10">
            <Database className="h-4 w-4 text-info" />
          </div>
          <div className="space-y-1.5 text-sm">
            <p className="font-medium">Origen de los datos</p>
            <p className="text-muted-foreground">
              Cada barra y cada celda se calcula a partir de las respuestas y métricas
              <strong className="text-foreground"> almacenadas </strong>
              de las ejecuciones seleccionadas (endpoint de comparación del backend). No se
              reutilizan respuestas de ejemplo ni se generan cifras al vuelo.
            </p>
            {isMock && (
              <p className="text-xs font-medium text-warning">
                Proveedor en modo mock: las métricas son reales para esa ejecución, pero las
                respuestas provienen del conjunto de demostración, no de un LLM en vivo.
              </p>
            )}
            {hasDemo && (
              <p className="text-xs text-muted-foreground">
                Las filas marcadas como «Demo» usan preguntas predefinidas; sus métricas siguen
                siendo mediciones reales de esa ejecución.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" /> Filtros
          </CardTitle>
          <CardDescription>
            Elige qué ejecuciones comparar y, opcionalmente, una pregunta concreta. Las gráficas
            se recalculan al instante sobre lo seleccionado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Ejecuciones</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll} disabled={allSelected}>
                  Seleccionar todas
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll} disabled={!selectedIds.length}>
                  Ninguna
                </Button>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando ejecuciones…
              </div>
            ) : summaries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay ejecuciones guardadas todavía. Ejecuta una en «Experimentos» o usa el botón
                de demo de abajo.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {summaries.map((summary) => {
                  const active = selectedIds.includes(summary.id);
                  return (
                    <button
                      key={summary.id}
                      onClick={() => toggleRun(summary.id)}
                      className={cn(
                        'flex max-w-full flex-col rounded-xl border px-3 py-2 text-left transition-colors',
                        active
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border/80 hover:bg-accent'
                      )}
                    >
                      <span className="flex items-center gap-2 text-xs font-medium">
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]',
                            active ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                          )}
                        >
                          {active ? '✓' : ''}
                        </span>
                        <span className="truncate font-mono">{summary.id}</span>
                        {summary.is_demo && <Badge variant="outline">Demo</Badge>}
                      </span>
                      <span className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
                        {summary.created_at} · {summary.questions} preg. ·{' '}
                        {summary.modes.map((m) => MODE_META[m].short).join('·')} ·{' '}
                        {summary.provider || 'mock'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium">Filtrar por pregunta</span>
              <select
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={!comparison?.questions.length}
                className="h-9 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">Todas las preguntas</option>
                {(comparison?.questions ?? []).map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2">
              <Button variant="outline" onClick={refresh} disabled={refreshing || runningDemo}>
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Actualizar
              </Button>
              <Button onClick={runDemo} disabled={runningDemo || refreshing}>
                {runningDemo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {runningDemo ? 'Ejecutando demo…' : 'Ejecutar demo'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectionReady || loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparando comparación…
        </div>
      ) : !selectedIds.length ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <GitCompare className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Selecciona al menos una ejecución para ver la comparación.
          </p>
        </div>
      ) : !comparison || comparison.runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <FlaskConical className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {question
              ? 'Ninguna de las ejecuciones seleccionadas contiene esa pregunta.'
              : 'No hay datos para las ejecuciones seleccionadas.'}
          </p>
        </div>
      ) : (
        <>
          {/* Overall comparison across the selected runs */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Comparación global · {comparison.runs.length} ejecución(es)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Agregado sobre todas las celdas ejecutadas
                  {question ? ` para la pregunta «${question}»` : ''}. Generado{' '}
                  {comparison.generated_at}.
                </p>
              </div>
              <ModeLegend />
            </div>

            {comparison.overall.length ? (
              <MetricGrid aggregates={comparison.overall} />
            ) : (
              <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                No hay celdas exitosas que agregar en esta selección.
              </div>
            )}

            {anyError > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 text-xs text-warning">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {anyError} celda(s) fallaron y se excluyen de los promedios. Consulta el detalle
                  por ejecución para ver el error concreto.
                </span>
              </div>
            )}

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tabla numérica
              </p>
              <Card>
                <CardContent className="pt-6">
                  <MetricTable aggregates={comparison.overall} />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Per-run detail */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Detalle por ejecución</h2>
              <select
                value={detailRun?.id ?? ''}
                onChange={(e) => setDetailRunId(e.target.value)}
                className="h-9 max-w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {comparison.runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.id}
                    {run.is_demo ? ' (demo)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {detailRun && (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">Ejecución {detailRun.id}</CardTitle>
                      <div className="flex items-center gap-2">
                        {detailRun.is_demo && (
                          <Badge variant="outline" className="gap-1">
                            <FlaskConical className="h-3 w-3" /> Demo
                          </Badge>
                        )}
                        {statusBadge(detailRun)}
                      </div>
                    </div>
                    <RunMeta run={detailRun} />
                    {detailRun.document_names.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Documentos: {detailRun.document_names.join(', ')}
                      </p>
                    )}
                  </CardHeader>
                </Card>

                {detailRun.aggregates.length ? (
                  <MetricGrid aggregates={detailRun.aggregates} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                    {question
                      ? 'Esta ejecución no incluye esa pregunta.'
                      : 'Sin métricas agregadas para esta ejecución.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Backend notes */}
          {comparison.notes.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border border-info/20 bg-info/5 p-4 text-xs text-muted-foreground">
              {comparison.notes.map((note, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}

          {/* What each visualization is */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cómo leer estas visualizaciones</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <p className="font-medium text-foreground">Barras por métrica</p>
                <p>
                  Cada barra es el promedio de esa condición sobre las celdas exitosas. Una barra
                  con borde discontinuo y «N/D» indica que la métrica no está definida para esa
                  condición (p. ej. la línea base no recupera fragmentos), y se excluye del
                  promedio.
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">Comparabilidad</p>
                <p>
                  Cada gráfica indica si las tres condiciones se midieron sobre el mismo número de
                  celdas. Si una condición tiene menos muestras, la comparación es orientativa.
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">Tabla numérica</p>
                <p>
                  Reproduce los mismos valores con su unidad y resalta la mejor condición por
                  métrica (según si «más es mejor» o «menos es mejor»).
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">Detalle por ejecución</p>
                <p>
                  Muestra los agregados tal como quedaron guardados en esa ejecución concreta, sin
                  volver a agregar entre ejecuciones.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
