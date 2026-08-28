'use client'

import {
  Banknote,
  Car,
  Check,
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
  X,
  type LucideIcon,
} from 'lucide-react'
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
  SURCHARGE: 'Phí gửi xe',
}
const itemTypeIcons: Record<string, LucideIcon> = {
  PLAY_TIME: Timer,
  MEMBERSHIP_FEE: ShieldCheck,
  PRODUCT: ShoppingBag,
  SERVICE: ScrollText,
  DISCOUNT: Tag,
  SURCHARGE: Car,
}

// ─── Entry ──────────────────────────────────────────────────────────────────
export function InvoiceDetailContent({ invoice }: { invoice: InvoiceDetail }) {
  const isPaid = invoice.status === 'PAID'
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

  return (
    <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ── Receipt folio ──────────────────────────────────────────── */}
      <article
        className={[
          'relative overflow-hidden rounded-[2px] border border-[var(--color-border-default)]',
          'bg-[color-mix(in_oklab,var(--color-surface-primary)_96%,var(--color-gold)_4%)]',
          'shadow-[0_1px_0_rgba(15,23,42,0.04),0_24px_60px_-32px_rgba(15,23,42,0.18)]',
          'dark:bg-[color-mix(in_oklab,var(--color-surface-primary)_94%,var(--color-gold)_6%)]',
          'dark:shadow-[0_1px_0_rgba(0,0,0,0.5),0_30px_80px_-32px_rgba(0,0,0,0.7)]',
        ].join(' ')}
      >
        {/* Perforated top edge — receipt feel */}
        <div
          aria-hidden
          className="h-1.5 w-full bg-[radial-gradient(circle_at_4px_0,var(--color-surface-secondary)_2px,transparent_2.5px)] bg-[length:8px_4px]"
        />

        {/* VOIDED watermark */}
        {isCancelled && <VoidedWatermark />}

        {/* Folio masthead */}
        <FolioMasthead
          invoice={invoice}
          earlyCollectionSequence={earlyCollectionSequence}
          isPaid={isPaid}
          isCancelled={isCancelled}
        />

        {/* Itemized lines */}
        <ItemSection items={invoice.items} />

        {/* Totals block — heavy rule language */}
        <TotalsBlock
          subtotal={invoice.subtotal}
          discountTotal={invoice.discountTotal}
          parkingFeeTotal={parkingFeeTotal}
          grandTotal={invoice.grandTotal}
          isCancelled={isCancelled}
        />

        {/* Payment timeline */}
        {(invoice.payments.length > 0 || invoice.membershipPayments.length > 0) && (
          <PaymentTimeline
            payments={invoice.payments}
            membershipPayments={invoice.membershipPayments}
          />
        )}

        {/* Notes */}
        {invoice.notes && <FolioNotes notes={invoice.notes} />}

        {/* Folio footer — paper tear */}
        <FolioFooter invoice={invoice} />
      </article>

      {/* ── Metadata spine ─────────────────────────────────────────── */}
      <aside className="space-y-6">
        <SpineSection number="01" label="Khách hàng" icon={User}>
          {invoice.customer ? (
            <div className="space-y-1.5">
              <p className="font-mono text-sm uppercase tracking-wide text-[var(--color-text-primary)]">
                {invoice.customer.fullName}
              </p>
              {invoice.customer.phone && (
                <p className="font-mono text-xs text-[var(--color-text-secondary)] tabular-nums">
                  {invoice.customer.phone}
                </p>
              )}
              <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-gold-dark)] dark:text-[var(--color-gold)]">
                {invoice.customer.type === 'MEMBER' ? 'Hội viên' : 'Vãng lai'}
              </p>
              {invoice.customer.id === null && (
                <p className="text-[10px] text-[var(--color-text-tertiary)]">
                  Khách vãng lai — không lưu hồ sơ
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-tertiary)]">—</p>
          )}
        </SpineSection>

        <SpineSection number="02" label="Phiên chơi" icon={Clock}>
          {invoice.session ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-1.5 font-mono text-sm tabular-nums text-[var(--color-text-primary)]">
                <span>{formatTime(invoice.session.startTime)}</span>
                <span className="text-[var(--color-text-tertiary)]">—</span>
                <span>
                  {invoice.session.endTime
                    ? formatTime(invoice.session.endTime)
                    : 'đang chơi'}
                </span>
              </div>
              <StatusMark
                tone={
                  invoice.session.status === 'COMPLETED'
                    ? 'paid'
                    : invoice.session.status === 'ACTIVE'
                      ? 'pending'
                      : 'voided'
                }
              >
                {invoice.session.status === 'COMPLETED'
                  ? 'Hoàn tất'
                  : invoice.session.status === 'ACTIVE'
                    ? 'Đang chơi'
                    : 'Đã huỷ'}
              </StatusMark>
              {pausedSeconds > 0 && (
                <div className="space-y-1 border-t border-dashed border-[var(--color-border-default)] pt-2 text-[11px] text-[var(--color-text-secondary)]">
                  <p className="flex items-center justify-between gap-2">
                    <span className="uppercase tracking-wide">Nghỉ</span>
                    <span className="font-mono tabular-nums text-[var(--color-text-primary)]">
                      {formatPausedHMS(pausedSeconds)}
                    </span>
                  </p>
                  {playerPauses.length > 0 && (
                    <ul className="space-y-0.5 pl-2">
                      {playerPauses.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-2 font-mono tabular-nums"
                        >
                          <span className="truncate">
                            {p.name?.trim() || 'Người chơi'}
                          </span>
                          <span className="text-[var(--color-text-secondary)]">
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
            <p className="text-xs text-[var(--color-text-tertiary)]">—</p>
          )}
        </SpineSection>

        <SpineSection number="03" label="Ca & nhân viên" icon={Users}>
          <div className="space-y-1.5">
            <p className="font-mono text-sm text-[var(--color-text-primary)]">
              {invoice.staff.fullName}
            </p>
            {invoice.shift && (
              <p className="font-mono text-[11px] text-[var(--color-text-secondary)] tabular-nums">
                Ca mở {formatTime(invoice.shift.openedAt)}
                {invoice.shift.closedAt
                  ? ` · đóng ${formatTime(invoice.shift.closedAt)}`
                  : ' · đang mở'}
              </p>
            )}
          </div>
        </SpineSection>
      </aside>
    </div>
  )
}

// ─── Folio masthead ─────────────────────────────────────────────────────────
function FolioMasthead({
  invoice,
  earlyCollectionSequence,
  isPaid,
  isCancelled,
}: {
  invoice: InvoiceDetail
  earlyCollectionSequence: number | undefined
  isPaid: boolean
  isCancelled: boolean
}) {
  return (
    <header className="relative border-b border-[var(--color-border-default)] px-6 pb-6 pt-7 md:px-10 md:pt-10">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
        <span>Hệ thống POS · Victoria Archery Club</span>
        <span>Hoá đơn bán hàng</span>
      </div>

      <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-gold-dark)] dark:text-[var(--color-gold)]">
            Số hoá đơn
          </p>
          <h1 className="font-mono text-2xl font-bold tracking-tight text-[var(--color-text-primary)] md:text-3xl">
            {invoice.invoiceNo}
          </h1>
          <p className="font-mono text-xs text-[var(--color-text-secondary)] tabular-nums">
            Lập {formatDateTime(invoice.createdAt)}
            {invoice.paidAt && (
              <>
                <span className="mx-1.5 text-[var(--color-text-tertiary)]">·</span>
                Thanh toán {formatDateTime(invoice.paidAt)}
              </>
            )}
          </p>
          {earlyCollectionSequence !== undefined && (
            <p className="mt-2 inline-flex items-center gap-1.5 border-l-2 border-[var(--color-warning)] bg-[var(--color-warning-bg)] px-2 py-1 text-[11px] font-medium text-[var(--color-warning)]">
              <Timer size={12} aria-hidden />
              Thu trước — lần {earlyCollectionSequence}
            </p>
          )}
        </div>

        <div className="md:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
            Tổng thanh toán
          </p>
          <p
            className={[
              'mt-1 font-mono text-4xl font-bold tabular-nums leading-none tracking-tight md:text-5xl',
              isCancelled
                ? 'text-[var(--color-text-tertiary)] line-through decoration-2'
                : 'text-[var(--color-gold-dark)] dark:text-[var(--color-gold)]',
            ].join(' ')}
          >
            {formatVND(invoice.grandTotal)}
          </p>
          <div className="mt-3 md:flex md:justify-end">
            <StatusMark
              tone={isPaid ? 'paid' : isCancelled ? 'voided' : 'pending'}
            >
              {isPaid ? 'Đã thanh toán' : isCancelled ? 'Đã huỷ' : 'Bản nháp'}
            </StatusMark>
          </div>
        </div>
      </div>
    </header>
  )
}

