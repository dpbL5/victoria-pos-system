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
      membershipPayments: true,
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
  membershipPayment: Pick<Prisma.MembershipPaymentDelegate, 'findMany' | 'groupBy'>
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
      customer: { select: { fullName: true, type: true } },
    },
  },
  staff: { select: { fullName: true } },
} satisfies Prisma.PaymentInclude

const membershipPaymentInclude = {
  customer: { select: { fullName: true, type: true } },
  plan: { select: { name: true } },
  staff: { select: { fullName: true } },
} satisfies Prisma.MembershipPaymentInclude

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>
type MembershipPaymentRow = Prisma.MembershipPaymentGetPayload<{ include: typeof membershipPaymentInclude }>

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
  const [payments, membershipPayments] = await Promise.all([
    db.payment.findMany({
      where: { shiftId },
      include: paymentInclude,
      orderBy: { paidAt: 'asc' },
    }),
    db.membershipPayment.findMany({
      where: { shiftId },
      include: membershipPaymentInclude,
      orderBy: { paidAt: 'asc' },
    }),
  ])

  const mapTransaction = (p: PaymentRow): TransactionItem => ({
    id: p.id,
    type: 'payment' as const,
    amount: Number(p.grandTotal),
    paymentMethod: p.paymentMethod as string,
    paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : String(p.paidAt),
    customerName:
      p.invoice?.customer?.fullName ??
      p.session?.customer?.fullName ??
      'Khách lẻ',
    customerType: (p.invoice?.customer?.type ?? p.session?.customer?.type) ?? null,
    invoiceId: p.invoice?.id ?? null,
    invoiceNo: p.invoice?.invoiceNo ?? null,
    invoiceStatus: p.invoice?.status ?? null,
    staffName: p.staff?.fullName ?? '—',
    planName: null,
  })

  const mapMpTransaction = (mp: MembershipPaymentRow): TransactionItem => ({
    id: mp.id,
    type: 'membership' as const,
    amount: Number(mp.amount),
    paymentMethod: mp.paymentMethod as string,
    paidAt: mp.paidAt instanceof Date ? mp.paidAt.toISOString() : String(mp.paidAt),
    customerName: mp.customer?.fullName ?? '—',
    customerType: mp.customer?.type ?? null,
    invoiceId: null,
    invoiceNo: null,
    invoiceStatus: null,
    staffName: mp.staff?.fullName ?? '—',
    planName: mp.plan?.name ?? null,
  })

  const transactions: TransactionItem[] = [
    ...payments.map(mapTransaction),
    ...membershipPayments.map(mapMpTransaction),
  ].sort(
    (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
  )

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
  const [paymentAgg, mpAgg] = await Promise.all([
    // Báo cáo doanh thu tự lọc payment từ hoá đơn đã huỷ
    db.payment.groupBy({
      by: ['paymentMethod'],
      where: { shiftId, invoice: { status: { not: 'CANCELLED' } } },
      _sum: { grandTotal: true },
      _count: { _all: true },
    }),
    db.membershipPayment.groupBy({
      by: ['paymentMethod'],
      where: { shiftId },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ])

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
    paymentCount += row._count?._all ?? 0
  }

  for (const row of mpAgg) {
    const amount = Number(row._sum?.amount ?? 0)
    if (row.paymentMethod === 'CASH') cashRevenue += amount
    else if (row.paymentMethod === 'TRANSFER') transferRevenue += amount
    else if (row.paymentMethod === 'CARD') cardRevenue += amount
    else if (row.paymentMethod === 'MEMBER') memberRevenue += amount
    membershipCount += row._count?._all ?? 0
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
