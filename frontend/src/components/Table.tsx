import React from 'react';
import { cn } from '../lib/utils';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  className?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  onRowClick?: (row: T, index: number) => void;
  isLoading?: boolean;
  skeletonRows?: number;
}

export function Table<T extends Record<string, any>>({
  columns,
  data,
  className,
  emptyTitle,
  emptyMessage = 'No records found',
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRowClick,
  isLoading,
  skeletonRows = 5,
}: TableProps<T>) {
  if (!isLoading && data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle || emptyMessage}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const skeletonWidths = ['w-3/4', 'w-11/12', 'w-1/2', 'w-2/3', 'w-4/5'];

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm',
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn('px-4 py-3 font-semibold select-none', col.className)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {isLoading ? (
              Array.from({ length: skeletonRows }).map((_, rIdx) => (
                <tr key={`skeleton-${rIdx}`} className="animate-pulse">
                  {columns.map((col, cIdx) => (
                    <td key={col.key} className={cn('px-4 py-3.5', col.className)}>
                      <div
                        className={cn(
                          'h-4 bg-slate-200/70 rounded-md',
                          skeletonWidths[(rIdx + cIdx) % skeletonWidths.length]
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              data.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  onClick={() => onRowClick && onRowClick(row, idx)}
                  className={cn(
                    'group transition-colors duration-100',
                    onRowClick ? 'cursor-pointer hover:bg-slate-50/80' : 'hover:bg-slate-50/50'
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('px-4 py-3 leading-normal align-middle', col.className)}
                    >
                      {col.render ? col.render(row, idx) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Table;