// ─── Itemized lines ─────────────────────────────────────────────────────────
function ItemSection({ items }: { items: InvoiceItem[] }) {
  return (
    <section className="px-6 py-6 md:px-10 md:py-8">
      <SectionLabel index="I" label="Chi tiết dịch vụ" />

      {items.length === 0 ? (
        <p className="mt-5 text-sm italic text-[var(--color-text-tertiary)]">
          Chưa có mục nào được ghi nhận.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-dashed divide-[var(--color-border-default)]">
          {items.map((item) => (
            <ItemLine key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ItemLine({ item }: { item: InvoiceItem }) {
  const Icon = itemTypeIcons[item.type] ?? ReceiptText
  const isNegative = item.total < 0
  const isDiscount = item.type === 'DISCOUNT' || item.type === 'SURCHARGE'
  const promotionName = getPromotionName(item.metadata)

  return (
    <li className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Icon
        size={16}
        className={[
          'mt-0.5 shrink-0',
          isNegative
            ? 'text-[var(--color-danger)]'
            : 'text-[var(--color-text-tertiary)]',
        ].join(' ')}
        aria-hidden
      />

      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {item.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-text-secondary)]">
          <span className="inline-flex items-center rounded-[2px] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
            {itemTypeLabels[item.type] ?? item.type}
          </span>
          {item.type === 'PLAY_TIME' ? (
            <PlayTimePricing item={item} />
          ) : (
            <span className="font-mono tabular-nums">
              {item.quantity} × {formatVND(item.unitPrice)}
            </span>
          )}
          {item.discountAmount > 0 && (
            <span className="font-mono tabular-nums text-[var(--color-danger)]">
              −{formatVND(item.discountAmount)}
            </span>
          )}
          {promotionName && (
            <span className="truncate italic text-[var(--color-gold-dark)] dark:text-[var(--color-gold)]">
              KM: {promotionName}
            </span>
          )}
        </div>
      </div>

      <p
        className={[
          'whitespace-nowrap font-mono text-sm font-semibold tabular-nums',
          isNegative || isDiscount
            ? 'text-[var(--color-danger)]'
            : 'text-[var(--color-text-primary)]',
        ].join(' ')}
      >
        {isNegative ? '−' : ''}
        {formatVND(Math.abs(item.total))}
      </p>
    </li>
  )
}

// ─── Totals block ───────────────────────────────────────────────────────────
function TotalsBlock({
  subtotal,
  discountTotal,
  parkingFeeTotal,
  grandTotal,
  isCancelled,
}: {
  subtotal: number
  discountTotal: number
  parkingFeeTotal: number
  grandTotal: number
  isCancelled: boolean
}) {
  return (
    <section className="border-y-2 border-double border-[var(--color-border-default)] bg-[color-mix(in_oklab,var(--color-surface-primary)_92%,var(--color-gold)_8%)] px-6 py-5 md:px-10 dark:bg-[color-mix(in_oklab,var(--color-surface-primary)_85%,var(--color-gold)_15%)]">
      <dl className="space-y-1.5 text-sm">
        <SummaryRow label="Tạm tính" value={formatVND(subtotal)} />
        {discountTotal > 0 && (
          <SummaryRow
            label="Giảm giá"
            value={`− ${formatVND(discountTotal)}`}
            tone="deduction"
          />
        )}
        {parkingFeeTotal > 0 && (
          <SummaryRow
            label="Phí gửi xe"
            value={`− ${formatVND(parkingFeeTotal)}`}
            tone="deduction"
          />
        )}
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t border-[var(--color-border-default)] pt-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-secondary)]">
          Tổng cộng
        </span>
        <span
          className={[
            'font-mono text-2xl font-bold tabular-nums leading-none tracking-tight md:text-3xl',
            isCancelled
              ? 'text-[var(--color-text-tertiary)] line-through decoration-2'
              : 'text-[var(--color-gold-dark)] dark:text-[var(--color-gold)]',
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
  const accent = tone === 'deduction' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]'
  return (
    <div className="flex items-baseline justify-between gap-3 font-mono tabular-nums">
      <dt className={`text-[11px] uppercase tracking-[0.18em] ${accent}`}>{label}</dt>
      <dd
        className={[
          'text-sm font-medium',
          tone === 'deduction' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]',
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
    <section className="px-6 py-6 md:px-10 md:py-8">
      <SectionLabel
        index="II"
        label="Lịch sử thanh toán"
        meta={`${payments.length + membershipPayments.length} khoản`}
      />

      <ol className="mt-5 space-y-4">
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
      </ol>
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
  const MethodIcon =
    method === 'CASH' ? Banknote : method === 'MEMBER' ? ShieldCheck : CreditCard
  return (
    <li className="relative grid grid-cols-[1.25rem_1fr_auto] items-start gap-3">
      {/* Bullet + dotted line */}
      <div className="relative flex justify-center">
        <span
          aria-hidden
          className={[
            'z-10 mt-1 grid h-5 w-5 place-items-center rounded-full border-2 border-[var(--color-surface-primary)]',
            memberOnly
              ? 'bg-[var(--color-accent-purple)]'
              : 'bg-[var(--color-gold-dark)] dark:bg-[var(--color-gold)]',
          ].join(' ')}
        >
          <MethodIcon size={10} className="text-white" aria-hidden />
        </span>
        <span
          aria-hidden
          className="absolute left-1/2 top-6 h-full w-px -translate-x-1/2 border-l border-dashed border-[var(--color-border-default)]"
        />
      </div>

      <div className="min-w-0 space-y-0.5 pb-1">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
          {label}
          {memberOnly && (
            <span className="ml-1.5 inline-block rounded-[2px] border border-[var(--color-accent-purple-border)] bg-[var(--color-accent-purple-bg)] px-1.5 py-px text-[9px] font-mono uppercase tracking-wider text-[var(--color-accent-purple)]">
              Hội viên
            </span>
          )}
        </p>
        <p className="font-mono text-[11px] tabular-nums text-[var(--color-text-secondary)]">
          {formatDateTime(at)}
          {staffName && (
            <>
              <span className="mx-1.5 text-[var(--color-text-tertiary)]">·</span>
              {staffName}
            </>
          )}
        </p>
        {notes && (
          <p className="text-[11px] italic text-[var(--color-text-tertiary)]">
            “{notes}”
          </p>
        )}
      </div>

      <p
        className={[
          'whitespace-nowrap font-mono text-sm font-semibold tabular-nums',
          memberOnly
            ? 'text-[var(--color-accent-purple)]'
            : 'text-[var(--color-text-primary)]',
        ].join(' ')}
      >
        {formatVND(amount)}
      </p>
    </li>
  )
}

// ─── Folio notes ────────────────────────────────────────────────────────────
function FolioNotes({ notes }: { notes: string }) {
  return (
    <section className="border-t border-dashed border-[var(--color-border-default)] px-6 py-5 md:px-10">
      <SectionLabel index="III" label="Ghi chú" />
      <p className="mt-3 max-w-prose text-sm italic text-[var(--color-text-secondary)]">
        “{notes}”
      </p>
    </section>
  )
}

// ─── Folio footer ───────────────────────────────────────────────────────────
function FolioFooter({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <footer className="border-t border-[var(--color-border-default)] px-6 py-5 md:px-10">
      <div className="flex flex-col items-start gap-2 text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)] md:flex-row md:items-center md:justify-between">
        <span>Hoá đơn lưu trên hệ thống · {invoice.id.slice(0, 8)}</span>
        <span>Cảm ơn quý khách</span>
      </div>
      {/* Perforated bottom edge — the tear */}
      <div
        aria-hidden
        className="mt-5 h-1.5 w-full bg-[radial-gradient(circle_at_4px_4px,var(--color-surface-secondary)_2px,transparent_2.5px)] bg-[length:8px_4px]"
      />
    </footer>
  )
}

// ─── Voided watermark ───────────────────────────────────────────────────────
function VoidedWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
    >
      <div className="flex items-center gap-3 -rotate-12 rounded-[2px] border-4 border-[var(--color-danger)] px-8 py-3 text-[var(--color-danger)] opacity-70 mix-blend-multiply dark:mix-blend-screen">
        <X size={28} strokeWidth={3} />
        <span className="font-mono text-2xl font-black uppercase tracking-[0.4em]">
          Đã huỷ
        </span>
      </div>
    </div>
  )
}

// ─── Spine section (right column) ───────────────────────────────────────────
function SpineSection({
  number,
  label,
  icon: Icon,
  children,
}: {
  number: string
  label: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] pb-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-gold-dark)] dark:text-[var(--color-gold)]">
          §{number}
        </span>
        <Icon
          size={12}
          className="text-[var(--color-text-tertiary)]"
          aria-hidden
        />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-secondary)]">
          {label}
        </h2>
      </div>
      <div className="pt-3">{children}</div>
    </section>
  )
}

// ─── Shared atoms ───────────────────────────────────────────────────────────
function SectionLabel({
  index,
  label,
  meta,
}: {
  index: string
  label: string
  meta?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-secondary)]">
        <span className="font-mono text-[var(--color-gold-dark)] dark:text-[var(--color-gold)]">
          §{index}
        </span>
        {label}
      </h2>
      {meta && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
          {meta}
        </span>
      )}
    </div>
  )
}

