"use client";

// ── Modal component ─────────────────────────────────────
// Dùng cho dialogs, forms, confirmations trên desktop + mobile

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  full: "max-w-full mx-4",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className = "",
}: ModalProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 pb-8 md:pb-4 animate-fade-in"
      style={{ background: "var(--color-surface-overlay)" }}
      onClick={onClose}
    >
      <div
        className={`w-full ${sizeClasses[size]} max-h-[calc(100dvh-4rem)] md:max-h-[95vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 shadow-xl animate-slide-up border border-zinc-200 dark:border-zinc-800 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || description) && (
          <div className="shrink-0 border-b border-zinc-200 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-950/60 px-5 py-4">
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
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-zinc-200 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-950/60 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
