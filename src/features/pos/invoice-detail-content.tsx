'use client'

import {
  Car,
  Clock,
  Minus,
  Plus,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Timer,
  Trash2,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label, Select, Textarea } from '@/components/ui/input'
import { formatVND } from '@/lib/shared/utils'
import { paymentMethodLabel } from './format'
import { useInvoiceEditLogic, type InvoiceEditorLine } from './invoice-edit-logic'
import type { Product } from './types'

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
    customerName?: string | null
    customerPhone?: string | null
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
export function InvoiceDetailContent({
  invoice,
  editOpen,
  editing,
  setEditing,
  onCloseEdit,
  onSaved,
}: {
  invoice: InvoiceDetail
  editOpen?: boolean
  editing?: boolean
  setEditing?: (value: boolean) => void
  onCloseEdit?: () => void
  onSaved?: () => void
}) {
  const isCancelled = invoice.status === 'CANCELED' || invoice.status === 'CANCELLED'

  const parkingFeeTotal = invoice.items
    .filter((item) => item.type === 'SURCHARGE')
    .reduce((sum, item) => sum + Math.abs(item.total), 0)

  const playItem = invoice.items.find((item) => item.type === 'PLAY_TIME')
  const playMeta = (playItem?.metadata ?? {}) as {
    earlyCollection?: { sequence?: number }
  }
  const earlyCollectionSequence = playMeta.earlyCollection?.sequence

  const invoiceStatusVariant = statusVariant[invoice.status] ?? 'default'
  const invoiceStatusLabel = statusLabel[invoice.status] ?? invoice.status

  const noop = () => undefined
  const editor = useInvoiceEditLogic({
    invoice,
    active: Boolean(editOpen),
    setSubmitting: setEditing ?? noop,
    onSaved: onSaved ?? noop,
  })

  // Chuẩn hoá danh sách hàng của bảng: mỗi người chơi trong PLAY_TIME là 1 hàng
  // riêng (Tên (Bảng giá) | Số giờ | Thành tiền). Các loại khác giữ nguyên 1 hàng.
  const tableRows = flattenInvoiceItems(invoice.items).filter((row) => {
    if (!editOpen || row.kind !== 'item' || !isEditableItem(row.item)) return true
    return editor.lines.some((line) => line.productId === row.item.product?.id)
  })

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* ── Receipt body ───────────────────────────────────────────── */}
      <Card padding="none" className="overflow-hidden">
        {/* Cancelled banner — replaces the old rotated watermark */}
        {isCancelled && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
            Hoá đơn đã huỷ — tiền và tồn kho đã được hoàn trả
          </div>
        )}

        {/* Masthead */}
        <header className="border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
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

          {/* Dòng ngày thanh toán */}
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {invoice.paidAt
              ? `Thanh toán ${formatDateTime(invoice.paidAt)}`
              : `Lập ${formatDateTime(invoice.createdAt)}`}
          </p>

          {/* Metadata row: Khách hàng · Phiên chơi · Ca & nhân viên */}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
            <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <User size={12} />
              <span>Khách hàng: </span>
              {invoice.customer ? (
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  {invoice.customer.fullName}
                  {invoice.customer.phone && (
                    <>
                      {' · '}
                      <a
                        href={`tel:${invoice.customer.phone}`}
                        className="font-normal text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                      >
                        {invoice.customer.phone}
                      </a>
                    </>
                  )}
                </span>
              ) : invoice.session?.customerName ? (
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  {invoice.session.customerName}
                  {invoice.session.customerPhone && (
                    <>
                      {' · '}
                      <a
                        href={`tel:${invoice.session.customerPhone}`}
                        className="font-normal text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                      >
                        {invoice.session.customerPhone}
                      </a>
                    </>
                  )}
                </span>
              ) : (
                <span className="text-zinc-400 dark:text-zinc-500">—</span>
              )}
            </div>

            {invoice.session && (
              <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <Clock size={12} />
                <span>Phiên: </span>
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  {formatTime(invoice.session.startTime)}
                  <span className="mx-1 font-normal text-zinc-400 dark:text-zinc-500">—</span>
                  {invoice.session.endTime ? formatTime(invoice.session.endTime) : 'đang chơi'}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <Users size={12} />
              <span>Nhân viên: </span>
              <span className="font-medium text-zinc-700 dark:text-zinc-200">{invoice.staff.fullName}</span>
            </div>
          </div>
        </header>

        {editOpen && setEditing && onCloseEdit && (
          <div className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-3 sm:px-6 dark:border-blue-500/30 dark:bg-blue-500/10">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Đang sửa hoá đơn</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onCloseEdit} disabled={editing}>
                Huỷ
              </Button>
              <Button variant="inverse" size="sm" onClick={editor.handleSave} disabled={editing}>
                {editing ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </div>
          </div>
        )}

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
                    <ItemRow
                      key={row.key}
                      row={row}
                      editing={Boolean(editOpen)}
                      lines={editor.lines}
                      onDecrease={editor.updateQuantity}
                      onIncrease={editor.updateQuantity}
                      onRemove={editor.removeLine}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editOpen && (
            <InlineProductEditor
              lines={editor.lines.filter((line) => !invoice.items.some((item) => item.product?.id === line.productId))}
              products={editor.availableProducts}
              loading={editor.productsLoading}
              onAdd={editor.addProduct}
              onDecrease={editor.updateQuantity}
              onIncrease={editor.updateQuantity}
              onRemove={editor.removeLine}
            />
          )}
        </section>

        {/* Totals */}
        <TotalsBlock
          discountTotal={invoice.discountTotal}
          parkingFeeTotal={parkingFeeTotal}
          grandTotal={editOpen ? editor.grandTotal : invoice.grandTotal}
          isCancelled={isCancelled}
        />

        {/* Payment history */}
        {(invoice.payments.length > 0 || invoice.membershipPayments.length > 0 || editOpen) && (
          <PaymentTimeline
            payments={invoice.payments}
            membershipPayments={invoice.membershipPayments}
            editing={Boolean(editOpen)}
            paymentMethod={editor.paymentMethod}
            onPaymentMethodChange={(value) => editor.setPaymentMethod(value as typeof editor.paymentMethod)}
            allowMember={invoice.customer?.type === 'MEMBER'}
          />
        )}

        {/* Notes */}
        {(invoice.notes || editOpen) && (
          <section className="border-t border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Ghi chú
            </h2>
            {editOpen ? (
              <Textarea
                className="mt-2"
                value={editor.notes}
                onChange={(event) => editor.setNotes(event.target.value)}
                maxLength={500}
                placeholder="Ghi chú cho hoá đơn"
              />
            ) : (
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{invoice.notes}</p>
            )}
          </section>
        )}
      </Card>
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

function isEditableItem(item: InvoiceItem) {
  return Boolean(item.product) && (item.type === 'PRODUCT' || item.type === 'SERVICE')
}

function ItemRow({
  row,
  editing,
  lines,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  row: TableRow
  editing: boolean
  lines: InvoiceEditorLine[]
  onDecrease: (productId: string, delta: number) => void
  onIncrease: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
}) {
  if (row.kind === 'player') {
    return <PlayerRow row={row} />
  }
  return (
    <ItemRowGeneric
      item={row.item}
      editing={editing}
      line={lines.find((candidate) => candidate.productId === row.item.product?.id)}
      onDecrease={onDecrease}
      onIncrease={onIncrease}
      onRemove={onRemove}
    />
  )
}

function ItemRowGeneric({
  item,
  editing,
  line,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  item: InvoiceItem
  editing: boolean
  line?: InvoiceEditorLine
  onDecrease: (productId: string, delta: number) => void
  onIncrease: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
}) {
  const Icon = itemTypeIcons[item.type] ?? ReceiptText
  const isNegative = item.total < 0
  const isDiscount = item.type === 'DISCOUNT' || item.type === 'SURCHARGE'
  const editable = editing && line && isEditableItem(item)
  const quantity = line?.quantity ?? item.quantity
  const total = line ? line.quantity * line.unitPrice : item.total

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
              {item.discountAmount > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  −{formatVND(item.discountAmount)}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Số lượng */}
      <td className="w-28 py-3 px-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
        {editable ? (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label="Giảm số lượng"
              onClick={() => onDecrease(line.productId, -1)}
              disabled={quantity <= 1}
              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              <Minus size={12} aria-hidden />
            </button>
            <span className="w-5 text-center tabular-nums">{quantity}</span>
            <button
              type="button"
              aria-label="Tăng số lượng"
              onClick={() => onIncrease(line.productId, 1)}
              disabled={line.type === 'PRODUCT' && quantity >= line.stockQuantity}
              className="flex h-7 w-7 items-center justify-center rounded bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
            >
              <Plus size={12} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Xoá mặt hàng"
              onClick={() => onRemove(line.productId)}
              className="ml-1 flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </div>
        ) : (
          quantity
        )}
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
        {formatVND(Math.abs(total))}
      </td>
    </tr>
  )
}

export function InlineProductEditor({
  lines,
  products,
  loading,
  onAdd,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  lines: InvoiceEditorLine[]
  products: Product[]
  loading: boolean
  onAdd: (product: Product) => void
  onDecrease: (productId: string, delta: number) => void
  onIncrease: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
}) {
  return (
    <div className="mt-5 space-y-3 border-t border-dashed border-zinc-200 pt-4 dark:border-zinc-800">
      <Label>Thêm hàng hoá / dịch vụ</Label>

      {lines.length > 0 && (
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.productId} className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-500/10">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-white">{line.name}</span>
              <button
                type="button"
                aria-label="Giảm số lượng"
                onClick={() => onDecrease(line.productId, -1)}
                disabled={line.quantity <= 1}
                className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <Minus size={12} aria-hidden />
              </button>
              <span className="w-5 text-center text-sm tabular-nums text-zinc-900 dark:text-white">{line.quantity}</span>
              <button
                type="button"
                aria-label="Tăng số lượng"
                onClick={() => onIncrease(line.productId, 1)}
                disabled={line.type === 'PRODUCT' && line.quantity >= line.stockQuantity}
                className="flex h-7 w-7 items-center justify-center rounded bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
              >
                <Plus size={12} aria-hidden />
              </button>
              <span className="w-24 text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">
                {formatVND(line.quantity * line.unitPrice)}
              </span>
              <button
                type="button"
                aria-label="Xoá mặt hàng"
                onClick={() => onRemove(line.productId)}
                className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                <Trash2 size={13} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Đang tải danh sách hàng hoá...</p>
      ) : products.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onAdd(product)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <span className="block font-medium text-zinc-900 dark:text-white">{product.name}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatVND(product.price)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Không còn hàng hoá hoặc dịch vụ để thêm.</p>
      )}
    </div>
  )
}