function StatusMark({
  tone,
  children,
}: {
  tone: 'paid' | 'pending' | 'voided'
  children: React.ReactNode
}) {
  const style =
    tone === 'paid'
      ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]'
      : tone === 'pending'
        ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
        : 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
  const Icon = tone === 'paid' ? Check : tone === 'pending' ? Clock : X
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-[0.18em]',
        style,
      ].join(' ')}
    >
      <Icon size={10} aria-hidden />
      {children}
    </span>
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

function PlayTimePricing({ item }: { item: InvoiceItem }) {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>
  const playerPricing = Array.isArray(metadata.playerPricing)
    ? (metadata.playerPricing as Array<{
        name?: string
        totalHours?: number
        subtotal?: number
        discountAmount?: number
        total?: number
        pricingRuleName?: string
      }>)
    : null
  if (!playerPricing || playerPricing.length === 0) {
    const checkoutCount =
      typeof metadata.checkoutCount === 'number' && metadata.checkoutCount > 0
        ? metadata.checkoutCount
        : null
    const perPersonSubtotal =
      typeof metadata.perPersonSubtotal === 'number' ? metadata.perPersonSubtotal : null
    return (
      <span className="font-mono tabular-nums">
        {perPersonSubtotal !== null && perPersonSubtotal >= 0
          ? `${formatVND(perPersonSubtotal)}/người${checkoutCount ? ` × ${checkoutCount} người` : ''}`
          : `${item.quantity} × ${formatVND(item.unitPrice)}`}
      </span>
    )
  }
  return (
    <ul className="w-full space-y-0.5 font-mono tabular-nums">
      {playerPricing.map((p, index) => (
        <li key={index} className="flex items-baseline justify-between gap-2">
          <span className="truncate">
            Người {index + 1}: {formatHours(p.totalHours ?? 0)}h
            {p.pricingRuleName ? ` · ${p.pricingRuleName}` : ''}
          </span>
          <span className="shrink-0 font-semibold text-[var(--color-text-primary)]">
            = {formatVND(p.total ?? 0)}
          </span>
        </li>
      ))}
    </ul>
  )
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
