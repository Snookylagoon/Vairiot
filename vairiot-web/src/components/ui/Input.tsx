import clsx from 'clsx';
import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { Eye, EyeOff, Check } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:   string;
  error?:   string;
  hint?:    string;
  success?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, success, className, type, ...props }, ref) => {
    const isPassword = type === 'password';
    const [show, setShow] = useState(false);
    const showSuccess = !!success && !error;

    return (
      <div className="space-y-1">
        {label && <label className="block text-sm font-medium text-v-charcoal">{label}</label>}
        <div className="relative">
          <input
            ref={ref}
            type={isPassword && show ? 'text' : type}
            className={clsx(
              'block w-full rounded-lg border px-3 py-2 text-sm text-v-charcoal placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-v-pink focus:border-transparent',
              'transition-colors',
              error
                ? 'border-red-400 bg-red-50'
                : showSuccess
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 bg-white hover:border-gray-300',
              isPassword && 'pr-9',
              className,
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShow(s => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {showSuccess && (
          <p className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <Check size={14} strokeWidth={3} />
            {success}
          </p>
        )}
        {hint && !showSuccess && !error && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';
