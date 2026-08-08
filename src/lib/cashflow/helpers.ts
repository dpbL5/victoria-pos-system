// ── Helpers — pure functions cho domain cashflow ─────
import type { Prisma } from '@/generated/prisma/client'
import type { CashflowListFilter, CashflowSummary, CashflowListResult } from './ports'

type CashflowStore = Pick<Prisma.TransactionClient, 'cashflowEntry'>

export const cashflowWithStaffInclude = {
  staff: { select: { id: true, fullName: true } },
} satisfies Prisma.CashflowEntryInclude

export async function listCashflows(
  db: CashflowStore,
  filter: CashflowListFilter
): Promise<CashflowListResult> {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 10

  const where = { type: filter.type }

  const [entries, total] = await Promise.all([
    db.cashflowEntry.findMany({
      where,
      include: cashflowWithStaffInclude,
      orderBy: { createdAt: 'desc' },
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
    where: {
      type: filter?.type,
    },
    _sum: { amount: true },
  })

  const fold = (t: 'INCOME' | 'EXPENSE') =>
    Number(rows.find((r) => r.type === t)?._sum.amount ?? 0)

  return {
    income: fold('INCOME'),
    expense: fold('EXPENSE'),
  }
}
