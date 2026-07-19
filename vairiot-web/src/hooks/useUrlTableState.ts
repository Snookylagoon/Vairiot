import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDebounce } from './useDebounce';

/**
 * URL-backed state for tables: search, sortBy, sortOrder, page + any extra
 * filter keys (status, categoryId, etc.). Changing search/sort/extras resets
 * page to 1.
 *
 * Mirrors the gold-standard pattern from AssetsPage; centralised here so every
 * table in vairiot-web is sortable + searchable with the same UX.
 */
export function useUrlTableState(extraKeys: readonly string[] = []) {
  const [sp, setSp] = useSearchParams();

  const get = (k: string) => sp.get(k) || '';

  const set = useCallback((updates: Record<string, string>) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v); else next.delete(k);
      }
      return next;
    }, { replace: true });
  }, [setSp]);

  const search    = get('search');
  const sortBy    = get('sortBy');
  const sortOrder = (get('sortOrder') || 'asc') as 'asc' | 'desc';
  const page      = Number(get('page')) || 1;

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== search) {
      set({ search: debouncedSearch, page: '' });
    }
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      set({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: '' });
    } else {
      set({ sortBy: col, sortOrder: 'asc', page: '' });
    }
  };

  const setPage = (p: number) => set({ page: p > 1 ? String(p) : '' });

  const extras = Object.fromEntries(extraKeys.map(k => [k, get(k)])) as Record<string, string>;

  return {
    search,
    searchInput,
    setSearchInput,
    sortBy,
    sortOrder,
    toggleSort,
    page,
    setPage,
    extras,
    setExtra: (k: string, v: string) => set({ [k]: v, page: '' }),
    set,
  };
}
