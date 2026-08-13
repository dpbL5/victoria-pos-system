// ── Shift lookup helpers — nhận store injection (cả prisma lẫn tx) ─────
import { Prisma } from '@/generated/prisma/client'

type ShiftLookupStore = Pick<Prisma.TransactionClient, 'shift'>

export const shiftWithParticipantsInclude = {
  staff: { select: { id: true, fullName: true } },
  participants: {
    where: { leftAt: null },
    include: { staff: { select: { id: true, fullName: true } } },
    orderBy: { joinedAt: 'asc' },
  },
  toolCounts: {
    include: { tool: { select: { id: true, name: true, quantity: true, isRequired: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ShiftInclude

export const shiftWithAllParticipantsInclude = {
  staff: { select: { id: true, fullName: true } },
  participants: {
    include: { staff: { select: { id: true, fullName: true, username: true, role: true, isActive: true } } },
    orderBy: { joinedAt: 'asc' },
  },
  _count: {
    select: {
      sessions: true,
      payments: true,
    },
  },
} satisfies Prisma.ShiftInclude

export async function findOpenShiftForStaff(
  db: ShiftLookupStore,
  staffId: string
) {
  return db.shift.findFirst({
    where: {
      status: 'OPEN',
      OR: [
        { staffId },
        {
          participants: {
            some: {
              staffId,
              leftAt: null,
            },
          },
        },
      ],
    },
    include: shiftWithParticipantsInclude,
    orderBy: { openedAt: 'desc' },
  })
}

export async function findOpenOperationalShift(db: ShiftLookupStore) {
  return db.shift.findFirst({
    where: { status: 'OPEN' },
    include: shiftWithParticipantsInclude,
    orderBy: { openedAt: 'desc' },
  })
}

// ── Shift close & revenue helpers ──

type ShiftCashStore = Pick<Prisma.TransactionClient, 'shift' | 'payment'>

/**
 * Tiền mặt kỳ vọng = openingCash + tổng payment CASH chưa huỷ.
 * Trả null nếu shift không tồn tại (adapter chuyển thành fail('SHIFT_NOT_FOUND')).
 */
export async function calculateExpectedCash(
  db: ShiftCashStore,
  shiftId: string
): Promise<number | null> {
  const shift = await db.shift.findUnique({ where: { id: shiftId } })
  if (!shift) return null

  const cashPayments = await db.payment.aggregate({
    where: {
      shiftId,
      paymentMethod: 'CASH',
      invoice: { status: { not: 'CANCELLED' } },
    },
    _sum: { grandTotal: true },
  })

  return Number(shift.openingCash) + Number(cashPayments._sum.grandTotal ?? 0)
}

// ── Shift transaction & revenue helpers ──

export interface TransactionItem {
  id: string
  type: 'payment' | 'membership'
  amount: number
  paymentMethod: string | null
  paidAt: string
  customerName: string
  customerType: string | null
  invoiceId: string | null
  invoiceNo: string | null
  invoiceStatus: string | null
  staffName: string
  planName: string | null
}

export interface ShiftRevenueData {
  totalRevenue: number
  cashRevenue: number
  transferRevenue: number
  cardRevenue: number
  memberRevenue: number
  paymentCount: number
  membershipCount: number
}

interface ShiftDb {
  payment: Pick<Prisma.PaymentDelegate, 'findMany' | 'groupBy'>
}

const paymentInclude = {
  invoice: {
    select: {
      id: true,
      invoiceNo: true,
      status: true,
      customer: { select: { fullName: true, type: true } },
    },
  },
  session: {
    select: {
      customerName: true,
      customer: { select: { fullName: true, type: true } },
    },
  },
  customer: { select: { fullName: true, type: true } },
  plan: { select: { name: true } },
  staff: { select: { fullName: true } },
} satisfies Prisma.PaymentInclude

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>

export async function getShiftTransactions(
  db: ShiftDb,
  shiftId: string
): Promise<{
  transactions: TransactionItem[]
  summary: {
    totalAmount: number
    totalCount: number
    paymentCount: number
    membershipCount: number
    cashAmount: number
    transferAmount: number
    cardAmount: number
    memberAmount: number
  }
}> {
  const payments = await db.payment.findMany({
    where: { shiftId },
    include: paymentInclude,
    orderBy: { paidAt: 'asc' },
  })

  const mapTransaction = (p: PaymentRow): TransactionItem => ({
    id: p.id,
    type: p.kind === 'MEMBERSHIP' ? 'membership' as const : 'payment' as const,
    amount: Number(p.grandTotal),
    paymentMethod: p.paymentMethod as string,
    paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : String(p.paidAt),
    customerName:
      p.invoice?.customer?.fullName ??
      p.session?.customerName ??
      p.session?.customer?.fullName ??
      p.customer?.fullName ??
      'Khách lẻ',
    customerType: (p.invoice?.customer?.type ?? p.session?.customer?.type ?? p.customer?.type) ?? null,
    invoiceId: p.invoice?.id ?? null,
    invoiceNo: p.invoice?.invoiceNo ?? null,
    invoiceStatus: p.invoice?.status ?? null,
    staffName: p.staff?.fullName ?? '—',
    planName: p.plan?.name ?? null,
  })

  const transactions: TransactionItem[] = payments
    .map(mapTransaction)
    .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime())

  // Loại trừ giao dịch từ hoá đơn đã huỷ khi tính tổng hợp
  const activeTransactions = transactions.filter(
    (t) => t.invoiceStatus !== 'CANCELLED'
  )
  const totalAmount = activeTransactions.reduce((sum, t) => sum + t.amount, 0)

  return {
    transactions,
    summary: {
      totalAmount,
      totalCount: activeTransactions.length,
      paymentCount: activeTransactions.filter((t) => t.type === 'payment').length,
      membershipCount: activeTransactions.filter((t) => t.type === 'membership').length,
      cashAmount: activeTransactions
        .filter((t) => t.paymentMethod === 'CASH')
        .reduce((sum, t) => sum + t.amount, 0),
      transferAmount: activeTransactions
        .filter((t) => t.paymentMethod === 'TRANSFER')
        .reduce((sum, t) => sum + t.amount, 0),
      cardAmount: activeTransactions
        .filter((t) => t.paymentMethod === 'CARD')
        .reduce((sum, t) => sum + t.amount, 0),
      memberAmount: activeTransactions
        .filter((t) => t.paymentMethod === 'MEMBER')
        .reduce((sum, t) => sum + t.amount, 0),
    },
  }
}

export async function getShiftRevenueData(
  db: ShiftDb,
  shiftId: string
): Promise<ShiftRevenueData> {
  const paymentAgg = await db.payment.groupBy({
    by: ['paymentMethod', 'kind'],
    where: { shiftId, invoice: { status: { not: 'CANCELLED' } } },
    _sum: { grandTotal: true },
    _count: { _all: true },
  })

  let cashRevenue = 0
  let transferRevenue = 0
  let cardRevenue = 0
  let memberRevenue = 0
  let paymentCount = 0
  let membershipCount = 0

  for (const row of paymentAgg) {
    const amount = Number(row._sum?.grandTotal ?? 0)
    if (row.paymentMethod === 'CASH') cashRevenue += amount
    else if (row.paymentMethod === 'TRANSFER') transferRevenue += amount
    else if (row.paymentMethod === 'CARD') cardRevenue += amount
    else if (row.paymentMethod === 'MEMBER') memberRevenue += amount
    if (row.kind === 'MEMBERSHIP') membershipCount += row._count?._all ?? 0
    else paymentCount += row._count?._all ?? 0
  }

  // MEMBER là thanh toán qua hội viên, không thu tiền mặt — chỉ tính vào tổng doanh thu
  const totalRevenue = cashRevenue + transferRevenue + cardRevenue + memberRevenue

  return { totalRevenue, cashRevenue, transferRevenue, cardRevenue, memberRevenue, paymentCount, membershipCount }
}

export interface ShiftDayGroup {
  date: string
  totalRevenue: number
  cashRevenue: number
  transferRevenue: number
  cardRevenue: number
  memberRevenue: number
  paymentCount: number
  membershipCount: number
  sessionCount: number
  shifts: Array<Record<string, unknown>>
}

/** Thống kê dụng cụ đối soát: matched = openCount === closeCount, bỏ qua chưa đóng */
export function calcToolStats(tcs: { openCount: number; closeCount: number | null }[]) {
  if (tcs.length === 0) return undefined
  let matched = 0
  let mismatched = 0
  for (const tc of tcs) {
    if (tc.closeCount == null) continue
    if (tc.closeCount === tc.openCount) matched++
    else mismatched++
  }
  return { total: tcs.length, matched, mismatched }
}
