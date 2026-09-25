import React from 'react';
import { cn } from '../lib/utils';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'green' | 'slate' | 'white';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-3',
  xl: 'w-10 h-10 border-4',
};

const colorClasses = {
  green: 'border-emerald-200 border-t-emerald-600',
  slate: 'border-slate-200 border-t-slate-700',
  white: 'border-white/30 border-t-white',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  color = 'green',
  className,
}) => {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'rounded-full animate-spin shrink-0',
        sizeClasses[size],
        colorClasses[color],
        className
      )}
    />
  );
};

export default Spinner;
