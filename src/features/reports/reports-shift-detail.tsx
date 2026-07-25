'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Banknote,
  CreditCard,
  Download,
  Edit3,
  ReceiptText,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { NoticeCard } from '@/components/ui/notice-card'
import { formatClock, money } from '@/features/pos/format'
import { InvoiceDetailModal } from '@/features/pos/invoice-detail-modal'
import type { ShiftReportDetail, TransactionItem } from '@/types'

interface DetailResponse {
  success: boolean
  data?: ShiftReportDetail
  error?: string
}

interface ReportsShiftDetailProps {
  shiftId: string
  isAdmin: boolean
  onClose: () => void
  onUpdated?: () => void
}

export function ReportsShiftDetail({ shiftId, isAdmin, onClose, onUpdated }: ReportsShiftDetailProps) {
  const toast = useToast()
  const [detail, setDetail] = useState<ShiftReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editDiff, setEditDiff] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/reports/shifts/${shiftId}`)
      const data: DetailResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Không tải được chi tiết ca')
        return
      }

      setDetail(data.data ?? null)
    } catch {
      setError('Lỗi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }, [shiftId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const startEdit = () => {
    if (!detail) return
    setEditDiff(String(detail.cashDifference ?? 0))
    setEditNotes(detail.notes ?? '')
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditDiff('')
    setEditNotes('')
  }

  const saveEdit = async () => {
    const diff = Number(editDiff)
    if (isNaN(diff)) {
      toast.error('Chênh lệch không hợp lệ')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/reports/shifts/${shiftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashDifference: diff, notes: editNotes || undefined }),
      })
      const data = await res.json()

      if (!data.success) {
        toast.error(data.error || 'Không cập nhật được')
        return
      }

      toast.success('Đã cập nhật chênh lệch tiền mặt')
      setEditing(false)
      void loadDetail()
      onUpdated?.()
    } catch {
      toast.error('Lỗi kết nối máy chủ')
    } finally {
      setSaving(false)
    }
  }

  const exportUrl = detail ? `/api/reports/shifts/${shiftId}/export` : ''

  if (loading) {
    return (
      <Modal open onClose={onClose} title="Chi tiết ca" size="lg">
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Modal>
    )
  }

  if (error || !detail) {
    return (
      <Modal open onClose={onClose} title="Chi tiết ca">
        <NoticeCard
          tone="danger"
          title="Không tải được dữ liệu"
          description={error || 'Không tìm thấy ca'}
          action={<Button variant="secondary" size="sm" onClick={loadDetail}>Thử lại</Button>}
        />
      </Modal>
    )
  }

  const diff = detail.cashDifference
  const diffVariant = diff != null
    ? diff === 0
      ? ('success' as const)
      : diff < 0
        ? ('danger' as const)
        : ('warning' as const)
    : ('info' as const)

  const canEdit = isAdmin && detail.status === 'CLOSED'

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={`Ca ${detail.id.slice(0, 8)} · ${detail.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}`}
        description={`${detail.staff.fullName} · ${formatClock(detail.openedAt)}${detail.closedAt ? ` → ${formatClock(detail.closedAt)}` : ''} · ${detail.sessionCount} phiên`}
      >
        <div className="space-y-5">
          {/* Cash Reconciliation */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">
                Đối chiếu tiền mặt
              </h3>
              {canEdit && !editing && (
                <Button variant="ghost" size="xs" icon={Edit3} onClick={startEdit}>
                  Điều chỉnh
                </Button>
              )}
            </div>

            {detail.status === 'CLOSED' ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950">
                    <p className="text-[10px] text-zinc-400">Đầu ca</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{money(detail.openingCash)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950">
                    <p className="text-[10px] text-zinc-400">+Tiền mặt thu</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-600">{money(detail.cashRevenue)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950">
                    <p className="text-[10px] text-zinc-400">Dự kiến</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{money(detail.expectedCash ?? 0)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950">
                    <p className="text-[10px] text-zinc-400">Thực tế</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{money(detail.closingCash ?? 0)}</p>
                  </div>
                </div>

                {editing ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="edit-diff">Chênh lệch thực tế</Label>
                        <Input
                          id="edit-diff"
                          type="number"
                          value={editDiff}
                          onChange={(event) => setEditDiff(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-notes">Ghi chú (tuỳ chọn)</Label>
                        <Input
                          id="edit-notes"
                          value={editNotes}
                          onChange={(event) => setEditNotes(event.target.value)}
                          placeholder="Lý do điều chỉnh..."
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="xs" onClick={saveEdit} disabled={saving}>
                        {saving ? 'Đang lưu...' : 'Lưu'}
                      </Button>
                      <Button variant="secondary" size="xs" onClick={cancelEdit} disabled={saving}>
                        Huỷ
                      </Button>
                    </div>
                  </div>
                ) : (
                  diff != null ? (
                    <NoticeCard
                      tone={diffVariant}
                      title={
                        diff === 0
                          ? 'Tiền mặt khớp'
                          : diff < 0
                            ? `Thiếu ${money(Math.abs(diff))}`
                            : `Dư ${money(diff)}`
                      }
                      description={detail.notes ?? '—'}
                    />
                  ) : null
                )}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950">
                  <p className="text-[10px] text-zinc-400">Đầu ca</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{money(detail.openingCash)}</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950">
                  <p className="text-[10px] text-zinc-400">Tiền mặt thu</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-600">{money(detail.cashRevenue)}</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950">
                  <p className="text-[10px] text-zinc-400">Dự kiến</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{money((detail.openingCash) + detail.cashRevenue)}</p>
                </div>
              </div>
            )}
          </section>

          {/* Payment Methods */}
          {detail.byPaymentMethod && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Phương thức thanh toán</h3>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(['CASH', 'TRANSFER', 'CARD'] as const).map((method) => (
                  <div key={method} className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950">
                    <div className="flex items-center gap-1.5">
                      {method === 'CASH' ? <Banknote size={13} className="text-emerald-500" /> : <CreditCard size={13} className="text-blue-500" />}
                      <p className="text-[10px] text-zinc-400">
                        {method === 'CASH' ? 'Tiền mặt' : method === 'TRANSFER' ? 'CK' : 'Thẻ'}
                      </p>
                    </div>
                    <p className="mt-1 text-xs font-semibold tabular-nums">{money(detail.byPaymentMethod[method].total)}</p>
                    <p className="text-[10px] text-zinc-400">{detail.byPaymentMethod[method].count} GD</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Item Type Breakdown */}
          {detail.byItemType && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Nguồn doanh thu</h3>
              <div className="mt-3 space-y-2">
                {[
                  { key: 'PLAY_TIME', label: 'Giờ chơi', color: 'bg-blue-500' },
                  { key: 'MEMBERSHIP_FEE', label: 'Phí hội viên', color: 'bg-purple-500' },
                  { key: 'PRODUCT', label: 'Hàng hóa', color: 'bg-emerald-500' },
                  { key: 'SERVICE', label: 'Dịch vụ', color: 'bg-amber-500' },
                  { key: 'DISCOUNT', label: 'Giảm giá', color: 'bg-red-500' },
                ].map(({ key, label, color }) => {
                  const value = detail.byItemType[key as keyof typeof detail.byItemType] ?? 0
                  const max = Math.max(...Object.values(detail.byItemType), 1)
                  const pct = Math.round((value / max) * 100)
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">{label}</span>
                        <span className="font-semibold tabular-nums">{money(value)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Participants */}
          {detail.participants.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">
                Nhân viên trong ca ({detail.participants.length})
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.participants.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs dark:border-zinc-700"
                  >
                    {p.staff.fullName}
                    <Badge variant="outline" size="sm">{p.role === 'LEAD' ? 'Trưởng ca' : 'NV'}</Badge>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Tool Counts */}
          {detail.toolCounts && detail.toolCounts.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">
                Dụng cụ quầy
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {detail.toolCounts.map((tc) => (
                  <div key={tc.id} className="flex items-center justify-between rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-zinc-950 dark:text-white">
                          {tc.tool.name}
                        </p>
                        {tc.tool.isRequired && <span className="text-[10px] text-red-500">*</span>}
                      </div>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Chuẩn {tc.tool.quantity} · Mở: {tc.openCount}
                        {tc.closeCount != null ? ` · Đóng: ${tc.closeCount}` : ''}
                      </p>
                    </div>
                    {tc.closeCount != null && (
                      <Badge variant={tc.openCount === tc.closeCount ? 'success' : 'warning'} size="sm">
                        {tc.openCount === tc.closeCount ? 'Khớp' : `${tc.closeCount - tc.openCount > 0 ? '+' : ''}${tc.closeCount - tc.openCount}`}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Transaction List */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">
                Giao dịch ({detail.transactions.length})
              </h3>
              {isAdmin && detail.transactions.length > 0 && (
                <a
                  href={exportUrl}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                >
                  <Download size={13} />
                  CSV
                </a>
              )}
            </div>

            {detail.transactions.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={ReceiptText}
                  message="Chưa có giao dịch"
                  description="Giao dịch của ca này sẽ hiện ở đây."
                />
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <th className="px-4 py-2 font-medium">Thời gian</th>
                      <th className="px-4 py-2 font-medium">Khách</th>
                      <th className="px-4 py-2 font-medium">Loại</th>
                      <th className="px-4 py-2 font-medium hidden md:table-cell">PT</th>
                      <th className="px-4 py-2 text-right font-medium">Số tiền</th>
                      <th className="px-4 py-2 font-medium hidden sm:table-cell">NV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
                    {detail.transactions.map((tx) => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        onClick={() => {
                          if (tx.invoiceId) setSelectedInvoiceId(tx.invoiceId)
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </Modal>

      {selectedInvoiceId && (
        <InvoiceDetailModal
          invoiceId={selectedInvoiceId}
          open
          onClose={() => setSelectedInvoiceId(null)}
        />
      )}
    </>
  )
}

function TransactionRow({ tx, onClick }: { tx: TransactionItem; onClick: () => void }) {
  const methodLabel: Record<string, string> = {
    CASH: 'TM',
    TRANSFER: 'CK',
    CARD: 'Thẻ',
  }

  return (
    <tr
      className={`transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
        tx.invoiceId ? 'cursor-pointer' : ''
      }`}
      onClick={tx.invoiceId ? onClick : undefined}
    >
      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">
        {formatClock(tx.paidAt)}
      </td>
      <td className="px-4 py-2.5 max-w-[120px] truncate font-medium text-zinc-950 dark:text-white">
        {tx.customerName}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <Badge variant="outline" size="sm">
          {tx.type === 'payment' ? 'TT' : 'HV'}
        </Badge>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500 hidden md:table-cell">
        {tx.paymentMethod ? methodLabel[tx.paymentMethod] ?? tx.paymentMethod : '—'}
      </td>
      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-zinc-950 dark:text-white">
        {money(tx.amount)}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-400 hidden sm:table-cell">
        {tx.staffName}
      </td>
    </tr>
  )
}
