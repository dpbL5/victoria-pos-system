'use client'

import {
  Banknote,
  Car,
  Clock,
  CreditCard,
  ReceiptText,
  User,
  Users,
  ShoppingBag,
  Timer,
  ShieldCheck,
  Tag,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatVND } from '@/lib/shared/utils'

interface InvoiceItem {
  id: string
  type: string
  description: string
  quantity: number
  unitPrice: number
  subtotal: number
  discountAmount: number
  total: number
  product: { id: string; name: string; sku: string | null; type: string } | null
  metadata: unknown
}

interface InvoicePayment {
  id: string
  paymentMethod: string
  grandTotal: number
  paidAt: string
  notes: string | null
  staff: { id: string; fullName: string }
}

interface InvoiceMembershipPayment {
  id: string
  amount: number
  paidAt: string
  planName: string | null
}

export interface InvoiceDetail {
  id: string
  invoiceNo: string
  status: string
  subtotal: number
  discountTotal: number
  grandTotal: number
  paidAt: string | null
  notes: string | null
  createdAt: string
  customer: {
    id: string | null
    fullName: string
    phone: string | null
    type: string
  } | null
  session: {
    id: string
    startTime: string
    endTime: string | null
    status: string
  } | null
  shift: {
    id: string
    openedAt: string
    closedAt: string | null
  } | null
  staff: { id: string; fullName: string }
  items: InvoiceItem[]
  payments: InvoicePayment[]
  membershipPayments: InvoiceMembershipPayment[]
}

const itemTypeLabels: Record<string, string> = {
  PLAY_TIME: 'Giờ chơi',
  MEMBERSHIP_FEE: 'Phí hội viên',
  PRODUCT: 'Hàng hoá',
  SERVICE: 'Dịch vụ',
  DISCOUNT: 'Giảm giá',
  SURCHARGE: 'Phí gửi xe',
}

const itemTypeIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  PLAY_TIME: Timer,
  MEMBERSHIP_FEE: ShieldCheck,
  PRODUCT: ShoppingBag,
  SERVICE: ShoppingBag,
  DISCOUNT: Tag,
  SURCHARGE: Car,
}

interface InvoiceDetailContentProps {
  invoice: InvoiceDetail
}

