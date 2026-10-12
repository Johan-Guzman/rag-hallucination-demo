'use client';

import { cn } from '@/lib/utils';
import type { MetricAggregate, Mode } from '@/types';
import { MODE_META } from '@/types';

const MODE_ORDER: Mode[] = ['llm', 'rag', 'rag_eval'];

export function formatMetricValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return 'N/D';
  if (unit === '%') return `${Math.round(value * 100)}%`;
  if (unit === 'ms') return `${Math.round(value)} ms`;
  return value.toFixed(2);
}

const formatValue = formatMetricValue;

interface Bar {
  mode: Mode;
  value: number | null;
  highlight: boolean;
}

function BarChart({
  bars,
  unit,
  height = 150,
}: {
  bars: Bar[];
  unit: string;
  height?: number;
}) {
  const max = Math.max(...bars.map((b) => (b.value === null ? 0 : Math.abs(b.value))), 0.0001);
  const barArea = height - 34;

  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {bars.map((bar) => {
        const meta = MODE_META[bar.mode];
        const usable = bar.value === null ? 0 : Math.abs(bar.value);
        // A null value (metric not defined for this condition) gets a short,
        // dashed placeholder so the slot stays visible instead of collapsing.
        const px = bar.value === null ? 8 : Math.max(3, (usable / max) * barArea);
        return (
          <div key={bar.mode} className="flex flex-1 flex-col items-center justify-end">
            <span
              className={cn(
                'mb-1 text-[11px] font-semibold tabular-nums',
                bar.value === null ? 'text-muted-foreground' : 'text-foreground'
              )}
            >
              {formatValue(bar.value, unit)}
            </span>
            <div
              className={cn(
                'w-full max-w-[52px] rounded-t-md transition-[height] duration-300',
                bar.value === null && 'border border-dashed border-border bg-transparent'
              )}
              style={{
                height: px,
                background: bar.value === null ? 'transparent' : meta.color,
                opacity: bar.value === null ? 1 : bar.highlight ? 1 : 0.55,
                boxShadow: bar.highlight && bar.value !== null ? '0 0 0 2px rgb(0 0 0 / 0.06)' : undefined,
              }}
              aria-label={`${meta.label}: ${formatValue(bar.value, unit)}`}
            />
            <span
              className={cn(
                'mt-1.5 text-[11px] font-medium',
                bar.highlight ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {meta.short}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MetricChart({ aggregate }: { aggregate: MetricAggregate }) {
  const measured = MODE_ORDER.some((m) => aggregate.values[m] !== null && aggregate.values[m] !== undefined);
  const bars: Bar[] = MODE_ORDER.map((mode) => ({
    mode,
    value: aggregate.values[mode] ?? null,
    highlight: aggregate.best_mode === mode,
  }));

  const bestMeta = aggregate.best_mode ? MODE_META[aggregate.best_mode as Mode] : null;

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-tight">{aggregate.label}</h3>
        {aggregate.comparable ? (
          <span className="shrink-0 rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
            comparación válida
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            muestras desiguales
          </span>
        )}
      </div>

      {measured ? (
        <BarChart bars={bars} unit={aggregate.unit} />
      ) : (
        <div className="flex h-[120px] items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
          Sin datos suficientes para esta métrica.
        </div>
      )}

      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
        {aggregate.higher_is_better ? 'Mayor es mejor.' : 'Menor es mejor.'}{' '}
        {bestMeta ? (
          <>
            Mejor resultado en esta métrica:{' '}
            <span className="font-medium text-foreground">{bestMeta.label}</span>.
          </>
        ) : (
          'Aún no hay una condición con mejor resultado.'
        )}
      </p>
      <details className="mt-2 group">
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
          Definición y muestras
        </summary>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{aggregate.definition}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {MODE_ORDER.map((m) => `${MODE_META[m].short}: ${aggregate.samples[m] ?? 0} muestra(s)`).join(' · ')}
        </p>
      </details>
    </div>
  );
}

export function MetricGrid({ aggregates }: { aggregates: MetricAggregate[] }) {
  if (!aggregates.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {aggregates.map((aggregate) => (
        <MetricChart key={aggregate.key} aggregate={aggregate} />
      ))}
    </div>
  );
}

export function ModeLegend() {
  return (
    <div className="flex flex-wrap gap-3">
      {MODE_ORDER.map((mode) => (
        <div key={mode} className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ background: MODE_META[mode].color }}
            aria-hidden
          />
          <span className="text-xs text-muted-foreground">{MODE_META[mode].label}</span>
        </div>
      ))}
    </div>
  );
}
