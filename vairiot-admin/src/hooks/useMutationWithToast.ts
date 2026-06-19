import { useMutation, useQueryClient, type InvalidateQueryFilters } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AxiosError } from 'axios';

interface Options<TData, TVariables> {
  mutationFn: (vars: TVariables) => Promise<TData>;
  invalidate: InvalidateQueryFilters['queryKey'];
  success: string;
  error: string | ((err: AxiosError<{ error?: string }>) => string);
}

export function useMutationWithToast<TData = unknown, TVariables = void>(opts: Options<TData, TVariables>) {
  const qc = useQueryClient();
  return useMutation<TData, AxiosError<{ error?: string }>, TVariables>({
    mutationFn: opts.mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: opts.invalidate });
      toast.success(opts.success);
    },
    onError: (err) => {
      const msg = typeof opts.error === 'function'
        ? opts.error(err)
        : (err.response?.data?.error ?? opts.error);
      toast.error(msg);
    },
  });
}
