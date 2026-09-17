"use client"

import type { ReactNode } from "react"
import { Button } from "./button"
import { Modal } from "./modal"

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  submitting?: boolean
  size?: "sm" | "md" | "lg"
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  body,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  onConfirm,
  submitting = false,
  size = "md",
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size={size}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            disabled={submitting}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            size="lg"
            fullWidth
            loading={submitting}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {/* Nội dung nằm ở body; header chỉ giữ tiêu đề */}
      <div className="space-y-3">
        {description && (
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {description}
          </p>
        )}
        {body}
      </div>
    </Modal>
  )
}
