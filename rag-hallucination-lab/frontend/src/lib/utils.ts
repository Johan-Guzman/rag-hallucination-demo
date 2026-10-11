import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'success':
      return 'text-success border-success/30 bg-success/10';
    case 'warning':
      return 'text-warning border-warning/30 bg-warning/10';
    case 'failure':
      return 'text-destructive border-destructive/30 bg-destructive/10';
    case 'processing':
      return 'text-info border-info/30 bg-info/10 animate-pulse-soft';
    default:
      return 'text-muted-foreground border-border/30 bg-muted/30';
  }
}

export function getStatusIcon(status: string) {
  switch (status) {
    case 'success':
      return 'check-circle';
    case 'warning':
      return 'alert-triangle';
    case 'failure':
      return 'x-circle';
    case 'processing':
      return 'loader';
    default:
      return 'circle';
  }
}

export function getClaimStatusColor(status: string) {
  switch (status) {
    case 'supported':
      return 'text-success border-success/30 bg-success/10';
    case 'unsupported':
      return 'text-warning border-warning/30 bg-warning/10';
    case 'contradicted':
      return 'text-destructive border-destructive/30 bg-destructive/10';
    case 'uncertain':
      return 'text-info border-info/30 bg-info/10';
    default:
      return 'text-muted-foreground border-border/30 bg-muted/30';
  }
}

export function getClaimStatusLabel(status: string) {
  switch (status) {
    case 'supported':
      return 'Soportado';
    case 'unsupported':
      return 'No soportado';
    case 'contradicted':
      return 'Contradicho';
    case 'uncertain':
      return 'Incierto';
    default:
      return status;
  }
}

export function formatScore(score: number): string {
  return (score * 100).toFixed(0) + '%';
}

export function getScoreColor(score: number) {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
}