import React from 'react';
import { cn } from '../lib/utils';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'w-full flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-xl bg-white border border-slate-200/80 shadow-sm transition-all',
        className
      )}
    >
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-4 shadow-sm">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-800 tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-6">
          <Button
            onClick={action.onClick}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-medium px-4 py-2 rounded-lg shadow-sm shadow-emerald-600/20 inline-flex items-center gap-2"
          >
            {action.icon}
            <span>{action.label}</span>
          </Button>
        </div>
      )}
    </div>
  );
};

export default EmptyState;
