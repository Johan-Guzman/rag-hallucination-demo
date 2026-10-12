'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiAnalyzeDocuments, apiGetDocuments, apiUploadDocuments } from '@/lib/api';
import type {
  DocumentAnalysis,
  DocumentClaim,
  DocumentRecord,
  UploadResult,
} from '@/types';
import { cn } from '@/lib/utils';
import {
  FileText,
  UploadCloud,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Quote,
  Lightbulb,
  ListChecks,
  Flag,
  FileSearch,
  Info,
} from 'lucide-react';

const ACCEPT = '.txt,.md,.markdown,.pdf';

const CLAIM_STYLE: Record<
  DocumentClaim['status'],
  { variant: 'success' | 'warning' | 'outline'; label: string }
> = {
  supported: { variant: 'success', label: 'Respaldada' },
  unsupported: { variant: 'warning', label: 'Sin respaldo' },
  uncertain: { variant: 'outline', label: 'Incierta' },
};

export default function PaperAnalysisPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGetDocuments();
      const list = data.documents || [];
      setDocuments(list);
      setSelectedId((prev) => {
        if (prev && list.some((d) => d.id === prev && d.status === 'processed')) return prev;
        return list.find((d) => d.status === 'processed')?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los documentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const analyze = useCallback(async (docId: string) => {
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const [result] = await apiAnalyzeDocuments({
        document_ids: [docId],
        include_summary: true,
        deep: true,
      });
      setAnalysis(result ?? null);
      if (!result) setError('No se recibió ningún análisis del documento.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo analizar el documento.');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;

      const invalid = list.filter(
        (file) => !/\.(txt|md|markdown|pdf)$/i.test(file.name)
      );
      if (list.length === 1 && list[0].size === 0) {
        setError('El archivo está vacío.');
        return;
      }
      setUploading(true);
      setError(null);
      setUploadResults([]);
      setAnalysis(null);
      try {
        const response = await apiUploadDocuments(list);
        setUploadResults(response.results);
        setDocuments(response.documents || []);
        const stored = response.results.find(
          (r) => r.status === 'processed' && r.document_id
        );
        if (stored?.document_id) {
          setSelectedId(stored.document_id);
          // Validate -> extract -> analyze in one step for the uploaded file.
          await analyze(stored.document_id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al subir los archivos.');
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [analyze]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer.files?.length) handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const processed = documents.filter((d) => d.status === 'processed');
  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const deepUnavailable = !!analysis && !analysis.summary && analysis.claims.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Análisis de documentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Carga un documento (TXT, Markdown o PDF), valídalo, extrae su texto y obtén un análisis
          estructurado: resumen, ideas clave, afirmaciones con su cita textual y conclusiones. Las
          afirmaciones solo se marcan como respaldadas cuando su cita aparece literalmente en el
          documento.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Source: upload or pick from the corpus */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" /> 1 · Elige el documento
          </CardTitle>
          <CardDescription>
            Sube un archivo nuevo (se valida y se extrae su texto) o elige uno ya procesado del
            corpus. Formatos admitidos: {ACCEPT}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <UploadCloud className="mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Arrastra un archivo aquí o</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {uploading ? 'Subiendo…' : 'Seleccionar archivo'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {uploadResults.length > 0 && (
            <ul className="space-y-2">
              {uploadResults.map((result, index) => (
                <li
                  key={`${result.name}-${index}`}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                    result.status === 'processed'
                      ? 'border-success/30 bg-success/5'
                      : 'border-destructive/30 bg-destructive/5'
                  )}
                >
                  {result.status === 'processed' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{result.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {result.status === 'processed'
                        ? `Texto extraído · ${result.chars} caracteres`
                        : result.error || 'No se pudo procesar el archivo.'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Documentos del corpus</p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            ) : processed.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay documentos procesados. Sube uno para empezar.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {processed.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => {
                      setSelectedId(doc.id);
                      setAnalysis(null);
                      setError(null);
                    }}
                    className={cn(
                      'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                      selectedId === doc.id
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{doc.name}</span>
                    <span className="shrink-0 text-[10px] opacity-70">{doc.words} pal.</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Analyze */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Análisis
          </CardTitle>
          <CardDescription>
            Extrae ideas clave, afirmaciones con su cita textual, conclusiones y un resumen. Los
            documentos largos se dividen en fragmentos y se sintetizan (map-reduce).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => selectedId && analyze(selectedId)}
            disabled={!selectedId || analyzing || uploading}
          >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? 'Analizando…' : 'Analizar documento'}
          </Button>
          {selected && (
            <span className="text-xs text-muted-foreground">
              Seleccionado: <span className="font-medium text-foreground">{selected.name}</span>
            </span>
          )}
          {analyzing && (
            <span className="text-xs text-muted-foreground">
              Extrayendo, dividiendo en fragmentos y analizando…
            </span>
          )}
        </CardContent>
      </Card>

      {analysis && (
        <div className="space-y-6">
          {/* Header / provenance */}
          <Card>
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5 text-primary" /> {analysis.name}
                </CardTitle>
                {analysis.provider ? (
                  <Badge variant={analysis.provider === 'gemini' ? 'success' : 'warning'}>
                    {analysis.provider}
                    {analysis.model ? ` · ${analysis.model}` : ''}
                  </Badge>
                ) : (
                  <Badge variant="outline">Local</Badge>
                )}
              </div>
              {analysis.strategy && (
                <CardDescription>Estrategia: {analysis.strategy}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Palabras', analysis.words],
                  ['Caracteres', analysis.chars],
                  ['Oraciones', analysis.sentences],
                  ['Párrafos', analysis.paragraphs],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-xl border border-border/80 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">{value as number}</p>
                  </div>
                ))}
              </div>

              {analysis.headings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Encabezados detectados
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {analysis.headings.map((heading) => (
                      <Badge key={heading} variant="outline">
                        {heading}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {analysis.keywords.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Términos más frecuentes (local)
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {analysis.keywords.map((keyword) => (
                      <Badge key={keyword} variant="default">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {analysis.summary_note && (
                <p className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                  {analysis.summary_note}
                </p>
              )}
            </CardContent>
          </Card>

          {deepUnavailable && (
            <div className="flex items-start gap-2 rounded-xl border border-info/25 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <div>
                <p className="font-medium text-foreground">Análisis profundo con LLM no disponible</p>
                <p className="mt-1 text-xs">
                  Para generar resumen, afirmaciones y conclusiones hace falta un proveedor de
                  generación (<code className="font-mono">LLM_PROVIDER=gemini</code>). Se muestran
                  las estadísticas locales y, si procede, ideas clave extraídas del propio texto.
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          {analysis.summary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" /> Resumen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6">{analysis.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Key ideas */}
          {analysis.key_points.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="h-4 w-4 text-primary" /> Ideas clave
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.key_points.map((point, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm leading-6">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Claims */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4 text-primary" /> Afirmaciones ({analysis.claims.length})
              </CardTitle>
              <CardDescription>
                Una afirmación solo se marca como respaldada cuando su cita textual aparece en el
                documento; el resto queda como incierta. No se inventan citas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis.claims.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No se extrajeron afirmaciones (requiere un proveedor de generación activo).
                </p>
              ) : (
                <ul className="space-y-3">
                  {analysis.claims.map((claim, index) => {
                    const style = CLAIM_STYLE[claim.status];
                    return (
                      <li
                        key={index}
                        className="rounded-xl border border-border/80 bg-background/40 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="flex-1 text-sm leading-6">{claim.text}</span>
                          <Badge variant={style.variant}>
                            {style.label}
                            {claim.verified ? ' · cita verificada' : ''}
                          </Badge>
                        </div>
                        {analysis.claims[index].evidence && (
                          <blockquote className="mt-2 flex items-start gap-2 rounded-lg border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-xs italic text-muted-foreground">
                            <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{analysis.claims[index].evidence}</span>
                          </blockquote>
                        )}
                        {analysis.claims[index].location && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            Ubicación: {analysis.claims[index].location}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Conclusions */}
          {analysis.conclusions && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Flag className="h-4 w-4 text-primary" /> Conclusiones
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-6">{analysis.conclusions}</p>
              </CardContent>
            </Card>
          )}

          {analysis.summary_note && (
            <div className="flex items-start gap-2 rounded-xl border border-info/20 bg-info/5 px-4 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <span>{analysis.summary_note}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
