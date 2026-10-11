'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  File,
  X,
} from 'lucide-react';

type UploadState = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

interface AnalysisResult {
  title: string;
  authors: string[];
  sections: number;
  pages: number;
  references: number;
  claimsDetected: number;
  citations: number;
  potentialHallucinations: number;
  unsupportedClaims: number;
}

export default function PaperAnalysisPage() {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = async (file: File) => {
    const validTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    const validExtensions = ['.pdf', '.txt', '.md'];

    const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
    const hasValidType = validTypes.includes(file.type);

    if (!hasValidExtension && !hasValidType) {
      setError('Invalid file type. Please upload PDF, TXT, or Markdown files.');
      return;
    }

    setFileName(file.name);
    setUploadState('uploading');
    setError(null);
    setResult(null);

    // Simulate processing pipeline
    try {
      await simulateProcessing();
      setUploadState('complete');
    } catch (err) {
      setUploadState('error');
      setError('Failed to process file. Please try again.');
    }
  };

  const simulateProcessing = async () => {
    const stages = ['uploading', 'processing', 'complete'];
    for (const stage of stages) {
      setUploadState(stage as UploadState);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  const reset = () => {
    setUploadState('idle');
    setFileName(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Paper Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a research paper to analyze claims, citations, and potential hallucinations
        </p>
      </div>

      {/* Upload Zone */}
      <Card
        className={cn(
          'border-2 border-dashed transition-all duration-200',
          dragActive && 'border-primary/50 bg-primary/[0.035]',
          uploadState === 'idle' && 'border-border bg-card'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <CardContent className="py-14 sm:py-16">
          <div className="flex flex-col items-center text-center">
            {uploadState === 'idle' && (
              <>
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-medium mb-2">Drop your paper here</h3>
                <p className="mb-5 text-sm text-muted-foreground">
                  PDF, TXT, or Markdown · Drop a file or browse locally
                </p>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <Button variant="outline" className="pointer-events-none">
                      <File className="h-4 w-4" />
                      Browse Files
                    </Button>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </label>
                </div>
              </>
            )}

            {uploadState === 'uploading' && (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <h3 className="text-lg font-medium mb-2">Uploading...</h3>
                <p className="text-sm text-muted-foreground">{fileName}</p>
              </>
            )}

            {uploadState === 'processing' && (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <h3 className="text-lg font-medium mb-2">Analyzing...</h3>
                <div className="w-64 space-y-2">
                  <ProcessingStep label="Extracting text" done />
                  <ProcessingStep label="Chunking document" done />
                  <ProcessingStep label="Detecting claims" active />
                  <ProcessingStep label="Verifying citations" />
                  <ProcessingStep label="Evaluating groundedness" />
                </div>
              </>
            )}

            {uploadState === 'complete' && (
              <>
                <CheckCircle className="h-12 w-12 text-success mb-4" />
                <h3 className="text-lg font-medium mb-2">File received</h3>
                <p className="text-sm text-muted-foreground mb-4">{fileName}</p>
                <Button onClick={reset} variant="outline">
                  <X className="h-4 w-4" />
                  Analyze Another
                </Button>
              </>
            )}

            {uploadState === 'error' && (
              <>
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h3 className="text-lg font-medium mb-2">Error</h3>
                <p className="text-sm text-destructive mb-4">{error}</p>
                <Button onClick={reset} variant="outline">
                  Try Again
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {uploadState === 'complete' && !result && (
        <Card className="border-border/80">
          <CardContent className="flex flex-col items-center py-10 text-center sm:py-12">
            <FileText className="mb-4 h-9 w-9 text-muted-foreground/35" />
            <h2 className="text-base font-semibold">No analysis results yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              The document is selected, but claim extraction and citation verification require a connected analysis service. Results will appear here once real evidence is available.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && uploadState === 'complete' && (
        <div className="space-y-6">
          {/* Document Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Document Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatItem label="Title" value={result.title} />
                <StatItem label="Authors" value={result.authors.join(', ')} />
                <StatItem label="Sections" value={result.sections.toString()} />
                <StatItem label="Pages" value={result.pages.toString()} />
              </div>
            </CardContent>
          </Card>

          {/* Analysis Pipeline */}
          <Card>
            <CardHeader>
              <CardTitle>Analysis Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {['Extraction', 'Chunking', 'Retrieval', 'Claims', 'Verification', 'Results'].map((stage, i) => (
                  <div key={stage} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
                        <CheckCircle className="h-5 w-5" />
                      </div>
                      <span className="mt-2 text-xs">{stage}</span>
                    </div>
                    {i < 5 && <div className="mx-2 h-0.5 w-8 bg-success/50" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Claims Detected" value={result.claimsDetected} />
            <MetricCard label="Citations" value={result.citations} />
            <MetricCard label="Potential Hallucinations" value={result.potentialHallucinations} variant="warning" />
            <MetricCard label="Unsupported Claims" value={result.unsupportedClaims} variant="destructive" />
          </div>

          {/* Integration Note */}
          <Card className="border-info/20 bg-info/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium mb-1">Backend Integration Required</h4>
                  <p className="text-sm text-muted-foreground">
                    Full paper analysis requires backend integration with document processing,
                    claim extraction, and citation verification services. The UI is ready to
                    display results once the backend endpoints are implemented.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ProcessingStep({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle className="h-4 w-4 text-success" />
      ) : active ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-border" />
      )}
      <span className={cn('text-sm', done && 'text-success', active && 'text-primary')}>
        {label}
      </span>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, variant = 'default' }: { label: string; value: number; variant?: 'default' | 'warning' | 'destructive' }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <span className="text-xs text-muted-foreground">{label}</span>
        <p className={cn(
          'text-2xl font-bold mt-1',
          variant === 'warning' && 'text-warning',
          variant === 'destructive' && 'text-destructive'
        )}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
