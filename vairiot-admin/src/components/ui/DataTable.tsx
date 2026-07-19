import { ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Fragment, ReactNode, useMemo, useState } from 'react';

import { Card } from './Card';

export interface DataTableColumn<T> {
  /** Sort key sent to the server. Also used as the React key. */
  key: string;
  label: string;
  /** Set false for derived/computed columns that can't be sorted server-side. */
  sortable?: boolean;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  getRowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
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

  /** Optional total/count line shown above the table. */
  total?: number;

  /** Group rows under collapsible headers. Omit to disable grouping. */
  groupBy?: {
    keyOf: (row: T) => string;
    labelOf: (row: T) => ReactNode;
    /** Optional sort comparator for group keys. Defaults to localeCompare. */
    sortGroups?: (a: string, b: string) => number;
    /** Default expanded state for groups. Defaults to true. */
    defaultExpanded?: boolean;
  };
}

export function DataTable<T>({
  columns, rows, getRowKey, isLoading, emptyMessage = 'No results found',
  onRowClick, search, sort, toolbar, total, groupBy,
}: DataTableProps<T>) {
  const showHeader = Boolean(search || toolbar || typeof total === 'number');

  const groups = useMemo(() => {
    if (!groupBy || !rows) return null;
    const map = new Map<string, { label: ReactNode; rows: T[] }>();
    for (const row of rows) {
      const key = groupBy.keyOf(row);
      if (!map.has(key)) map.set(key, { label: groupBy.labelOf(row), rows: [] });
      map.get(key)!.rows.push(row);
    }
    const cmp = groupBy.sortGroups ?? ((a: string, b: string) => a.localeCompare(b));
    return Array.from(map.entries()).sort((a, b) => cmp(a[0], b[0]));
  }, [groupBy, rows]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isCollapsed = (key: string) => {
    if (key in collapsed) return collapsed[key];
    return groupBy?.defaultExpanded === false;
  };
  const toggleGroup = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !isCollapsed(key) }));

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex flex-wrap items-center gap-3">
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
          {typeof total === 'number' && (
            <span className="ml-auto text-sm text-gray-400">{total} total</span>
          )}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left bg-gray-50">
                {columns.map(col => {
                  const isSortable = col.sortable !== false && Boolean(sort);
                  const isActive = sort?.sortBy === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={isSortable ? () => sort!.onToggle(col.key) : undefined}
                      className={`px-6 py-3 font-medium text-gray-500 ${isSortable ? 'cursor-pointer select-none hover:text-v-charcoal' : ''}`}
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
                <tr><td colSpan={columns.length} className="px-6 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {rows && rows.length === 0 && (
                <tr><td colSpan={columns.length} className="px-6 py-8 text-center text-gray-400">{emptyMessage}</td></tr>
              )}
              {groups
                ? groups.map(([groupKey, group]) => {
                    const open = !isCollapsed(groupKey);
                    return (
                      <Fragment key={`group:${groupKey}`}>
                        <tr
                          onClick={() => toggleGroup(groupKey)}
                          className="border-b border-gray-100 bg-gray-50/70 hover:bg-gray-100 transition-colors cursor-pointer select-none"
                        >
                          <td colSpan={columns.length} className="px-4 py-2">
                            <div className="flex items-center gap-2 text-v-charcoal font-medium">
                              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span>{group.label}</span>
                              <span className="text-xs text-gray-400 font-normal">({group.rows.length})</span>
                            </div>
                          </td>
                        </tr>
                        {open && group.rows.map(row => (
                          <tr
                            key={getRowKey(row)}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                            className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                          >
                            {columns.map(col => (
                              <td key={col.key} className={col.className ?? 'px-6 py-3'}>
                                {col.render(row)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })
                : rows?.map(row => (
                    <tr
                      key={getRowKey(row)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                    >
                      {columns.map(col => (
                        <td key={col.key} className={col.className ?? 'px-6 py-3'}>
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
