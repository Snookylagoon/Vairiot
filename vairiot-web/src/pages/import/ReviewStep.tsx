import { Fragment, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { downloadWorkbook, useBatchAction, useEditRow, useImportRows, type ImportBatch, type ImportRow, type RowStatus } from '@/hooks/useImport';

const FIELD = 'rounded-lg border border-gray-200 px-2 py-1 text-sm bg-white';
const TABS: Array<{ status: RowStatus | ''; label: string }> = [
  { status: 'ERROR', label: 'To fix' }, { status: 'WARNING', label: 'Warnings' }, { status: 'VALID', label: 'Ready' }, { status: 'PENDING', label: 'Corrected' }, { status: '', label: 'All' },
];
const BADGE = { PENDING: 'gray', VALID: 'green', WARNING: 'yellow', ERROR: 'red', COMMITTED: 'green' } as const;

function RowEditor({ batchId, row, columns, onClose }: { batchId: string; row: ImportRow; columns: string[]; onClose: () => void }) {
  const edit = useEditRow(batchId);
  const [cells, setCells] = useState<Record<string, string>>({});
  return (
    <tr><td colSpan={columns.length + 2} className="bg-gray-50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {columns.map(c => (
          <label key={c} className="flex flex-col gap-1 text-xs text-gray-500">{c}
            <input aria-label={`${c}, row ${row.rowNumber}`} className={FIELD} defaultValue={row.raw[c] === null || row.raw[c] === undefined ? '' : String(row.raw[c])}
              onChange={e => setCells(x => ({ ...x, [c]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={Object.keys(cells).length === 0} loading={edit.isPending} onClick={() => edit.mutate({ rowId: row.id, cells }, { onSuccess: onClose })}>Save the row</Button>
        <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </td></tr>
  );
}

/**
 * The rows as checked (stage 2.14): what is ready, what warns and what must be
 * fixed, with the reasons. A row is corrected here or in the downloaded
 * workbook; corrected rows are checked again before anything is imported.
 */
export function ReviewStep({ batch, onRemap }: { batch: ImportBatch; onRemap: () => void }) {
  const [tab, setTab] = useState<RowStatus | ''>(batch.errorCount > 0 ? 'ERROR' : '');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const { data } = useImportRows(batch.id, tab, page);
  const { data: pending } = useImportRows(batch.id, 'PENDING', 1);
  const action = useBatchAction(batch.id);
  const columns = [...new Set(Object.values(batch.mapping?.fields ?? {}))].filter((c): c is string => !!c);
  const corrected = (pending?.total ?? 0) > 0;
  const importable = batch.validCount + batch.warningCount;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span><strong>{batch.validCount}</strong> ready</span>
        <span><strong>{batch.warningCount}</strong> with warnings</span>
        <span className={batch.errorCount ? 'text-red-600' : ''}><strong>{batch.errorCount}</strong> to fix (left out)</span>
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={onRemap}>Change the mapping</Button>
        {batch.errorCount > 0 && <Button variant="secondary" size="sm" onClick={() => downloadWorkbook(batch.id, 'errors')}>Download the rows to fix</Button>}
      </div>

      <div className="flex gap-1 border-b border-gray-100" role="tablist">
        {TABS.filter(t => t.status !== 'PENDING' || corrected).map(t => (
          <button key={t.label} role="tab" aria-selected={tab === t.status} onClick={() => { setTab(t.status); setPage(1); }}
            className={`px-3 py-1.5 text-sm ${tab === t.status ? 'border-b-2 border-v-violet text-v-violet' : 'text-gray-500'}`}>{t.label}</button>
        ))}
      </div>

      {data && data.rows.length === 0 ? <p className="text-sm text-gray-400">No rows here.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-400"><tr><th className="py-1 pr-2">Row</th>{columns.map(c => <th key={c} className="pr-3">{c}</th>)}<th>Check</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {data?.rows.map(r => (
                <Fragment key={r.id}>
                  <tr className="align-top">
                    <td className="py-1.5 pr-2 text-gray-500">{r.rowNumber}</td>
                    {columns.map(c => <td key={c} className="pr-3">{r.raw[c] === null || r.raw[c] === undefined ? '' : String(r.raw[c])}</td>)}
                    <td className="min-w-64">
                      <Badge variant={BADGE[r.status]} label={r.status.toLowerCase()} />
                      {r.messages.map((m, i) => <p key={i} className={`text-xs ${m.level === 'error' ? 'text-red-600' : 'text-amber-700'}`}>{m.message}</p>)}
                      {r.status !== 'COMMITTED' && editing !== r.id && <button className="text-xs text-v-violet hover:underline" onClick={() => setEditing(r.id)}>Correct</button>}
                    </td>
                  </tr>
                  {editing === r.id && <RowEditor batchId={batch.id} row={r} columns={batch.columns} onClose={() => setEditing(null)} />}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        {corrected ? (
          <>
            <Button loading={action.isPending} onClick={() => action.mutate('validate')}>Check the rows again</Button>
            <span className="text-xs text-gray-500">{pending?.total} corrected row{pending?.total === 1 ? '' : 's'}: check again before importing.</span>
          </>
        ) : (
          <Button disabled={importable === 0} loading={action.isPending} onClick={() => action.mutate('commit')}>
            {batch.mode === 'UPDATE' ? `Update ${importable} asset${importable === 1 ? '' : 's'}` : `Import ${importable} asset${importable === 1 ? '' : 's'}`}
          </Button>
        )}
        <Button variant="secondary" onClick={() => action.mutate('cancel')}>Cancel the import</Button>
      </div>
    </div>
  );
}
