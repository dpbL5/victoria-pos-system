// ── Ports — repository interface cho domain cashflow ─────
import type { Prisma } from '@/generated/prisma/client'

export type CashflowEntryRecord = Prisma.CashflowEntryGetPayload<{
  include: { staff: { select: { id: true; fullName: true } } }
}>

export interface CreateCashflowData {
  type: 'INCOME' | 'EXPENSE'
  personName: string
  amount: number
  reason: string
  staffId: string
}

export interface UpdateCashflowData {
  type: 'INCOME' | 'EXPENSE'
  personName: string
  amount: number
  reason: string
}

export interface CashflowListFilter {
  type?: 'INCOME' | 'EXPENSE'
  page?: number
  pageSize?: number
}

export interface CashflowListResult {
  entries: CashflowEntryRecord[]
  total: number
  page: number
  pageSize: number
}

export interface CashflowSummary {
  income: number
  expense: number
}

export interface CashflowRepository {
  create(data: CreateCashflowData): Promise<CashflowEntryRecord>
  findById(id: string): Promise<CashflowEntryRecord | null>
  update(id: string, data: UpdateCashflowData): Promise<CashflowEntryRecord>
  delete(id: string): Promise<void>
  list(filter: CashflowListFilter): Promise<CashflowListResult>
  summarize(filter?: CashflowListFilter): Promise<CashflowSummary>
}
