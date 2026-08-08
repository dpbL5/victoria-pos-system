// ── Adapter: implement CashflowRepository bằng Prisma ─────
import type { CashflowStore } from '../store-types'
import { listCashflows, summarizeCashflows, cashflowWithStaffInclude } from '@/lib/cashflow'
import type { CashflowRepository, CreateCashflowData, UpdateCashflowData } from '@/lib/cashflow/ports'

export function createCashflowRepository(store: CashflowStore): CashflowRepository {
  return {
    async create(data: CreateCashflowData) {
      return store.cashflowEntry.create({
        data,
        include: cashflowWithStaffInclude,
      })
    },

    async findById(id: string) {
      return store.cashflowEntry.findUnique({
        where: { id },
        include: cashflowWithStaffInclude,
      })
    },

    async update(id: string, data: UpdateCashflowData) {
      return store.cashflowEntry.update({
        where: { id },
        data: {
          type: data.type,
          personName: data.personName,
          amount: data.amount,
          reason: data.reason,
        },
        include: cashflowWithStaffInclude,
      })
    },

    async delete(id: string) {
      await store.cashflowEntry.delete({ where: { id } })
    },

    list(filter) {
      return listCashflows(store, filter)
    },

    summarize(filter?) {
      return summarizeCashflows(store, filter)
    },
  }
}
