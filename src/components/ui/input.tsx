// ── Form input primitives ─────────────────────────────
// Dùng chung style input/select/textarea cho toàn dự án

import { ChevronDown } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const baseInputClasses =
  "w-full rounded-lg border border-border-strong bg-surface-elevated px-3 py-2 text-base text-text-primary placeholder:text-text-tertiary transition-colors sm:text-sm focus:border-info focus:ring-1 focus:ring-focus-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

// ── Select ────────────────────────────────────────────
// Bỏ mũi tên của hệ điều hành rồi vẽ lại bằng ChevronDown của lucide (cùng bộ
// icon với Button), vì mũi tên native là glyph đặc nét dày, không khớp nét 2px
// của bộ icon. Kèm theo:
//  · `<select>` mặc định không chừa chỗ cho mũi tên → chữ dài chạy sát mép phải,
//    nên chừa `pr-9` (36px): mũi tên 16px ở `right-3` (12px) còn 8px khe.
//  · mũi tên nằm NGOÀI `<select>` nên phải bọc một khung `relative`; khung giữ
//    `w-full` như cũ để mọi form hiện tại không đổi bố cục.
//  · `peer` + `peer-disabled:opacity-50` để mũi tên mờ đi cùng lúc với select.
//
// Muốn đổi bề rộng: đặt cho KHUNG BỌC (`max-w-64`, `w-[10.5rem]`…), không đặt
// cho select — mũi tên bám mép phải khung, đặt bề rộng ở select là mũi tên rời
// ra xa. Muốn khe hẹp hơn (select không viền, đứng cạnh nút nhỏ) thì truyền giá
// trị arbitrary `pr-[1.75rem]`: Tailwind xếp giá trị arbitrary SAU `pr-9` nên
// thắng, còn `pr-7` (cùng thang) thua vì Tailwind sắp theo thang chứ không theo
// thứ tự class trong chuỗi. Test `input.test.tsx` khoá các luật này.
const selectClasses = "peer appearance-none pr-9";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input ref={ref} className={`${baseInputClasses} ${className}`} {...props} />
  )
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, ...props }, ref) => (
    <div className="relative w-full">
      <select ref={ref} className={`${baseInputClasses} ${selectClasses} ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-tertiary peer-disabled:opacity-50"
      />
    </div>
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
