'use client'

import { useRef, useState } from 'react'
import { Input, Label, Select } from '@/components/ui/input'
import {
  cashInputToNumber,
  formatCashInput,
  getCashInputSuggestions,
  normalizeCashInput,
} from '@/lib/shared/cash-input'
import { money, paymentMethodLabel } from './format'
import type { PaymentMethod } from './types'

const METHODS: PaymentMethod[] = ['CASH', 'TRANSFER', 'CARD']

/**
 * Khối chọn phương thức thanh toán dùng chung: select + QR chuyển khoản
 * (khi chọn Chuyển khoản) + ô "Tiền khách đưa" kèm gợi ý mệnh giá và
 * số tiền trả lại / còn thiếu.
 *
 * State "tiền khách đưa" nằm trong component — khi cha đổi đối tượng thu
 * (khác phiên, khác gói hội viên) hãy gắn `key` để mount lại và tự xoá số cũ.
 */
export function PaymentMethodPicker({
  id,
  amount,
  method,
  onMethodChange,
  label,
}: {
  /** id của <select> — để Label cha (nếu có) liên kết đúng chỗ */
  id: string
  /** Số tiền cần thu, dùng tính tiền trả lại / còn thiếu */
  amount: number
  method: PaymentMethod
  onMethodChange: (method: PaymentMethod) => void
  /** Bỏ trống khi đã có nhãn bên ngoài (LedgerGroup trên POS) */
  label?: string
}) {
  const [cashReceived, setCashReceived] = useState('')
  const cashReceivedRef = useRef<HTMLInputElement>(null)

  const cashReceivedAmount = cashInputToNumber(cashReceived)
  const hasCashReceived = cashReceived.trim() !== '' && Number.isFinite(cashReceivedAmount)
  const changeAmount = cashReceivedAmount - amount

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Select
        id={id}
        value={method}
        onChange={(event) => {
          const nextMethod = event.target.value as PaymentMethod
          if (nextMethod !== 'CASH') setCashReceived('')
          onMethodChange(nextMethod)
        }}
      >
        {METHODS.map((value) => (
          <option key={value} value={value}>
            {paymentMethodLabel(value)}
          </option>
        ))}
      </Select>

      {method === 'TRANSFER' && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium text-text-secondary">
            Quét mã QR để chuyển khoản
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/transfer2.jpeg"
            alt="Mã QR chuyển khoản"
            loading="lazy"
            className="mx-auto w-56 max-w-full"
          />
        </div>
      )}

      {method === 'CASH' && (
        <div className="mt-4 grid gap-3 border-t border-border-default pt-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${id}-cash`}>Tiền khách đưa</Label>
            <Input
              id={`${id}-cash`}
              type="text"
              inputMode="numeric"
              placeholder="Ví dụ: 100"
              value={cashReceived}
              onChange={(event) => {
                const next = normalizeCashInput(
                  event.target.value,
                  event.target.selectionStart ?? event.target.value.length,
                )
                setCashReceived(next.value)
                requestAnimationFrame(() =>
                  cashReceivedRef.current?.setSelectionRange(next.caret, next.caret),
                )
              }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {getCashInputSuggestions(cashReceived).map((suggestion) => (
                <button
                  key={suggestion.value}
                  type="button"
                  onClick={() => setCashReceived(formatCashInput(suggestion.value))}
                  className="rounded-lg border border-border-default px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-tertiary"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
          {/* ≤sm: nhãn trái / số phải (một hàng). ≥sm: khối hai dòng canh phải để
              nhãn không rời khỏi số khi cột rộng ra, và số vẫn về đúng rail tiền. */}
          <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-0.5">
            <span className="text-sm text-text-secondary">
              {hasCashReceived && changeAmount >= 0 ? 'Tiền trả lại' : 'Còn thiếu'}
            </span>
            <span className="text-right text-lg font-bold tabular-nums text-text-primary">
              {hasCashReceived ? money(Math.abs(changeAmount), false) : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
