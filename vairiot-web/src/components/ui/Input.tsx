import clsx from 'clsx';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { InputHTMLAttributes, forwardRef, useCallback, useRef, useState } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:   string;
  error?:   string;
  hint?:    string;
  success?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, success, className, type, onChange, ...props }, ref) => {
    const isPassword = type === 'password';
    const [show, setShow] = useState(false);
    const [hasValue, setHasValue] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const showSuccess = !!success && !error;

    const setRefs = useCallback((el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
      if (el) setHasValue(!!el.value);
    }, [ref]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(!!e.target.value);
      onChange?.(e);
    };

    const handleClear = () => {
      const input = inputRef.current;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '');
      onChange?.({ target: input } as React.ChangeEvent<HTMLInputElement>);
      setHasValue(false);
      input.focus();
    };

    const showClear = hasValue && !isPassword && !props.disabled && !props.readOnly;
    const trailingIcons = (isPassword ? 1 : 0) + (showClear ? 1 : 0);

    return (
      <div className="space-y-1">
        {label && <label className="block text-sm font-medium text-v-charcoal">{label}</label>}
        <div className="relative">
          <input
            ref={setRefs}
            type={isPassword && show ? 'text' : type}
            onChange={handleChange}
            className={clsx(
              'block w-full rounded-lg border px-3 py-2 text-sm text-v-charcoal placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-v-pink focus:border-transparent',
              'transition-colors',
              error
                ? 'border-red-400 bg-red-50'
                : showSuccess
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 bg-white hover:border-gray-300',
              trailingIcons > 0 && (trailingIcons > 1 ? 'pr-16' : 'pr-8'),
              className,
            )}
            {...props}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {showClear && (
              <button type="button" tabIndex={-1} onClick={handleClear}
                className="text-gray-300 hover:text-gray-500 transition-colors">
                <X size={15} />
              </button>
            )}
            {isPassword && (
              <button type="button" tabIndex={-1} onClick={() => setShow(s => !s)}
                className="text-gray-400 hover:text-gray-600 transition-colors">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </span>
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
