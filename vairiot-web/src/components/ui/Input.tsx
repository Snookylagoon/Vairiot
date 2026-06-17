import clsx from 'clsx';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:   string;
  error?:   string;
  hint?:    string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-v-charcoal">{label}</label>}
      <input
        ref={ref}
        className={clsx(
          'block w-full rounded-lg border px-3 py-2 text-sm text-v-charcoal placeholder-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-v-pink focus:border-transparent',
          'transition-colors',
          error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint  && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  ),
);
Input.displayName = 'Input';