function PlayerRow({ row }: { row: Extract<TableRow, { kind: 'player' }> }) {
  const { player } = row
  const total = player.total ?? 0
  const isNegative = total < 0
  const discount = player.discountAmount ?? 0
  const name = (player.name ?? '').trim()
  const ruleName = player.pricingRuleName ?? ''

  return (
    <tr className="align-top">
      {/* Nội dung: Giờ chơi: [Tên] (Bảng giá) */}
      <td className="py-3 pr-3">
        <div className="flex items-start gap-2">
          <Timer
            size={16}
            className="mt-0.5 shrink-0 text-zinc-400 dark:text-zinc-500"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
              <span className="text-zinc-500 dark:text-zinc-400">Giờ chơi:</span>
              {name ? ` ${name}` : ''}
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
  editing,
  paymentMethod,
  onPaymentMethodChange,
  allowMember,
}: {
  payments: InvoicePayment[]
  membershipPayments: InvoiceMembershipPayment[]
  editing: boolean
  paymentMethod: string
  onPaymentMethodChange: (value: string) => void
  allowMember: boolean
}) {
  return (
    <section className="px-4 py-5 sm:px-6 sm:py-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Phương thức thanh toán{' '}
        <span className="ml-1 text-zinc-400 dark:text-zinc-500">
          {payments.length + membershipPayments.length} khoản
        </span>
      </h2>

      {editing ? (
        <div className="mt-3">
          <Label htmlFor="invoice-payment-method">Phương thức thanh toán</Label>
          <Select
            id="invoice-payment-method"
            value={paymentMethod}
            onChange={(event) => onPaymentMethodChange(event.target.value)}
          >
            <option value="CASH">{paymentMethodLabel('CASH')}</option>
            <option value="TRANSFER">{paymentMethodLabel('TRANSFER')}</option>
            <option value="CARD">{paymentMethodLabel('CARD')}</option>
            {allowMember && <option value="MEMBER">{paymentMethodLabel('MEMBER')}</option>}
          </Select>
        </div>
      ) : (
      <ul className="mt-4 space-y-3">
        {payments.map((p) => (
          <TimelinePayment
            key={p.id}
            label={paymentMethodLabel(p.paymentMethod)}
          />
        ))}
        {membershipPayments.map((mp) => (
          <TimelinePayment
            key={mp.id}
            label={paymentMethodLabel('MEMBER')}
          />
        ))}
      </ul>
      )}
    </section>
  )
}

function TimelinePayment({
  label,
}: {
  label: string
}) {
  return (
    <li>
      <p className="text-sm font-medium text-zinc-900 dark:text-white">{label}</p>
    </li>
  )
}

function formatHours(hours: number): string {
  return (Math.round(hours * 10) / 10).toString()
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
