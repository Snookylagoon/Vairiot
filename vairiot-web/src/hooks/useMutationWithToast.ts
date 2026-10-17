import { useMutation, useQueryClient, type InvalidateQueryFilters } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';

interface Options<TData, TVariables> {
  mutationFn: (vars: TVariables) => Promise<TData>;
  invalidate: InvalidateQueryFilters['queryKey'];
  /** A function when the outcome varies, e.g. done or sent for approval (stage 3.3). */
  success: string | ((data: TData) => string);
  error: string | ((err: AxiosError<{ error?: string }>) => string);
}

export function useMutationWithToast<TData = unknown, TVariables = void>(opts: Options<TData, TVariables>) {
  const qc = useQueryClient();
  return useMutation<TData, AxiosError<{ error?: string }>, TVariables>({
    mutationFn: opts.mutationFn,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: opts.invalidate });
      toast.success(typeof opts.success === 'function' ? opts.success(data) : opts.success);
    },
    onError: (err) => {
      const msg = typeof opts.error === 'function'
        ? opts.error(err)
        : (err.response?.data?.error ?? opts.error);
      toast.error(msg);
    },
  });
}
