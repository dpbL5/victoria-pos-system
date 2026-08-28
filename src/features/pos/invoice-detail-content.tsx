'use client'

import {
  Banknote,
  Car,
  Clock,
  CreditCard,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Timer,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatVND } from '@/lib/shared/utils'
import { formatPausedHMS } from './format'

// ─── Types ──────────────────────────────────────────────────────────────────
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
    totalPausedSeconds?: number | null
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

// ─── Item-type vocab ────────────────────────────────────────────────────────
const itemTypeLabels: Record<string, string> = {
  PLAY_TIME: 'Giờ chơi',
  MEMBERSHIP_FEE: 'Phí hội viên',
  PRODUCT: 'Hàng hoá',
  SERVICE: 'Dịch vụ',
  DISCOUNT: 'Giảm giá',
  SURCHARGE: 'Giảm phí gửi xe',
}
const itemTypeIcons: Record<string, LucideIcon> = {
  PLAY_TIME: Timer,
  MEMBERSHIP_FEE: ShieldCheck,
  PRODUCT: ShoppingBag,
  SERVICE: ScrollText,
  DISCOUNT: Tag,
  SURCHARGE: Car,
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  PAID: 'success',
  ACTIVE: 'warning',
  COMPLETED: 'success',
  CANCELED: 'danger',
  CANCELLED: 'danger',
  DRAFT: 'default',
}

const statusLabel: Record<string, string> = {
  PAID: 'Đã thanh toán',
  ACTIVE: 'Đang chơi',
  COMPLETED: 'Hoàn tất',
  CANCELED: 'Đã huỷ',
  CANCELLED: 'Đã huỷ',
  DRAFT: 'Bản nháp',
}

