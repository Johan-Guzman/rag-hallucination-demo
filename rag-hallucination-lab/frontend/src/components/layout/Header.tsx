'use client';

import { FlaskConical, Github, BookOpen, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FlaskConical className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">RAG Hallucination Lab</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Evidence-led RAG evaluation</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="#"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Documentation</span>
          </Link>
          <Link
            href="#"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Link>
          <div className="flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            <span>MOCK MODE</span>
          </div>
        </div>
      </div>
    </header>
  );
}
