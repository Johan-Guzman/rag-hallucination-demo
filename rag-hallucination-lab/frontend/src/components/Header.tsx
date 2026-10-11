'use client';
import { FlaskConical, Github, BookOpen, AlertTriangle } from 'lucide-react';
import React from 'react';
import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">RAG Hallucination Lab</h1>
              <p className="text-xs text-muted-foreground">
                Does Retrieval-Augmented Generation really eliminate hallucinations?
              </p>
            </div>
          </div>
          
          <nav className="flex items-center gap-4">
            <Link 
              href="#" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <BookOpen className="w-4 h-4" />
              Paper
            </Link>
            <Link 
              href="#" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Github className="w-4 h-4" />
              GitHub
            </Link>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs">
              <AlertTriangle className="w-3 h-3" />
              <span>MOCK MODE</span>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}