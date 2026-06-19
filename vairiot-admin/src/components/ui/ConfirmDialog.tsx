import { useEffect } from 'react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open:        boolean;
  title:       string;
  description: string;
  confirmLabel?: string;
  variant?:    'danger' | 'primary';
  loading?:    boolean;
  onConfirm:   () => void;
  onCancel:    () => void;
  children?:   React.ReactNode;
}

export function ConfirmDialog({
  open, title, description,
  confirmLabel = 'Confirm', variant = 'danger',
  loading, onConfirm, onCancel, children,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 space-y-4">
        <h3 className="text-lg font-bold text-v-charcoal">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
        {children}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button variant={variant} size="sm" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
