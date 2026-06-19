import { ReactNode } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Search } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

export interface DataTableColumn<T> {
  /** Sort key sent to server. Also used as React key for the column. */
  key: string;
  label: string;
  /** Set false for derived/computed columns that can't be sorted. */
  sortable?: boolean;
  render: (row: T) => ReactNode;
  /** Override td className (default: `px-4 py-3`). */
  className?: string;
  /** Override th className (default: left-aligned). */
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  getRowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (row: T) => void;

  /** Search box. Omit to hide. */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };

  /** Sort state. Omit to hide arrows. */
  sort?: {
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    onToggle: (col: string) => void;
  };

  /** Extra toolbar controls (filter chips, date pickers, etc.). */
  toolbar?: ReactNode;

  /** Trailing toolbar items (right-aligned). */
  toolbarEnd?: ReactNode;

  /** Pagination. Omit to hide. */
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<T>({
  columns, rows, getRowKey, isLoading, emptyMessage = 'No results found', emptyIcon,
  onRowClick, search, sort, toolbar, toolbarEnd, pagination,
}: DataTableProps<T>) {
  const showHeader = Boolean(search || toolbar || toolbarEnd);

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search.value}
                onChange={e => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? 'Search…'}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink"
              />
            </div>
          )}
          {toolbar}
          {toolbarEnd && <div className="ml-auto flex items-center gap-2">{toolbarEnd}</div>}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {columns.map(col => {
                  const isSortable = col.sortable !== false && Boolean(sort);
                  const isActive = sort?.sortBy === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={isSortable ? () => sort!.onToggle(col.key) : undefined}
                      className={`${col.headerClassName ?? 'px-4 py-3 text-left'} text-xs font-semibold text-gray-500 uppercase tracking-wider ${isSortable ? 'cursor-pointer select-none hover:text-v-charcoal' : ''}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {isSortable && (
                          isActive
                            ? (sort!.sortOrder === 'asc'
                                ? <ArrowUp   size={12} className="text-v-violet" />
                                : <ArrowDown size={12} className="text-v-violet" />)
                            : <ArrowUpDown size={12} className="text-gray-300" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading && !rows && (
                <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {rows && rows.length === 0 && (
                <tr><td colSpan={columns.length} className="px-4 py-12 text-center">
                  {emptyIcon && <div className="mb-2">{emptyIcon}</div>}
                  <p className="text-gray-400 text-sm">{emptyMessage}</p>
                </td></tr>
              )}
              {rows?.map(row => (
                <tr
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-gray-50 hover:bg-v-wash transition-colors last:border-0 ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map(col => (
                    <td key={col.key} className={col.className ?? 'px-4 py-3'}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && (
          <PaginationFooter {...pagination} />
        )}
      </Card>
    </div>
  );
}

function PaginationFooter({ page, totalPages, total, pageSize, onPageChange }: {
  page: number; totalPages: number; total: number; pageSize: number; onPageChange: (p: number) => void;
}) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  return (
    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
      <p className="text-xs text-gray-500">
        {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <PageNumbers current={page} total={totalPages} onSelect={onPageChange} />
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function PageNumbers({ current, total, onSelect }: { current: number; total: number; onSelect: (p: number) => void }) {
  const pages: (number | '…')[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push('…');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('…');
    pages.push(total);
  }
  return (
    <>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-xs text-gray-400">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={`min-w-[28px] h-7 rounded text-xs font-medium transition-colors ${
              p === current ? 'bg-v-violet text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {p}
          </button>
        ),
      )}
    </>
  );
}
