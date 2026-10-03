// ── Ba cột tiền của sổ đối soát ca ──────────────────────────────────────────
// Màn Ca làm chỉ dùng `VerdictMark` (cột kết luận); màn Giao dịch trong ca dùng
// cả `BalanceGrid` (hai vế DỰ KIẾN / THỰC ĐẾM + kết luận). Dùng chung một chỗ để
// dấu lệch và cách in tiền không lệch nhau giữa hai màn.

import { CheckCircle2, XCircle } from 'lucide-react'
import { money } from '@/features/pos/format'
import type { BalanceVerdict, ToolVerdict } from './shift-ledger'

export const BALANCE_LABEL_CLASS =
  'text-[10px] font-semibold uppercase tracking-wider text-text-secondary'

export function VerdictMark({
  verdict,
  difference,
  size = 'sm',
}: {
  verdict: BalanceVerdict
  difference: number | null
  size?: 'sm' | 'md'
}) {
  if (verdict === 'uncounted') {
    return <span className="text-xs font-medium text-text-secondary">Chưa đếm</span>
  }
  if (verdict === 'matched') {
    return (
      <span
        className={`flex items-center gap-1 font-medium text-success ${
          size === 'md' ? 'text-sm' : 'text-xs'
        }`}
      >
        <CheckCircle2 size={13} aria-hidden />
        Khớp
      </span>
    )
  }

  const short = verdict === 'short'
  return (
    <span
      className={`flex items-center gap-1 font-semibold tabular-nums ${
        short ? 'text-danger' : 'text-warning'
      } ${size === 'md' ? 'text-sm' : 'text-xs'}`}
    >
      <XCircle size={13} aria-hidden />
      {short ? '-' : '+'}
      {money(Math.abs(difference ?? 0))}
    </span>
  )
}

export function ToolMark({ verdict }: { verdict: ToolVerdict }) {
  if (verdict === 'uncounted') {
    return <span className="text-xs font-medium text-text-tertiary">Chưa nhập</span>
  }
  if (verdict === 'matched') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-success">
        <CheckCircle2 size={13} aria-hidden />
        Khớp
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-danger">
      <XCircle size={13} aria-hidden />
      Lệch
    </span>
  )
}

export function BalanceGrid({
  expected,
  counted,
  difference,
  verdict,
  emphasis = 'entry',
}: {
  expected: number | null
  counted: number | null
  difference: number | null
  verdict: BalanceVerdict
  emphasis?: 'day' | 'entry'
}) {
  const valueClass = `mt-0.5 flex h-5 items-center tabular-nums ${
    emphasis === 'day' ? 'text-sm font-bold' : 'text-sm font-semibold'
  }`

  return (
    <dl className="grid grid-cols-3 gap-x-3">
      <div className="min-w-0">
        <dt className={BALANCE_LABEL_CLASS}>Dự kiến</dt>
        <dd
          className={`${valueClass} ${expected == null ? 'text-text-tertiary' : 'text-text-primary'}`}
        >
          {expected == null ? '—' : money(expected)}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className={BALANCE_LABEL_CLASS}>Thực đếm</dt>
        <dd
          className={`${valueClass} ${counted == null ? 'text-text-tertiary' : 'text-text-primary'}`}
        >
          {counted == null ? '—' : money(counted)}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className={BALANCE_LABEL_CLASS}>Đối soát</dt>
        <dd className={valueClass}>
          <VerdictMark verdict={verdict} difference={difference} size="md" />
        </dd>
      </div>
    </dl>
  )
}
