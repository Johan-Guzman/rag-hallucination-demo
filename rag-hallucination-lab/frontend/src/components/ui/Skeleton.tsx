import { cn } from '@/lib/utils';
import { HTMLAttributes, forwardRef } from 'react';

export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('animate-pulse rounded-md bg-muted', className)}
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';
