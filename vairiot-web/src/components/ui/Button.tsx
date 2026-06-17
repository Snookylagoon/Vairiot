import clsx from 'clsx';
import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?:    'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-v-pink focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-v-gradient text-white hover:opacity-90 shadow-sm':                         variant === 'primary',
          'bg-white text-v-charcoal border border-gray-200 hover:bg-gray-50':            variant === 'secondary',
          'bg-red-600 text-white hover:bg-red-700':                                      variant === 'danger',
          'text-v-violet hover:bg-v-wash':                                               variant === 'ghost',
          'px-2.5 py-1.5 text-xs':                                                      size === 'sm',
          'px-4 py-2 text-sm':                                                          size === 'md',
          'px-6 py-3 text-base':                                                        size === 'lg',
        },
        className,
      )}
      {...props}>
      {loading ? <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}
      {children}
    </button>
  );
}