// ─── Entry ──────────────────────────────────────────────────────────────────
export function InvoiceDetailContent({ invoice }: { invoice: InvoiceDetail }) {
  const isCancelled = invoice.status === 'CANCELED' || invoice.status === 'CANCELLED'

  const parkingFeeTotal = invoice.items
    .filter((item) => item.type === 'SURCHARGE')
    .reduce((sum, item) => sum + Math.abs(item.total), 0)

  const playItem = invoice.items.find((item) => item.type === 'PLAY_TIME')
  const playMeta = (playItem?.metadata ?? {}) as {
    earlyCollection?: { sequence?: number }
    pausedSeconds?: number
    playerPauses?: Array<{ id: string; name: string; pausedSeconds: number }>
  }
  const earlyCollectionSequence = playMeta.earlyCollection?.sequence
  const pausedSeconds = playMeta.pausedSeconds ?? invoice.session?.totalPausedSeconds ?? 0
  const playerPauses = playMeta.playerPauses ?? []

  const invoiceStatusVariant = statusVariant[invoice.status] ?? 'default'
  const invoiceStatusLabel = statusLabel[invoice.status] ?? invoice.status

  // Chuẩn hoá danh sách hàng của bảng: mỗi người chơi trong PLAY_TIME là 1 hàng
  // riêng (Tên (Bảng giá) | Số giờ | Thành tiền). Các loại khác giữ nguyên 1 hàng.
  const tableRows = flattenInvoiceItems(invoice.items)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ── Receipt body ───────────────────────────────────────────── */}
      <Card padding="none" className="overflow-hidden">
        {/* Cancelled banner — replaces the old rotated watermark */}
        {isCancelled && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
            Hoá đơn đã huỷ — tiền và tồn kho đã được hoàn trả
          </div>
        )}

        {/* Masthead */}
        <header className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-5 sm:px-6 sm:py-6 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Mã hoá đơn: <span className="font-semibold text-zinc-900 dark:text-white">{invoice.invoiceNo}</span>
            </h1>
            <Badge variant={invoiceStatusVariant} size="sm">
              {invoiceStatusLabel}
            </Badge>
            {earlyCollectionSequence !== undefined && (
              <div className="inline-flex items-center gap-1.5 border-l-2 border-amber-500 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <Timer size={12} aria-hidden />
                Thu trước — lần {earlyCollectionSequence}
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {invoice.paidAt
              ? `Thanh toán ${formatDateTime(invoice.paidAt)}`
              : `Lập ${formatDateTime(invoice.createdAt)}`}
          </p>
        </header>

        {/* Itemized lines — table */}
        <section className="px-4 py-5 sm:px-6 sm:py-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Chi tiết dịch vụ
          </h2>

          {invoice.items.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              Chưa có mục nào được ghi nhận.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th scope="col" className="py-2 pr-3 font-medium">Nội dung</th>
                    <th scope="col" className="w-20 py-2 px-3 text-right font-medium">Số lượng</th>
                    <th scope="col" className="w-32 py-2 pl-3 text-right font-medium">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {tableRows.map((row) => (
                    <ItemRow key={row.key} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Totals */}
        <TotalsBlock
          discountTotal={invoice.discountTotal}
          parkingFeeTotal={parkingFeeTotal}
          grandTotal={invoice.grandTotal}
          isCancelled={isCancelled}
        />

        {/* Payment history */}
        {(invoice.payments.length > 0 || invoice.membershipPayments.length > 0) && (
          <PaymentTimeline
            payments={invoice.payments}
            membershipPayments={invoice.membershipPayments}
          />
        )}

        {/* Notes */}
        {invoice.notes && (
          <section className="border-t border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Ghi chú
            </h2>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{invoice.notes}</p>
          </section>
        )}
      </Card>

      {/* ── Metadata spine ─────────────────────────────────────────── */}
      <aside className="space-y-4">
        <SpineCard icon={User} label="Khách hàng">
          {invoice.customer ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                {invoice.customer.fullName}
              </p>
              {invoice.customer.phone && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{invoice.customer.phone}</p>
              )}
              <div className="pt-1">
                <Badge
                  variant={invoice.customer.type === 'MEMBER' ? 'purple' : 'default'}
                  size="sm"
                >
                  {invoice.customer.type === 'MEMBER' ? 'Hội viên' : 'Vãng lai'}
                </Badge>
              </div>
              {invoice.customer.id === null && (
                <p className="pt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  Khách vãng lai — không lưu hồ sơ
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">—</p>
          )}
        </SpineCard>

        <SpineCard icon={Clock} label="Phiên chơi">
          {invoice.session ? (
            <div className="space-y-2">
              <p className="text-sm text-zinc-900 dark:text-white">
                {formatTime(invoice.session.startTime)}
                <span className="mx-1 text-zinc-300 dark:text-zinc-600">—</span>
                {invoice.session.endTime ? formatTime(invoice.session.endTime) : 'đang chơi'}
              </p>
              <Badge
                variant={statusVariant[invoice.session.status] ?? 'default'}
                size="sm"
              >
                {statusLabel[invoice.session.status] ?? invoice.session.status}
              </Badge>
              {pausedSeconds > 0 && (
                <div className="space-y-1 border-t border-zinc-100 pt-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                  <p className="flex items-center justify-between gap-2">
                    <span>Nghỉ</span>
                    <span className="text-zinc-900 dark:text-white">
                      {formatPausedHMS(pausedSeconds)}
                    </span>
                  </p>
                  {playerPauses.length > 0 && (
                    <ul className="space-y-0.5 pl-3">
                      {playerPauses.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate">
                            {p.name?.trim() || 'Người chơi'}
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {formatPausedHMS(p.pausedSeconds)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">—</p>
          )}
        </SpineCard>

        <SpineCard icon={Users} label="Ca & nhân viên">
          <div className="space-y-1">
            <p className="text-sm text-zinc-900 dark:text-white">{invoice.staff.fullName}</p>
            {invoice.shift && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Ca mở {formatTime(invoice.shift.openedAt)}
                {invoice.shift.closedAt
                  ? ` · đóng ${formatTime(invoice.shift.closedAt)}`
                  : ' · đang mở'}
              </p>
            )}
          </div>
        </SpineCard>
      </aside>
    </div>
  )
}

// ─── Itemized row (table) ───────────────────────────────────────────────────
type PlayerPricing = {
  id?: string
  name?: string
  totalHours?: number
  subtotal?: number
  discountAmount?: number
  total?: number
  pricingRuleName?: string
}

type TableRow =
  | {
      key: string
      kind: 'item'
      item: InvoiceItem
    }
  | {
      key: string
      kind: 'player'
      player: PlayerPricing
      itemType: string
      isMultiPlayer: boolean
    }

function flattenInvoiceItems(items: InvoiceItem[]): TableRow[] {
  const rows: TableRow[] = []
  for (const item of items) {
    // Phí gửi xe đã gom vào dòng tổng kết bên dưới — không hiển thị trong bảng.
    if (item.type === 'SURCHARGE') continue
    if (item.type === 'PLAY_TIME') {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>
      const playerPricing = Array.isArray(metadata.playerPricing)
        ? (metadata.playerPricing as PlayerPricing[])
        : null
      if (playerPricing && playerPricing.length > 0) {
        const isMultiPlayer = playerPricing.length > 1
        for (let i = 0; i < playerPricing.length; i++) {
          const p = playerPricing[i]
          rows.push({
            key: `${item.id}-p${i}`,
            kind: 'player',
            player: p,
            itemType: item.type,
            isMultiPlayer,
          })
        }
        continue
      }
    }
    rows.push({ key: item.id, kind: 'item', item })
  }
  return rows
}

function ItemRow({ row }: { row: TableRow }) {
  if (row.kind === 'player') {
    return <PlayerRow row={row} />
  }
  return <ItemRowGeneric item={row.item} />
}

function ItemRowGeneric({ item }: { item: InvoiceItem }) {
  const Icon = itemTypeIcons[item.type] ?? ReceiptText
  const isNegative = item.total < 0
  const isDiscount = item.type === 'DISCOUNT' || item.type === 'SURCHARGE'
  const promotionName = getPromotionName(item.metadata)

  return (
    <tr className="align-top">
      {/* Nội dung */}
      <td className="py-3 pr-3">
        <div className="flex items-start gap-2">
          <Icon
            size={16}
            className={[
              'mt-0.5 shrink-0',
              isNegative ? 'text-red-500' : 'text-zinc-400 dark:text-zinc-500',
            ].join(' ')}
            aria-hidden
          />
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
              {item.description}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {itemTypeLabels[item.type] ?? item.type}
              </span>
              {item.type !== 'PLAY_TIME' && (
                <span>
                  {item.quantity} × {formatVND(item.unitPrice)}
                </span>
              )}
              {item.discountAmount > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  −{formatVND(item.discountAmount)}
                </span>
              )}
              {promotionName && (
                <span className="truncate text-xs italic text-zinc-500 dark:text-zinc-400">
                  KM: {promotionName}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Số lượng */}
      <td className="w-20 py-3 px-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
        {item.quantity}
      </td>

      {/* Thành tiền */}
      <td
        className={[
          'w-32 py-3 pl-3 text-right text-sm font-semibold whitespace-nowrap',
          isNegative || isDiscount
            ? 'text-red-600 dark:text-red-400'
            : 'text-zinc-900 dark:text-white',
        ].join(' ')}
      >
        {isNegative ? '−' : ''}
        {formatVND(Math.abs(item.total))}
      </td>
    </tr>
  )
}

function PlayerRow({ row }: { row: Extract<TableRow, { kind: 'player' }> }) {
  const { player, isMultiPlayer } = row
  const total = player.total ?? 0
  const isNegative = total < 0
  const discount = player.discountAmount ?? 0
  const name = (player.name ?? '').trim()
  const ruleName = player.pricingRuleName ?? ''

  return (
    <tr className="align-top">
      {/* Nội dung: [Tên] (Bảng giá) */}
      <td className="py-3 pr-3">
        <div className="flex items-start gap-2">
          <Timer
            size={16}
            className="mt-0.5 shrink-0 text-zinc-400 dark:text-zinc-500"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
              {isMultiPlayer && name ? `${name} ` : ''}
              {ruleName && (
                <span className="text-zinc-600 dark:text-zinc-400">({ruleName})</span>
              )}
            </p>
            {discount > 0 && (
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                −{formatVND(discount)}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Số lượng: số giờ chơi */}
      <td className="w-20 py-3 px-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
        {formatHours(player.totalHours ?? 0)}h
      </td>

      {/* Thành tiền */}
      <td
        className={[
          'w-32 py-3 pl-3 text-right text-sm font-semibold whitespace-nowrap',
          isNegative ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-white',
        ].join(' ')}
      >
        {isNegative ? '−' : ''}
        {formatVND(Math.abs(total))}
      </td>
    </tr>
  )
}

// ─── Totals block ───────────────────────────────────────────────────────────
function TotalsBlock({
  discountTotal,
  parkingFeeTotal,
  grandTotal,
  isCancelled,
}: {
  discountTotal: number
  parkingFeeTotal: number
  grandTotal: number
  isCancelled: boolean
}) {
  return (
    <section className="border-y border-zinc-200 bg-zinc-50 px-4 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-900/50">
      <dl className="space-y-1.5 text-sm">
        {discountTotal > 0 && (
          <SummaryRow
            label="Giảm giá"
            value={`− ${formatVND(discountTotal)}`}
            tone="deduction"
          />
        )}
        {parkingFeeTotal > 0 && (
          <SummaryRow
            label="Giảm phí gửi xe"
            value={`− ${formatVND(parkingFeeTotal)}`}
            tone="deduction"
          />
        )}
      </dl>

      <div className="mt-3 flex items-baseline justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          Tổng cộng
        </span>
        <span
          className={[
            'text-2xl font-bold tracking-tight sm:text-3xl',
            isCancelled
              ? 'text-zinc-400 line-through dark:text-zinc-500'
              : 'text-zinc-900 dark:text-white',
          ].join(' ')}
        >
          {formatVND(grandTotal)}
        </span>
      </div>
    </section>
  )
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'deduction'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={[
          'text-xs uppercase tracking-wide',
          tone === 'deduction' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400',
        ].join(' ')}
      >
        {label}
      </dt>
      <dd
        className={[
          'text-sm font-medium',
          tone === 'deduction' ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-white',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}

// ─── Payment timeline ───────────────────────────────────────────────────────
function PaymentTimeline({
  payments,
  membershipPayments,
}: {
  payments: InvoicePayment[]
  membershipPayments: InvoiceMembershipPayment[]
}) {
  return (
    <section className="px-4 py-5 sm:px-6 sm:py-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Phương thức thanh toán{' '}
        <span className="ml-1 text-zinc-400 dark:text-zinc-500">
          {payments.length + membershipPayments.length} khoản
        </span>
      </h2>

      <ul className="mt-4 space-y-3">
        {payments.map((p) => (
          <TimelinePayment
            key={p.id}
            method={p.paymentMethod}
            label={paymentMethodLabel(p.paymentMethod)}
            amount={p.grandTotal}
            at={p.paidAt}
            staffName={p.staff.fullName}
            notes={p.notes}
          />
        ))}
        {membershipPayments.map((mp) => (
          <TimelinePayment
            key={mp.id}
            method="MEMBER"
            label={mp.planName ?? 'Phí hội viên'}
            amount={mp.amount}
            at={mp.paidAt}
            staffName={null}
            notes={null}
            memberOnly
          />
        ))}
      </ul>
    </section>
  )
}

function TimelinePayment({
  method,
  label,
  amount,
  at,
  staffName,
  notes,
  memberOnly,
}: {
  method: string
  label: string
  amount: number
  at: string
  staffName: string | null
  notes: string | null
  memberOnly?: boolean
}) {
  const MethodIcon = method === 'CASH' ? Banknote : method === 'MEMBER' ? ShieldCheck : CreditCard
  return (
    <li className="flex items-start gap-3">
      <div
        className={[
          'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
          memberOnly
            ? 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300'
            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
        ].join(' ')}
      >
        <MethodIcon size={16} aria-hidden />
      </div>

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-white">
          <span>{label}</span>
          {memberOnly && (
            <Badge variant="purple" size="sm">
              Hội viên
            </Badge>
          )}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatDateTime(at)}
          {staffName && (
            <>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
              {staffName}
            </>
          )}
        </p>
        {notes && (
          <p className="text-xs italic text-zinc-500 dark:text-zinc-400">“{notes}”</p>
        )}
      </div>

      <p
        className={[
          'whitespace-nowrap text-sm font-semibold',
          memberOnly
            ? 'text-purple-600 dark:text-purple-300'
            : 'text-zinc-900 dark:text-white',
        ].join(' ')}
      >
        {formatVND(amount)}
      </p>
    </li>
  )
}

// ─── Metadata card (right column) ───────────────────────────────────────────
function SpineCard({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
}) {
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <Icon size={14} aria-hidden />
        <span>{label}</span>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────
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

function formatHours(hours: number): string {
  return (Math.round(hours * 10) / 10).toString()
}

function paymentMethodLabel(method: string): string {
  if (method === 'CASH') return 'Tiền mặt'
  if (method === 'TRANSFER') return 'Chuyển khoản'
  if (method === 'CARD') return 'Thẻ'
  if (method === 'MEMBER') return 'Phí hội viên'
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
