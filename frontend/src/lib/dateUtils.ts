export function formatRelativeTime(
  dateInput: string | Date | null | undefined,
  status?: string
): string {
  if (!dateInput) return '—';

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '—';

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // For jobs with status "queued" or "scheduled" (or any pending job), compute and show time-until (scheduledFor - now)
  const isPastStatus = status === 'sent' || status === 'failed';
  const isPending = !isPastStatus;

  if (isPending) {
    if (diffMs <= 0) {
      return 'Due now';
    }
    if (diffSec < 45) return 'in a few seconds';
    const diffMin = Math.round(diffSec / 60);
    if (diffMin <= 1) return 'in 1m';
    if (diffMin < 60) return `in ${diffMin}m`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `in ${diffHours}h`;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${timeStr}`;
    }

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `in ${diffDays}d`;

    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const absSec = Math.abs(diffSec);
  if (absSec < 45) return 'Just now';
  const diffMin = Math.round(absSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${timeStr}`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatAbsoluteTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '—';

  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
