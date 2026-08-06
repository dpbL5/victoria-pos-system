'use client'

import { useEffect, useState } from 'react'
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
        <ToolCountFields
          tools={tools}
          values={toolCounts}
          onChange={setToolCounts}
        />
      </div>
    </Modal>
  )
}
