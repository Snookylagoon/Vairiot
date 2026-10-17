import { CheckCircle, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { downloadWorkbook, useImportBatch, useImportBatches, useUploadImport, WORKING, type BatchStatus, type ImportBatch } from '@/hooks/useImport';
import { MappingStep } from '@/pages/import/MappingStep';
import { ReviewStep } from '@/pages/import/ReviewStep';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const STEPS = ['Upload', 'Map the columns', 'Review and fix', 'Import'];
const STEP_OF: Record<BatchStatus, number> = {
  UPLOADED: 0, PARSING: 0, PARSED: 1, VALIDATING: 2, VALIDATED: 2, COMMITTING: 3, COMMITTED: 3, FAILED: 1, CANCELLED: 0,
};
const BADGE: Record<BatchStatus, 'green' | 'yellow' | 'red' | 'gray'> = {
  UPLOADED: 'gray', PARSING: 'yellow', PARSED: 'yellow', VALIDATING: 'yellow', VALIDATED: 'yellow', COMMITTING: 'yellow', COMMITTED: 'green', FAILED: 'red', CANCELLED: 'gray',
};
const WORKING_TEXT: Partial<Record<BatchStatus, string>> = {
  UPLOADED: 'Waiting to read the file…', PARSING: 'Reading the file…', VALIDATING: 'Checking every row…', COMMITTING: 'Importing…',
};

function UploadCard({ onUploaded }: { onUploaded: (b: ImportBatch) => void }) {
  const upload = useUploadImport();
  const canUpdate = useAuthStore(s => hasAnyPermission(s.user, 'accounting:write'));
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'CREATE' | 'UPDATE'>('CREATE');
  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-500">An .xlsx or .csv register of up to 25 MB and 50,000 rows. Old .xls files: save them as .xlsx first.</p>
      <input aria-label="Register file" type="file" accept=".xlsx,.csv" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      <fieldset className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'CREATE'} onChange={() => setMode('CREATE')} /> Add new assets</label>
        <label className={`flex items-center gap-2 ${canUpdate ? '' : 'text-gray-400'}`} title={canUpdate ? undefined : 'Needs accounting:write'}>
          <input type="radio" name="mode" disabled={!canUpdate} checked={mode === 'UPDATE'} onChange={() => setMode('UPDATE')} /> Update existing assets, matched by finance reference
        </label>
      </fieldset>
      <Button disabled={!file} loading={upload.isPending} onClick={() => file && upload.mutate({ file, mode }, { onSuccess: onUploaded })}><Upload size={14} /> Upload</Button>
    </div>
  );
}

function Recent({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: batches = [] } = useImportBatches();
  if (batches.length === 0) return null;
  return (
    <Card>
      <CardHeader><span className="font-semibold text-sm text-v-charcoal">Recent imports</span></CardHeader>
      <CardBody>
        <ul className="divide-y divide-gray-50 text-sm">
          {batches.slice(0, 10).map(b => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <button className="text-left text-v-violet hover:underline" onClick={() => onOpen(b.id)}>{b.fileName}</button>
              <span className="flex items-center gap-2 text-gray-500">
                {b.status === 'COMMITTED' ? `${b.committedCount} ${b.mode === 'UPDATE' ? 'updated' : 'imported'}` : `${b.rowCount} rows`}
                <Badge variant={BADGE[b.status]} label={b.status.toLowerCase()} />
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/**
 * The staged register import (Phase 2, S2.5, stage 2.14): upload, map the
 * columns, review and fix the rows, import. The worker reads, checks and
 * imports; this page follows the batch, which can be left and reopened.
 */
export function ImportPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get('batch');
  const { data: batch } = useImportBatch(id);
  const [remap, setRemap] = useState(false);
  const open = (next: string | null) => { setRemap(false); setParams(next ? { batch: next } : {}); };
  const step = batch ? STEP_OF[batch.status] : 0;
  const working = batch && WORKING.includes(batch.status);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Import a register</h1>
        <ol className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className={`rounded-full px-3 py-1 ${i === step ? 'bg-v-violet text-white' : i < step ? 'bg-v-violet/10 text-v-violet' : 'bg-gray-100 text-gray-400'}`} aria-current={i === step ? 'step' : undefined}>{i + 1}. {s}</li>
          ))}
        </ol>
      </div>

      {!batch ? (
        <>
          <Card><CardHeader><span className="flex items-center gap-2 font-semibold text-sm text-v-charcoal"><FileSpreadsheet size={16} className="text-v-violet" /> Upload</span></CardHeader>
            <CardBody><UploadCard onUploaded={b => open(b.id)} /></CardBody></Card>
          <Recent onOpen={open} />
        </>
      ) : (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-sm text-v-charcoal">{batch.fileName}{batch.mode === 'UPDATE' && <span className="ml-2 text-xs text-gray-500">update mode</span>}</span>
            <span className="flex items-center gap-2"><Badge variant={BADGE[batch.status]} label={batch.status.toLowerCase()} />
              <Button size="sm" variant="secondary" onClick={() => open(null)}>Another file</Button></span>
          </CardHeader>
          <CardBody className="space-y-4">
            {working && (
              <p className="flex items-center gap-2 text-sm text-gray-600" role="status"><Loader2 size={16} className="animate-spin" />{WORKING_TEXT[batch.status]}
                {batch.status === 'COMMITTING' && ` ${batch.committedCount} of ${batch.validCount + batch.warningCount}`}</p>
            )}
            {batch.status === 'FAILED' && <p className="flex items-center gap-2 text-sm text-red-600" role="alert"><XCircle size={16} /> {batch.jobError}</p>}
            {batch.status === 'CANCELLED' && <p className="text-sm text-gray-500">This import was cancelled.</p>}
            {(batch.status === 'PARSED' || remap || (batch.status === 'FAILED' && batch.rowCount > 0 && !batch.committedCount)) && (
              <>
                <p className="text-sm text-gray-500">{batch.rowCount} rows and {batch.columns.length} columns read. Choose which column becomes which field.</p>
                <MappingStep batch={batch} onDone={() => setRemap(false)} />
              </>
            )}
            {batch.status === 'VALIDATED' && !remap && <ReviewStep batch={batch} onRemap={() => setRemap(true)} />}
            {batch.status === 'COMMITTED' && (
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2 text-green-700"><CheckCircle size={16} /> {batch.committedCount} assets {batch.mode === 'UPDATE' ? 'updated' : 'imported'}{batch.errorCount ? `; ${batch.errorCount} rows left out` : ''}.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => downloadWorkbook(batch.id, 'reconciliation')}>Download the reconciliation sheet</Button>
                  {batch.errorCount > 0 && <Button variant="secondary" size="sm" onClick={() => downloadWorkbook(batch.id, 'errors')}>Download the rows left out</Button>}
                  <Link to="/assets" className="text-v-violet hover:underline self-center">Go to the assets</Link>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
