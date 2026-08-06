'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { formatClock, money } from './format'
import { ToolCountFields } from './tool-count-fields'
import type { Shift } from './types'

export function OpenShiftDialog({
  open,
  existingShift,
  tools,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean
  existingShift: Shift | null
  tools: { id: string; name: string; quantity: number; isRequired: boolean }[]
  submitting: boolean
  onClose: () => void
  onSubmit: (openingCash?: number, notes?: string, toolCounts?: { toolId: string; openCount: number }[]) => void
}) {
  const [openingCash, setOpeningCash] = useState('0')
  const [notes, setNotes] = useState('')
  const [toolCounts, setToolCounts] = useState<Record<string, string>>({})
  const isJoiningExistingShift = !!existingShift

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setOpeningCash('0')
    setNotes('')
    setToolCounts({})
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, existingShift?.id])

  const handleSubmit = () => {
    if (isJoiningExistingShift) {
      onSubmit()
      return
    }

    const tc = tools
      .map((t) => {
        const val = toolCounts[t.id]
        if (val === undefined || val === '') return null
        return { toolId: t.id, openCount: Number(val) || 0 }
      })
      .filter(Boolean) as { toolId: string; openCount: number }[]

    onSubmit(Number(openingCash || 0), notes.trim() || undefined, tc.length > 0 ? tc : undefined)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isJoiningExistingShift ? 'Tham gia ca đang mở' : 'Mở ca'}
      description={
        isJoiningExistingShift
          ? 'Ca quầy đã được mở, bạn chỉ cần tham gia để vận hành POS.'
          : 'Nhập tiền mặt đầu ca để bắt đầu ca quầy.'
      }
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting
            ? 'Đang xử lý...'
            : isJoiningExistingShift
              ? 'Tham gia ca'
              : 'Mở ca'}
        </Button>
      }
    >
      <div className="space-y-3">
        {isJoiningExistingShift ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Ca đang mở từ {formatClock(existingShift.openedAt)}
                </p>
                <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                  Người mở ca: {existingShift.staff?.fullName ?? 'Không rõ'} · Tiền đầu ca {money(existingShift.openingCash)}
                </p>
              </div>
              <Badge variant="success">Đang mở</Badge>
            </div>
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="opening-cash">Tiền mặt đầu ca</Label>
              <Input
                id="opening-cash"
                type="number"
                min={0}
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="opening-notes">Ghi chú</Label>
              <Textarea
                id="opening-notes"
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
          </>
        )}
      </div>
    </Modal>
  )
}
