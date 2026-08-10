'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { formatClock, money, toNumber } from './format'
import { ToolCountFields } from './tool-count-fields'
import type { Shift } from './types'

export function CloseShiftDialog({
  open,
  shift,
  tools,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean
  shift: Shift | null
  tools: { id: string; name: string; quantity: number; isRequired: boolean }[]
  submitting: boolean
  onClose: () => void
  onSubmit: (closingCash: number, notes?: string, toolCounts?: { toolId: string; openCount: number }[]) => void
}) {
  const [closingCash, setClosingCash] = useState('')
  const [notes, setNotes] = useState('')
  const [toolCounts, setToolCounts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open && shift) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClosingCash(String(toNumber(shift.openingCash)))
    }
  }, [open, shift])

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToolCounts({})
    }
  }, [open])

  const handleSubmit = () => {
    const tc = tools
      .map((t) => {
        const val = toolCounts[t.id]
        if (val === undefined || val === '') return null
        return { toolId: t.id, openCount: Number(val) || 0 }
      })
      .filter(Boolean) as { toolId: string; openCount: number }[]

    onSubmit(Number(closingCash), notes.trim() || undefined, tc.length > 0 ? tc : undefined)
  }

  // ── Đối soát dụng cụ: so sánh số đếm đầu ca (ShiftTool.openCount) với số nhập khi đóng ca ──
  const countedTools = (shift?.toolCounts ?? []).filter((tc) => tc.openCount > 0)
  const closedToolIds = new Set(tools.map((t) => t.id).filter((id) => toolCounts[id] !== undefined && toolCounts[id] !== ''))
  const matches = countedTools.filter((tc) => closedToolIds.has(tc.toolId) && (Number(toolCounts[tc.toolId]) || 0) === tc.openCount)
  const mismatches = countedTools.filter((tc) => !closedToolIds.has(tc.toolId) || (Number(toolCounts[tc.toolId]) || 0) !== tc.openCount)
  const toolsCounted = countedTools.length > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Đóng ca"
      description={shift ? `Ca mở từ ${formatClock(shift.openedAt)}` : undefined}
      footer={
        <Button
          variant="inverse"
          size="lg"
          fullWidth
          disabled={submitting || !closingCash}
          onClick={handleSubmit}
        >
          {submitting ? 'Đang đóng ca...' : 'Đóng ca'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">Tiền đầu ca</span>
            <span className="font-medium text-zinc-950 dark:text-white">{money(shift?.openingCash)}</span>
          </div>
        </div>
        <div>
          <Label htmlFor="closing-cash" required>Tiền mặt thực đếm</Label>
          <Input
            id="closing-cash"
            type="number"
            min={0}
            value={closingCash}
            onChange={(event) => setClosingCash(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="closing-notes">Ghi chú cuối ca</Label>
          <Textarea
            id="closing-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        {toolsCounted && (
          <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-950 dark:text-white">
              Đối soát dụng cụ
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Số đếm đầu ca: nhập lại số đếm cuối ca bên dưới để so sánh.
            </p>
            <div className="space-y-1">
              {countedTools.map((tc) => {
                const closedVal = toolCounts[tc.toolId]
                const closed = closedVal !== undefined && closedVal !== ''
                const equal = closed && (Number(closedVal) || 0) === tc.openCount
                return (
                  <div key={tc.toolId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-300">{tc.tool.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-zinc-500 dark:text-zinc-400">Đầu ca: {tc.openCount}</span>
                      {closed ? (
                        equal ? (
                          <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={13} /> Khớp
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                            <XCircle size={13} /> Lệch
                          </span>
                        )
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">Chưa nhập</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className={`text-xs font-medium ${mismatches.length === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {matches.length}/{countedTools.length} dụng cụ khớp với đầu ca
            </p>
          </div>
        )}
        <ToolCountFields
          tools={tools}
          values={toolCounts}
          onChange={setToolCounts}
        />
      </div>
    </Modal>
  )
}
