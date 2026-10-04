// ── Helpers — pure functions cho domain cashflow ─────
import type { Prisma } from '@/generated/prisma/client'
import type { CashflowListFilter, CashflowSummary, CashflowListResult } from './ports'

type CashflowStore = Pick<Prisma.TransactionClient, 'cashflowEntry'>

export const cashflowWithStaffInclude = {
  staff: { select: { id: true, fullName: true } },
} satisfies Prisma.CashflowEntryInclude

/** Điều kiện lọc dùng chung cho list + summarize (theo loại và ngày phát sinh). */
export function buildCashflowWhere(filter?: CashflowListFilter): Prisma.CashflowEntryWhereInput {
  const where: Prisma.CashflowEntryWhereInput = {}
  if (filter?.type) where.type = filter.type
  if (filter?.from || filter?.to) {
    where.occurredAt = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lt: filter.to } : {}),
    }
  }
  return where
}

export async function listCashflows(
  db: CashflowStore,
  filter: CashflowListFilter
): Promise<CashflowListResult> {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 10

  const where = buildCashflowWhere(filter)

  const [entries, total] = await Promise.all([
    db.cashflowEntry.findMany({
      where,
      include: cashflowWithStaffInclude,
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.cashflowEntry.count({ where }),
  ])

  return { entries, total, page, pageSize }
}

export async function summarizeCashflows(
  db: CashflowStore,
  filter?: CashflowListFilter
): Promise<CashflowSummary> {
  const rows = await db.cashflowEntry.groupBy({
    by: ['type'],
    where: buildCashflowWhere(filter),
    _sum: { amount: true },
  })

  const fold = (t: 'INCOME' | 'EXPENSE') =>
    Number(rows.find((r) => r.type === t)?._sum.amount ?? 0)

  return {
    income: fold('INCOME'),
    expense: fold('EXPENSE'),
  }
}
