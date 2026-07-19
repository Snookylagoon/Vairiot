import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDebounce } from './useDebounce';

/**
 * URL-backed state for tables: search, sortBy, sortOrder, and any extra
 * filter keys the page wants to manage (status, entityType, etc.).
 *
 * Why URL state: shareable links, survives reload, browser back works.
 * Pattern mirrors vairiot-web AssetsPage.
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

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== search) {
      set({ search: debouncedSearch });
    }
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      set({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      set({ sortBy: col, sortOrder: 'asc' });
    }
  };

  const extras = Object.fromEntries(extraKeys.map(k => [k, get(k)])) as Record<string, string>;

  return {
    search,
    searchInput,
    setSearchInput,
    sortBy,
    sortOrder,
    toggleSort,
    extras,
    setExtra: (k: string, v: string) => set({ [k]: v }),
    set,
  };
}
