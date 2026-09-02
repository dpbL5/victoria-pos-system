"use client";

// ── Modal component ─────────────────────────────────────
// Dùng cho dialogs, forms, confirmations trên desktop + mobile

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
  /** center = modal giữa màn hình (mặc định); sheet = bottom-sheet trên mobile, center trên desktop; fullscreen = full màn hình trên mobile, modal giữa trên desktop */
  variant?: "center" | "sheet" | "fullscreen";
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  full: "max-w-full mx-4",
};

// Giới hạn chiều rộng áp dụng từ md trở lên — dùng cho variant fullscreen
// (mobile chiếm trọn màn hình nên không giới hạn chiều rộng)
const sizeMdClasses: Record<string, string> = {
  sm: "md:max-w-sm",
  md: "md:max-w-lg",
  lg: "md:max-w-2xl",
  full: "md:max-w-full",
};

// Số modal đang mở — modal phụ đóng không được mở khoá scroll của modal cha
let openModalCount = 0;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "center",
  className = "",
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      openModalCount += 1;
      document.body.style.overflow = "hidden";
      return () => {
        openModalCount = Math.max(0, openModalCount - 1);
        if (openModalCount === 0) document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Close on Escape — chỉ modal trên cùng (nằm cuối DOM) nhận phím này
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const panels = document.querySelectorAll("[data-modal-panel]");
      const top = panels[panels.length - 1];
      if (top && contentRef.current && !top.contains(contentRef.current)) return;
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap — keep Tab inside the modal when open
  useEffect(() => {
    if (!open || !contentRef.current) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusableSelector =
      "button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])";
    const focusable = Array.from(
      contentRef.current.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("disabled"));

    if (focusable.length > 0) focusable[0].focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => {
      document.removeEventListener("keydown", handleTab);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  const isFullscreen = variant === "fullscreen";

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[60] flex animate-fade-in md:items-center md:justify-center md:p-4"
          : `fixed inset-0 z-[60] flex p-4 pb-8 md:pb-4 animate-fade-in ${
              variant === "sheet"
                ? "items-end justify-center md:items-center"
                : "items-center justify-center"
            }`
      }
      style={{ background: "var(--color-surface-overlay)" }}
      onClick={onClose}
    >
      <div
        ref={contentRef}
        data-modal-panel
        className={`${
          isFullscreen
            ? `h-full w-full ${sizeMdClasses[size]} flex flex-col overflow-hidden bg-white shadow-xl animate-slide-up dark:bg-zinc-900 md:h-auto md:max-h-[calc(100vh-2rem)] md:rounded-2xl md:border md:border-zinc-200 dark:md:border-zinc-800`
            : `w-full ${sizeClasses[size]} max-h-[calc(100dvh-4rem)] md:max-h-[95vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 shadow-xl animate-slide-up border border-zinc-200 dark:border-zinc-800 ${
                variant === "sheet"
                  ? "max-h-[92dvh] rounded-b-none rounded-t-2xl self-end md:max-h-[95vh] md:rounded-2xl"
                  : ""
              }`
        } ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || description) && (
          <div className="shrink-0 border-b border-zinc-200 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-950/60 px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                {title && (
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    {title}
                  </h3>
                )}
                {description && (
                  <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {description}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" icon={X} onClick={onClose} />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-zinc-200 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-950/60 px-4 py-3 sm:px-5 sm:py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