export function InvoiceDetailContent({ invoice }: InvoiceDetailContentProps) {
  const hasDiscount = invoice.discountTotal > 0
  const hasMembership = invoice.membershipPayments.length > 0
  const parkingFeeTotal = invoice.items
    .filter((item) => item.type === 'SURCHARGE')
    .reduce((sum, item) => sum + Math.abs(item.total), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-950 dark:text-white">
              <ReceiptText size={22} className="text-blue-500" />
              {invoice.invoiceNo}
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {formatDateTime(invoice.createdAt)}
            </p>
          </div>
          <Badge variant={invoice.status === 'PAID' ? 'success' : invoice.status === 'CANCELLED' ? 'danger' : 'default'}>
            {invoice.status === 'PAID' ? 'Đã thanh toán' : invoice.status === 'CANCELLED' ? 'Đã huỷ' : 'Nháp'}
          </Badge>
        </div>

        {invoice.notes && (
          <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {invoice.notes}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {invoice.customer && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
              <User size={16} className="text-blue-500" />
              Khách hàng
            </h2>
            <div className="mt-3 space-y-1.5">
              <p className="text-sm font-medium text-zinc-950 dark:text-white">
                {invoice.customer.fullName}
              </p>
              {invoice.customer.phone && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {invoice.customer.phone}
                </p>
              )}
              <Badge variant={invoice.customer.type === 'MEMBER' ? 'purple' : 'default'} size="sm">
                {invoice.customer.type === 'MEMBER' ? 'Hội viên' : 'Vãng lai'}
              </Badge>
              {invoice.customer.id === null && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Khách vãng lai — không lưu hồ sơ
                </p>
              )}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
            <Users size={16} className="text-blue-500" />
            Nhân viên & Ca
          </h2>
          <div className="mt-3 space-y-1.5">
            <p className="text-sm text-zinc-950 dark:text-white">
              {invoice.staff.fullName}
            </p>
            {invoice.shift && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Ca mở {formatTime(invoice.shift.openedAt)}
                {invoice.shift.closedAt ? ` → đóng ${formatTime(invoice.shift.closedAt)}` : ''}
              </p>
            )}
          </div>
        </section>
      </div>

      {invoice.session && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
            <Clock size={16} className="text-amber-500" />
            Phiên chơi
          </h2>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-zinc-950 dark:text-white">
              {formatTime(invoice.session.startTime)}
            </span>
            <span className="text-zinc-400">→</span>
            <span className="text-zinc-950 dark:text-white">
              {invoice.session.endTime ? formatTime(invoice.session.endTime) : 'Đang chơi'}
            </span>
            <Badge
              variant={invoice.session.status === 'COMPLETED' ? 'success' : invoice.session.status === 'ACTIVE' ? 'warning' : 'danger'}
              size="sm"
            >
              {invoice.session.status === 'COMPLETED' ? 'Đã xong' : invoice.session.status === 'ACTIVE' ? 'Đang chơi' : 'Đã huỷ'}
            </Badge>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
            Chi tiết hoá đơn
          </h2>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {invoice.items.length === 0 ? (
            <div className="px-4 py-6">
              <EmptyState icon={ReceiptText} message="Không có mục nào" />
            </div>
          ) : (
            invoice.items.map((item) => {
              const Icon = itemTypeIcons[item.type] ?? ReceiptText
              const promotionName = getPromotionName(item.metadata)
              return (
                <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Icon size={14} className="shrink-0 text-zinc-400" />
                      <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                        {item.description}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <Badge size="sm" variant="outline">
                        {itemTypeLabels[item.type] ?? item.type}
                      </Badge>
                      <span>
                        {item.quantity} × {formatVND(item.unitPrice)}
                      </span>
                      {item.discountAmount > 0 && (
                        <span className="text-red-500">
                          -{formatVND(item.discountAmount)}
                        </span>
                      )}
                      {promotionName && (
                        <span className="truncate text-emerald-600 dark:text-emerald-300">
                          Khuyến mại: {promotionName}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={`self-center text-sm font-bold tabular-nums ${
                    item.total < 0
                      ? 'text-red-600 dark:text-red-300'
                      : 'text-zinc-950 dark:text-white'
                  }`}>
                    {formatVND(item.total)}
                  </p>
                </div>
              )
            })
          )}
        </div>

        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Tạm tính</span>
              <span className="font-medium tabular-nums text-zinc-950 dark:text-white">
                {formatVND(invoice.subtotal)}
              </span>
            </div>
            {hasDiscount && (
              <div className="flex justify-between text-sm">
                <span className="text-red-500">Giảm giá</span>
                <span className="font-medium tabular-nums text-red-500">
                  -{formatVND(invoice.discountTotal)}
                </span>
              </div>
            )}
            {parkingFeeTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-red-500">Phí gửi xe</span>
                <span className="font-medium tabular-nums text-red-500">
                  -{formatVND(parkingFeeTotal)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-bold dark:border-zinc-800">
              <span className="text-zinc-950 dark:text-white">Tổng cộng</span>
              <span className="tabular-nums text-blue-600 dark:text-blue-400">
                {formatVND(invoice.grandTotal)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {invoice.payments.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
              <Banknote size={16} className="text-emerald-500" />
              Thanh toán
            </h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {invoice.payments.map((payment) => (
              <div key={payment.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {payment.paymentMethod === 'CASH' ? (
                        <Banknote size={15} className="text-emerald-500" />
                      ) : payment.paymentMethod === 'MEMBER' ? (
                        <Users size={15} className="text-purple-500" />
                      ) : (
                        <CreditCard size={15} className="text-blue-500" />
                      )}
                      <span className="text-sm font-medium text-zinc-950 dark:text-white">
                        {paymentMethodLabel(payment.paymentMethod)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateTime(payment.paidAt)} · {payment.staff.fullName}
                    </p>
                    {payment.notes && (
                      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                        {payment.notes}
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-300">
                    {formatVND(payment.grandTotal)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasMembership && (
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
              <ShieldCheck size={16} className="text-purple-500" />
              Phí hội viên
            </h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {invoice.membershipPayments.map((mp) => (
              <div key={mp.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-950 dark:text-white">
                    {mp.planName ?? 'Gói hội viên'}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDateTime(mp.paidAt)}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums text-purple-600 dark:text-purple-300">
                  {formatVND(mp.amount)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function getPromotionName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null

  const record = metadata as Record<string, unknown>
  const promotion = record.promotion
  if (promotion && typeof promotion === 'object' && !Array.isArray(promotion)) {
    const name = (promotion as Record<string, unknown>).name
    if (typeof name === 'string' && name.trim()) return name
  }

  return typeof record.promotionName === 'string' && record.promotionName.trim()
    ? record.promotionName
    : null
}

function paymentMethodLabel(method: string): string {
  if (method === 'CASH') return 'Tiền mặt'
  if (method === 'TRANSFER') return 'Chuyển khoản'
  if (method === 'CARD') return 'Thẻ'
  if (method === 'MEMBER') return 'Hội viên'
  return method
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
