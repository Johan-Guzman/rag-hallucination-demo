'use client';

import React from 'react';
import { Loader2, CheckCircle, AlertTriangle, XCircle, Circle } from 'lucide-react';
import { cn, getStatusColor, getStatusIcon } from '@/lib/utils';
import type { PipelineState, PipelineStage } from '@/types';

const stageIcons = {
  'check-circle': CheckCircle,
  'alert-triangle': AlertTriangle,
  'x-circle': XCircle,
  'loader': Loader2,
  'circle': Circle,
};

interface PipelineStep {
  id: keyof PipelineState;
  label: string;
  description: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: 'query', label: 'Query', description: 'Pregunta del usuario' },
  { id: 'retrieval', label: 'Retrieval', description: 'Búsqueda semántica' },
  { id: 'context', label: 'Context', description: 'Documentos recuperados' },
  { id: 'generation', label: 'Generation', description: 'Generación de respuesta' },
  { id: 'evaluation', label: 'Evaluation', description: 'Evaluación de calidad' },
];

interface PipelineVisualizationProps {
  pipeline: PipelineState;
  onStepClick?: (stepId: keyof PipelineState) => void;
}

export function PipelineVisualization({ pipeline, onStepClick }: PipelineVisualizationProps) {
  return (
    <div className="surface overflow-hidden rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Pipeline Visualization</h3>
        <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded-full">
          Click a stage for details
        </span>
      </div>
      
      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border/50" />
        
        <div className="space-y-6">
          {PIPELINE_STEPS.map((step, index) => {
            const status = pipeline[step.id];
            const Icon = stageIcons[getStatusIcon(status)];
            const isLast = index === PIPELINE_STEPS.length - 1;
            
            return (
              <div
                key={step.id}
                className="relative flex gap-4 group"
                onClick={() => onStepClick?.(step.id)}
                style={{ cursor: onStepClick ? 'pointer' : 'default' }}
              >
                <div className="relative flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center z-10 transition-all duration-300">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300',
                    getStatusColor(status)
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className={cn(
                    'absolute -inset-1 rounded-full border-2 transition-all duration-300',
                    status === 'processing' && 'animate-pulse border-info/50',
                    status === 'success' && 'border-success/30',
                    status === 'warning' && 'border-warning/30',
                    status === 'failure' && 'border-destructive/30',
                  )} />
                </div>
                
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-baseline gap-2">
                    <h4 className="font-medium text-foreground">{step.label}</h4>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      getStatusColor(status)
                    )}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
                </div>
                
                {!isLast && (
                  <div className="absolute left-10 top-12 bottom-0 w-0.5 bg-border/50" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
