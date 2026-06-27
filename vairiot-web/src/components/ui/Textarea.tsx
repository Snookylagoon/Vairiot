import clsx from 'clsx';
import { TextareaHTMLAttributes, forwardRef, useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, onChange, ...props }, ref) => {
    const [hasValue, setHasValue] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const setRefs = useCallback((el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
      if (el) setHasValue(!!el.value);
    }, [ref]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setHasValue(!!e.target.value);
      onChange?.(e);
    };

    const handleClear = () => {
      const ta = textareaRef.current;
      if (!ta) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(ta, '');
      onChange?.({ target: ta } as React.ChangeEvent<HTMLTextAreaElement>);
      setHasValue(false);
      ta.focus();
    };

    const showClear = hasValue && !props.disabled && !props.readOnly;

    return (
      <div className="space-y-1">
        {label && <label className="block text-sm font-medium text-v-charcoal">{label}</label>}
        <div className="relative">
          <textarea
            ref={setRefs}
            onChange={handleChange}
            className={clsx(
              'block w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink resize-none',
              error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300',
              className,
            )}
            {...props}
          />
          {showClear && (
            <button type="button" tabIndex={-1} onClick={handleClear}
              className="absolute right-2 top-2 text-gray-300 hover:text-gray-500 transition-colors">
              <X size={15} />
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
