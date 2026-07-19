import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import type { ImportResult } from '@/types';

export function useImportAssets() {
  const qc = useQueryClient();
  return useMutation<ImportResult, Error, { rows: Record<string, string>[] }>({
    mutationFn: (data) => api.post('/api/v1/assets/import', data).then(r => r.data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(`Imported ${result.created} assets${result.skipped ? `, ${result.skipped} skipped` : ''}`);
    },
    onError: () => { toast.error('Import failed'); },
  });
}
