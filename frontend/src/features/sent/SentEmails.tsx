import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Table,
  Column,
  Badge,
  Tooltip,
  Pagination,
  EmptyState,
  useToast,
  ConfirmDialog,
} from '../../components';
import { apiRequest, API_BASE_URL } from '../../lib/api';
import { useDebounce, useSelectableRows } from '../../hooks';
import { formatRelativeTime, formatAbsoluteTime } from '../../lib/dateUtils';
import { DashboardOutletContext } from '../../pages/DashboardPage';
import {
  Send,
  RefreshCw,
  Plus,
  Mail,
  AlertCircle,
  HelpCircle,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

export interface SentEmailItem {
  id: string;
  recipientEmail: string;
  subject: string;
  bodyHtml?: string;
  status: 'sent' | 'failed' | string;
  scheduledFor?: string;
  sentAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt?: string;
  batchId?: string;
  batch?: {
    id?: string;
    subject?: string;
    sender?: {
      fromName?: string;
      fromAddress?: string;
    };
  };
}

interface SentEmailsProps {
  searchQuery?: string;
  onOpenCompose?: () => void;
}

export const SentEmails: React.FC<SentEmailsProps> = ({
  searchQuery: propSearchQuery,
  onOpenCompose: propOnOpenCompose,
}) => {
  const toast = useToast();
  const outletContext = useOutletContext<DashboardOutletContext | undefined>();
  const onOpenCompose = propOnOpenCompose || outletContext?.onOpenCompose;
  const activeSearchQuery =
    propSearchQuery !== undefined ? propSearchQuery : (outletContext?.searchQuery || '');
  const refreshCounts = outletContext?.refreshCounts;

  const [sentData, setSentData] = useState<SentEmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchSource, setSearchSource] = useState<string | null>(null);

  const {
    selectedIds,
    selectedCount,
    hasSelection,
    allVisibleSelected,
    someVisibleSelected,
    toggleRow,
    toggleAll,
    clearSelection,
    isSelected,
    removeSelectedIds,
  } = useSelectableRows(sentData);

  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [itemToDeleteSingle, setItemToDeleteSingle] = useState<SentEmailItem | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const debouncedQuery = useDebounce(activeSearchQuery, 300);

  const prevQueryRef = useRef(debouncedQuery);
  useEffect(() => {
    if (prevQueryRef.current !== debouncedQuery) {
      prevQueryRef.current = debouncedQuery;
      setPage(1);
    }
  }, [debouncedQuery]);

  const loadData = useCallback(
    async (silent: boolean = false) => {
      try {
        if (!silent) {
          setLoading(true);
        } else {
          setIsRefreshing(true);
        }
        setError(null);

        if (debouncedQuery.trim()) {

          const res = await apiRequest<{
            data: SentEmailItem[];
            total: number;
            totalPages: number;
            page: number;
            limit: number;
            source: string;
          }>(
            `/api/emails/search?q=${encodeURIComponent(
              debouncedQuery.trim()
            )}&status=sent,failed&page=${page}&limit=${limit}`
          );

          setSentData(res.data || []);
          setTotal(res.total || 0);
          setTotalPages(res.totalPages || 1);
          setSearchSource(res.source || null);
        } else {

          const res = await apiRequest<{
            data: SentEmailItem[];
            pagination: {
              total: number;
              page: number;
              limit: number;
              totalPages: number;
            };
          }>(`/api/emails/sent?page=${page}&limit=${limit}`);

          setSentData(res.data || []);
          setTotal(res.pagination?.total ?? 0);
          setTotalPages(res.pagination?.totalPages ?? 1);
          setSearchSource(null);
        }

        if (refreshCounts) {
          refreshCounts();
        }
      } catch (err: any) {
        console.error('[SentEmails] Failed to load:', err);
        let errorMsg = err.message || 'Failed to load dispatched emails';
        if (err.isNetworkError || (err.name === 'TypeError' && err.message?.toLowerCase().includes('fetch'))) {
          errorMsg = `Network Error: Cannot connect to backend API at ${API_BASE_URL}. Ensure the backend server is running and CORS is configured.`;
        } else if (err.status === 401) {
          errorMsg = 'Authentication required (401): Please log in or check your session cookie.';
        } else if (err.status === 403) {
          errorMsg = 'Access forbidden (403): You lack permissions to view sent emails.';
        } else if (err.status >= 500) {
          errorMsg = `Backend Server Error (${err.status}): ${err.message || 'Internal error'}`;
        }
        setError(errorMsg);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [debouncedQuery, page, limit, refreshCounts]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true);
    }, 12000);

    return () => clearInterval(interval);
  }, [loadData]);

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);

      if (itemToDeleteSingle) {
        const targetId = itemToDeleteSingle.id;
        // Optimistic update
        setSentData((prev) => prev.filter((item) => item.id !== targetId));
        setTotal((prev) => Math.max(0, prev - 1));
        removeSelectedIds([targetId]);
        setConfirmModalOpen(false);
        setItemToDeleteSingle(null);

        await apiRequest<{ success: boolean }>(`/api/emails/${targetId}`, {
          method: 'DELETE',
        });

        toast.success('Email deleted successfully');
        if (refreshCounts) refreshCounts();
      } else {
        const idsToDelete = [...selectedIds];
        // Optimistic update
        setSentData((prev) => prev.filter((item) => !idsToDelete.includes(item.id)));
        setTotal((prev) => Math.max(0, prev - idsToDelete.length));
        clearSelection();
        setConfirmModalOpen(false);

        try {
          await apiRequest<{
            success: boolean;
            count: number;
            message: string;
          }>('/api/emails/bulk', {
            method: 'DELETE',
            body: JSON.stringify({ ids: idsToDelete }),
          });

          toast.success(`${idsToDelete.length} email${idsToDelete.length === 1 ? '' : 's'} deleted`);
          if (refreshCounts) refreshCounts();
        } catch (bulkErr: any) {
          const errData = bulkErr?.data;
          if (errData?.unauthorizedIds || errData?.missingIds) {
            const failedList = [
              ...(errData.unauthorizedIds || []),
              ...(errData.missingIds || []),
            ];
            toast.error(
              `Failed to delete: ${failedList.join(', ')} (${errData.message || 'permission denied'})`
            );
          } else {
            toast.error(bulkErr?.message || 'Failed to delete emails');
          }
          loadData(true);
          if (refreshCounts) refreshCounts();
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete email');
      loadData(true);
      if (refreshCounts) refreshCounts();
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<SentEmailItem>[] = [
    {
      key: 'select',
      header: (
        <div className="flex items-center">
          <input
            type="checkbox"
            aria-label="Select all visible emails"
            checked={allVisibleSelected}
            ref={(el) => {
              if (el) el.indeterminate = someVisibleSelected;
            }}
            onChange={toggleAll}
            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
        </div>
      ),
      className: 'w-[42px] px-3',
      render: (row) => (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select email to ${row.recipientEmail}`}
            checked={isSelected(row.id)}
            onChange={() => toggleRow(row.id)}
            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
        </div>
      ),
    },
    {
      key: 'recipientEmail',
      header: 'Email (Recipient)',
      className: 'min-w-[200px]',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              row.status === 'failed'
                ? 'bg-red-50 text-red-600'
                : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-slate-900 truncate">
              {row.recipientEmail}
            </span>
            {row.batch?.sender?.fromName && (
              <span className="text-[11px] text-slate-400 truncate">
                From {row.batch.sender.fromName}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      className: 'min-w-[220px]',
      render: (row) => (
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-slate-800 line-clamp-1" title={row.subject}>
            {row.subject || '(No Subject)'}
          </span>
          {row.errorMessage && row.status === 'failed' ? (
            <span className="text-[11px] text-red-500 truncate" title={row.errorMessage}>
              {row.errorMessage}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'sentAt',
      header: 'Sent Time',
      className: 'min-w-[190px]',
      render: (row) => {
        const timeToFormat = row.sentAt || row.updatedAt || row.createdAt;
        if (!timeToFormat) return <span className="text-slate-400 text-xs">—</span>;

        const relative = formatRelativeTime(timeToFormat, row.status);
        const absolute = formatAbsoluteTime(timeToFormat);

        return (
          <Tooltip content={absolute} position="top">
            <div
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 px-2 py-1 rounded-md border border-slate-200/80 cursor-help transition-colors"
              title={absolute}
            >
              {row.status === 'sent' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              )}
              <span className="font-medium">{relative}</span>
            </div>
          </Tooltip>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-[120px]',
      render: (row) => {
        if (row.status === 'sent') {
          return (
            <Badge variant="green" size="sm" className="font-medium capitalize">
              Sent
            </Badge>
          );
        }

        const errorText = row.errorMessage || 'Dispatch failed after maximum retry attempts.';

        return (
          <div className="inline-flex items-center gap-1.5">
            <Badge variant="error" size="sm" className="font-medium capitalize">
              Failed
            </Badge>
            <Tooltip
              content={
                <div className="flex flex-col gap-1 max-w-xs">
                  <span className="font-semibold text-red-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                    Delivery Error
                  </span>
                  <span className="text-[11px] text-slate-200 leading-relaxed">
                    {errorText}
                  </span>
                </div>
              }
              position="top"
            >
              <button
                type="button"
                className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-0.5 rounded cursor-help transition-colors inline-flex items-center justify-center"
                title={errorText}
                aria-label="View error message"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'w-[44px] text-right px-2',
      render: (row) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setItemToDeleteSingle(row);
              setConfirmModalOpen(true);
            }}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
            title="Delete email"
            aria-label="Delete email"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Dispatched Emails
            </h2>
            {searchSource && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                {searchSource === 'elasticsearch' ? 'Elasticsearch' : 'MySQL Fallback'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Historical log of emails dispatched via SMTP transport with delivery confirmations
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasSelection ? (
            <div className="flex items-center gap-2.5 bg-red-50/80 border border-red-200/90 px-3 py-1.5 rounded-xl shadow-2xs animate-in fade-in duration-150">
              <span className="text-xs font-semibold text-red-900">
                {selectedCount} selected
              </span>
              <div className="h-4 w-px bg-red-200" />
              <button
                type="button"
                onClick={() => {
                  setItemToDeleteSingle(null);
                  setConfirmModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-all shadow-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-slate-500 hover:text-slate-800 underline font-medium cursor-pointer"
              >
                Clear selection
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => loadData(false)}
                disabled={loading || isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-medium transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                title="Refresh list"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading || isRefreshing ? 'animate-spin text-emerald-600' : ''}`}
                />
                <span>Refresh</span>
              </button>

              {onOpenCompose && (
                <button
                  type="button"
                  onClick={onOpenCompose}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-all shadow-sm shadow-emerald-600/20 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Compose Email</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => loadData(false)}
            className="underline font-medium hover:text-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && sentData.length === 0 ? (
        <EmptyState
          icon={<Send className="w-7 h-7 text-emerald-600" />}
          title={
            debouncedQuery.trim()
              ? `No sent emails matching "${debouncedQuery}"`
              : 'No sent emails yet'
          }
          description={
            debouncedQuery.trim()
              ? 'Try modifying your search terms or clear the search box to view all dispatched outreach.'
              : 'All dispatched outreach with delivery timestamps, status confirmations, and preview details will appear here once processed.'
          }
          action={
            debouncedQuery.trim()
              ? undefined
              : onOpenCompose
              ? {
                  label: 'Compose New Email',
                  icon: <Plus className="w-4 h-4" />,
                  onClick: onOpenCompose,
                }
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <Table
            columns={columns}
            data={sentData}
            isLoading={loading}
            skeletonRows={limit > 10 ? 8 : limit}
          />

          {!loading && total > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={(newPage) => setPage(newPage)}
              onLimitChange={(newLimit) => {
                setLimit(newLimit);
                setPage(1);
              }}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setConfirmModalOpen(false);
            setItemToDeleteSingle(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title={itemToDeleteSingle ? 'Delete Email?' : `Delete ${selectedCount} Emails?`}
        description={
          itemToDeleteSingle
            ? `Delete email to "${itemToDeleteSingle.recipientEmail}"? This can't be undone.`
            : `Delete ${selectedCount} emails? This can't be undone.`
        }
        confirmLabel="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
};

export default SentEmails;
