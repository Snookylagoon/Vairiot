import { useRef, useState } from 'react';
import { FileText, Upload, Trash2, Download } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useDocuments, useUploadDocument, useDeleteDocument } from '@/hooks/useDocuments';
import { hasPermission, useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

const DOC_TYPES = [
  { value: 'purchase_invoice', label: 'Purchase Invoice' },
  { value: 'warranty', label: 'Warranty Certificate' },
  { value: 'insurance', label: 'Insurance Certificate' },
  { value: 'maintenance_report', label: 'Maintenance Report' },
  { value: 'inspection', label: 'Inspection Report' },
  { value: 'manual', label: 'User Manual' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'other', label: 'Other' },
];

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetDocuments({ assetId }: { assetId: string }) {
  const user = useAuthStore(s => s.user);
  const canWrite = hasPermission(user, 'asset:write');
  const canDelete = hasPermission(user, 'asset:delete');
  const { data: documents = [], isLoading } = useDocuments(assetId);
  const uploadDoc = useUploadDocument(assetId);
  const deleteDoc = useDeleteDocument(assetId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('other');
  const [delId, setDelId] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('document', file);
    fd.append('documentType', docType);
    await uploadDoc.mutateAsync(fd);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDownload = async (docId: string, fileName: string) => {
    const r = await api.get(`/api/v1/documents/${docId}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-v-violet" />
          <span className="font-semibold text-v-charcoal text-sm">Documents</span>
          <span className="text-xs text-gray-400">({documents.length})</span>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <select value={docType} onChange={e => setDocType(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-v-pink">
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} loading={uploadDoc.isPending}>
              <Upload size={14} className="mr-1" /> Upload
            </Button>
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
          </div>
        )}
      </CardHeader>
      <CardBody>
        {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
        {!isLoading && documents.length === 0 && <p className="text-sm text-gray-400">No documents attached.</p>}
        {documents.length > 0 && (
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={18} className="text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-v-charcoal truncate">{doc.fileName}</p>
                    <p className="text-xs text-gray-400">
                      {DOC_TYPES.find(t => t.value === doc.documentType)?.label ?? doc.documentType} &middot; {fmtSize(doc.sizeBytes)} &middot; {new Date(doc.createdAt).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleDownload(doc.id, doc.fileName)}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-v-violet transition-colors">
                    <Download size={14} />
                  </button>
                  {canDelete && (
                    <button onClick={() => setDelId(doc.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
      <ConfirmDialog
        open={Boolean(delId)}
        title="Delete Document"
        description="This document will be permanently deleted."
        confirmLabel="Delete"
        loading={deleteDoc.isPending}
        onConfirm={() => { if (delId) deleteDoc.mutate(delId, { onSuccess: () => setDelId(null) }); }}
        onCancel={() => setDelId(null)}
      />
    </Card>
  );
}
