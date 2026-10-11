import { cn } from '@/lib/utils';
import { HTMLAttributes, forwardRef } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'outline';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-[0.01em] transition-colors',
          variant === 'default' && 'border-transparent bg-primary/10 text-primary',
          variant === 'success' && 'border-transparent bg-success/10 text-success',
          variant === 'warning' && 'border-transparent bg-warning/10 text-warning',
          variant === 'destructive' && 'border-transparent bg-destructive/10 text-destructive',
          variant === 'info' && 'border-transparent bg-info/10 text-info',
          variant === 'outline' && 'border-border text-foreground',
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';
