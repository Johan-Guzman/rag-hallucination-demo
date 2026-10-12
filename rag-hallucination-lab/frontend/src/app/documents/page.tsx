'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  apiAnalyzeDocuments,
  apiDeleteDocument,
  apiGetDocuments,
  apiUploadDocuments,
} from '@/lib/api';
import type { DocumentAnalysis, DocumentRecord, UploadResult } from '@/types';
import { cn } from '@/lib/utils';
import {
  FileText,
  UploadCloud,
  Loader2,
  Trash2,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Database,
  FileUp,
  X,
} from 'lucide-react';

const ACCEPT = '.txt,.md,.markdown,.pdf';

function StatusBadge({ record }: { record: DocumentRecord }) {
  if (record.status === 'processed') {
    return (
      <Badge variant="success">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Procesado
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <AlertTriangle className="mr-1 h-3 w-3" /> Error
    </Badge>
  );
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGetDocuments();
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los documentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setUploading(true);
      setError(null);
      setUploadResults([]);
      try {
        const response = await apiUploadDocuments(list);
        setUploadResults(response.results);
        setDocuments(response.documents || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al subir los archivos.');
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    []
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer.files?.length) handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDelete = useCallback(async (id: string) => {
    try {
      await apiDeleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      if (analysis?.document_id === id) setAnalysis(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el documento.');
    }
  }, [analysis]);

  const onAnalyze = useCallback(async (id: string) => {
    setAnalyzingId(id);
    setError(null);
    try {
      const [result] = await apiAnalyzeDocuments({ document_ids: [id], include_summary: true });
      setAnalysis(result ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo analizar el documento.');
    } finally {
      setAnalyzingId(null);
    }
  }, []);

  const builtin = documents.filter((d) => d.source === 'builtin');
  const uploaded = documents.filter((d) => d.source === 'uploaded');
  const failedUploads = uploadResults.filter((r) => r.status === 'failed');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Carga tus propios documentos, revisa su procesamiento y analízalos. Los
          documentos procesados están disponibles para las consultas RAG y para las
          comparaciones entre modalidades.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" /> Cargar documentos
          </CardTitle>
          <CardDescription>
            Formatos admitidos: {ACCEPT}. Un archivo solo aparece como procesado si su
            texto quedó almacenado y es consultable.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            <FileUp className="mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Arrastra archivos aquí o
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {uploading ? 'Procesando…' : 'Seleccionar archivos'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {uploadResults.length > 0 && (
            <ul className="mt-4 space-y-2">
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
                        ? `Procesado · ${result.chars} caracteres`
                        : result.error || 'No se pudo procesar.'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {failedUploads.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Los archivos con error no se añadieron al corpus consultable.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Corpus */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" /> Corpus disponible
            </CardTitle>
            <CardDescription>
              {documents.length} documento(s) · {uploaded.length} cargado(s) por el usuario.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos…
            </div>
          ) : documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No hay documentos en el corpus. Carga al menos uno para empezar.
            </div>
          ) : (
            <div className="space-y-2">
              {[['Integrados', builtin] as const, ['Cargados por ti', uploaded] as const].map(
                ([groupLabel, group]) =>
                  group.length > 0 && (
                    <div key={groupLabel}>
                      <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {groupLabel}
                      </p>
                      <ul className="space-y-2">
                        {group.map((record) => (
                          <li
                            key={record.id}
                            className="flex flex-col gap-2 rounded-xl border border-border/80 bg-background/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{record.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {record.words} palabras · {record.chars} caracteres
                                  {record.created_at ? ` · ${record.created_at}` : ''}
                                </p>
                                {record.error && (
                                  <p className="text-xs text-destructive">{record.error}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <StatusBadge record={record} />
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={record.status !== 'processed' || analyzingId === record.id}
                                onClick={() => onAnalyze(record.id)}
                              >
                                {analyzingId === record.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <BarChart3 className="h-4 w-4" />
                                )}
                                Analizar
                              </Button>
                              {record.source === 'uploaded' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onDelete(record.id)}
                                  aria-label={`Eliminar ${record.name}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis */}
      {analysis && (
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" /> Análisis: {analysis.name}
              </CardTitle>
              <CardDescription>
                Estadísticas calculadas localmente sobre el texto almacenado.
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setAnalysis(null)} aria-label="Cerrar análisis">
              <X className="h-4 w-4" />
            </Button>
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
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
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
                  Términos más frecuentes
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

            {analysis.summary ? (
              <div className="rounded-xl border border-border/80 bg-background/40 p-3">
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Resumen generado por LLM ({analysis.model || analysis.provider})
                </p>
                <p className="text-sm leading-6">{analysis.summary}</p>
                {analysis.summary_note && (
                  <p className="mt-2 text-[11px] text-muted-foreground">{analysis.summary_note}</p>
                )}
              </div>
            ) : (
              analysis.summary_note && (
                <p className="text-xs text-muted-foreground">{analysis.summary_note}</p>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
