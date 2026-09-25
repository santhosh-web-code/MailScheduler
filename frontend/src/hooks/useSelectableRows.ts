import { useState, useCallback, useMemo } from 'react';

export interface UseSelectableRowsReturn {
  selectedIds: string[];
  selectedCount: number;
  hasSelection: boolean;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  toggleRow: (id: string) => void;
  toggleAll: () => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  removeSelectedIds: (ids: string[]) => void;
}

export function useSelectableRows<T extends { id: string }>(items: T[]): UseSelectableRowsReturn {
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (id: string) => selectedSet.has(id),
    [selectedSet]
  );

  const toggleRow = useCallback((id: string) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const allVisibleSelected = useMemo(() => {
    if (items.length === 0) return false;
    return items.every((item) => selectedSet.has(item.id));
  }, [items, selectedSet]);

  const someVisibleSelected = useMemo(() => {
    if (items.length === 0 || allVisibleSelected) return false;
    return items.some((item) => selectedSet.has(item.id));
  }, [items, selectedSet, allVisibleSelected]);

  const toggleAll = useCallback(() => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        // Deselect all currently visible items
        items.forEach((item) => next.delete(item.id));
      } else {
        // Select all currently visible items
        items.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }, [items, allVisibleSelected]);

  const clearSelection = useCallback(() => {
    setSelectedSet(new Set());
  }, []);

  const removeSelectedIds = useCallback((idsToRemove: string[]) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      idsToRemove.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const selectedIds = useMemo(() => Array.from(selectedSet), [selectedSet]);
  const selectedCount = selectedSet.size;
  const hasSelection = selectedCount > 0;

  return {
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
  };
}

export default useSelectableRows;
