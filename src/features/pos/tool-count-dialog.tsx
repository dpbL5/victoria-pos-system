'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { apiJson, jsonRequest } from '@/lib/api'
import { formatClock } from './format'
import { ToolCountFields } from './tool-count-fields'
import type { Shift } from './types'

interface ToolInfo {
  id: string
  name: string
  quantity: number
  isRequired: boolean
}

export function ToolCountDialog({
  open,
  shift,
  tools,
  toolsLoading,
  toolsError,
  onRetryTools,
  hasCounted,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  open: boolean
  shift: Shift | null
  tools: ToolInfo[]
  toolsLoading: boolean
  toolsError: string
  onRetryTools: () => void
  hasCounted: boolean
  submitting: boolean
  setSubmitting: (value: boolean) => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const [toolCounts, setToolCounts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setToolCounts({})
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open])

  const handleSubmit = async () => {
    if (!shift || hasCounted) return

    const tc = tools
      .map((tool) => {
        const val = toolCounts[tool.id]
        if (val === undefined || val === '') return null
        return { toolId: tool.id, openCount: Number(val) || 0 }
      })
      .filter(Boolean) as { toolId: string; openCount: number }[]

    if (tc.length === 0) {
      notifyError('Nhập số lượng ít nhất một dụng cụ')
      return
    }

    setSubmitting(true)
    try {
      const data = await apiJson(`/api/shifts/${shift.id}/tool-counts`, jsonRequest({ toolCounts: tc }))
      if (!data.success) {
        notifyError(data.error || 'Không ghi được số dụng cụ')
        return
      }
      notifySuccess('Đã ghi lại số dụng cụ kèm người đếm')
      await onDone()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Đếm dụng cụ"
      description={shift ? `Ca đang mở từ ${formatClock(shift.openedAt)}` : undefined}
      footer={
        <Button
          variant="contrast"
          size="lg"
          fullWidth
          disabled={submitting || toolsLoading || !!toolsError || !shift || hasCounted}
          onClick={() => void handleSubmit()}
        >
          {hasCounted ? 'Đã đếm dụng cụ' : submitting ? 'Đang lưu...' : 'Lưu số dụng cụ'}
        </Button>
      }
    >
      <div className="space-y-3">
        {hasCounted ? (
        <div className="space-y-3 rounded-xl border border-success-border bg-success-bg p-3 border-success-border bg-success-bg">
            <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-success" />
          <p className="text-sm font-semibold text-success">
                Ca này đã đếm dụng cụ
              </p>
              <Badge variant="success" size="sm">Đã đếm</Badge>
            </div>
          <p className="text-xs text-success/80">
              Chỉ được đếm một lần. Số liệu sẽ được dùng để đối soát khi đóng ca.
            </p>
          </div>
        ) : (
          <>
            {toolsLoading ? (
              <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">Đang tải dụng cụ...</p>
            ) : toolsError ? (
            <div role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger border-danger-border bg-danger-bg text-danger">
                <p>Không tải được danh sách dụng cụ: {toolsError}</p>
                <button type="button" className="mt-2 font-medium underline" onClick={onRetryTools}>Thử lại</button>
              </div>
            ) : tools.length === 0 ? (
              <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                Chưa có dụng cụ nào được khai báo.
              </p>
            ) : (
              <ToolCountFields
                tools={tools}
                values={toolCounts}
                onChange={setToolCounts}
              />
            )}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Chỉ được đếm một lần cho cả ca. Số liệu được ghi kèm người đếm và dùng để đối soát khi đóng ca.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
