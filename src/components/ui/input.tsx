// ── Form input primitives ─────────────────────────────
// Dùng chung style input/select/textarea cho toàn dự án

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const baseInputClasses =
  "w-full rounded-lg border border-border-strong bg-surface-elevated px-3 py-2 text-base text-text-primary placeholder:text-text-tertiary transition-colors sm:text-sm focus:border-info focus:ring-1 focus:ring-focus-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input ref={ref} className={`${baseInputClasses} ${className}`} {...props} />
  )
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, ...props }, ref) => (
    <select ref={ref} className={`${baseInputClasses} ${className}`} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea ref={ref} className={`${baseInputClasses} resize-none ${className}`} {...props} />
  )
);
Textarea.displayName = "Textarea";

// ── Label ──────────────────────────────────────────────
interface LabelProps {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}

export function Label({ htmlFor, children, required, className = "" }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-1 block text-xs font-medium text-text-secondary ${className}`}
    >
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  );
}
