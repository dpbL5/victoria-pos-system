import { Prisma } from '@/generated/prisma/client'

type ShiftLookupStore = Pick<Prisma.TransactionClient, 'shift'>
type ShiftStore = Pick<Prisma.TransactionClient, 'shift' | 'payment'>

// ── Transaction types ──

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
  staffName: string
  planName: string | null
}

export interface ShiftRevenueData {
  totalRevenue: number
  cashRevenue: number
  transferRevenue: number
  cardRevenue: number
  paymentCount: number
  membershipCount: number
}

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

export async function calculateExpectedCash(
  db: ShiftStore,
  shiftId: string
): Promise<number> {
  const shift = await db.shift.findUnique({ where: { id: shiftId } })
  if (!shift) throw new Error('SHIFT_NOT_FOUND')

  const cashPayments = await db.payment.aggregate({
    where: {
      shiftId,
      paymentMethod: 'CASH',
    },
    _sum: { grandTotal: true },
  })

  return Number(shift.openingCash) + Number(cashPayments._sum.grandTotal ?? 0)
}

// ── Shift transaction & revenue helpers ──

interface ShiftDb {
  payment: {
    findMany: (args: any) => Promise<any[]>
    groupBy: (args: any) => Promise<any[]>
  }
  membershipPayment: {
    findMany: (args: any) => Promise<any[]>
    groupBy: (args: any) => Promise<any[]>
  }
}

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
  }
}> {
  const [payments, membershipPayments] = await Promise.all([
    db.payment.findMany({
      where: { shiftId },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            customer: { select: { fullName: true, type: true } },
          },
        },
        session: {
          select: {
            customer: { select: { fullName: true, type: true } },
          },
        },
        staff: { select: { fullName: true } },
      },
      orderBy: { paidAt: 'asc' },
    }),
    db.membershipPayment.findMany({
      where: { shiftId },
      include: {
        customer: { select: { fullName: true, type: true } },
        plan: { select: { name: true } },
        staff: { select: { fullName: true } },
      },
      orderBy: { paidAt: 'asc' },
    }),
  ])

  const mapTransaction = (p: any): TransactionItem => ({
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
    staffName: p.staff?.fullName ?? '—',
    planName: null,
  })

  const mapMpTransaction = (mp: any): TransactionItem => ({
    id: mp.id,
    type: 'membership' as const,
    amount: Number(mp.amount),
    paymentMethod: mp.paymentMethod as string,
    paidAt: mp.paidAt instanceof Date ? mp.paidAt.toISOString() : String(mp.paidAt),
    customerName: mp.customer?.fullName ?? '—',
    customerType: mp.customer?.type ?? null,
    invoiceId: null,
    invoiceNo: null,
    staffName: mp.staff?.fullName ?? '—',
    planName: mp.plan?.name ?? null,
  })

  const transactions: TransactionItem[] = [
    ...payments.map(mapTransaction),
    ...membershipPayments.map(mapMpTransaction),
  ].sort(
    (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
  )

  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0)

  return {
    transactions,
    summary: {
      totalAmount,
      totalCount: transactions.length,
      paymentCount: payments.length,
      membershipCount: membershipPayments.length,
      cashAmount: transactions
        .filter((t) => t.paymentMethod === 'CASH')
        .reduce((sum, t) => sum + t.amount, 0),
      transferAmount: transactions
        .filter((t) => t.paymentMethod === 'TRANSFER')
        .reduce((sum, t) => sum + t.amount, 0),
      cardAmount: transactions
        .filter((t) => t.paymentMethod === 'CARD')
        .reduce((sum, t) => sum + t.amount, 0),
    },
  }
}

export async function getShiftRevenueData(
  db: ShiftDb,
  shiftId: string
): Promise<ShiftRevenueData> {
  const [paymentAgg, mpAgg] = await Promise.all([
    db.payment.groupBy({
      by: ['paymentMethod'],
      where: { shiftId },
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
  let paymentCount = 0
  let membershipCount = 0

  for (const row of paymentAgg) {
    const amount = Number(row._sum?.grandTotal ?? 0)
    if (row.paymentMethod === 'CASH') cashRevenue += amount
    else if (row.paymentMethod === 'TRANSFER') transferRevenue += amount
    else if (row.paymentMethod === 'CARD') cardRevenue += amount
    paymentCount += row._count?._all ?? 0
  }

  for (const row of mpAgg) {
    const amount = Number(row._sum?.amount ?? 0)
    if (row.paymentMethod === 'CASH') cashRevenue += amount
    else if (row.paymentMethod === 'TRANSFER') transferRevenue += amount
    else if (row.paymentMethod === 'CARD') cardRevenue += amount
    membershipCount += row._count?._all ?? 0
  }

  const totalRevenue = cashRevenue + transferRevenue + cardRevenue

  return { totalRevenue, cashRevenue, transferRevenue, cardRevenue, paymentCount, membershipCount }
}

export interface ShiftDayGroup {
  date: string
  totalRevenue: number
  cashRevenue: number
  transferRevenue: number
  cardRevenue: number
  paymentCount: number
  membershipCount: number
  sessionCount: number
  shifts: Array<Record<string, unknown>>
}
