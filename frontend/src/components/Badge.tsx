import React from 'react';
import { cn } from '../lib/utils';

export interface BadgeProps {
  variant?: 'default' | 'neutral' | 'green' | 'success' | 'warning' | 'error' | 'pill' | 'blue' | 'info';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

const variantClasses: Record<string, string> = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200/80',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  blue: 'bg-blue-50 text-blue-700 border-blue-200/80',
  info: 'bg-blue-50 text-blue-700 border-blue-200/80',
  warning: 'bg-amber-50 text-amber-700 border-amber-200/70',
  error: 'bg-red-50 text-red-700 border-red-200/70',
  pill: 'bg-slate-100 text-slate-600 border-transparent',
};

const sizeClasses: Record<string, string> = {
  sm: 'text-[11px] px-2 py-0.5 min-w-[20px] h-5',
  md: 'text-xs px-2.5 py-0.5 min-w-[24px] h-6',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'sm',
  children,
  className,
  icon,
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-full border transition-colors select-none gap-1',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};

export default Badge;
