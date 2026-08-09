// ── Use-cases: CRUD bảng giá (create/update/delete) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { DayType } from '@/types'
import type { Prisma } from '@/generated/prisma/client'

// ── Create ──
export interface CreatePricingRuleInput {
  staffId: string
  name: string
  hourFrom: number
  hourTo: number | null
  ratePerHour: number
  daysOfWeek: number[]
  dayType: DayType
  effectiveFrom: Date
  effectiveTo: Date | null
  tiers?: Array<{ minHours: number; ratePerHour: number }>
}

export interface CreatePricingRuleResult {
  rule: Prisma.PricingRuleGetPayload<object>
  warnings: string[]
}

export async function createPricingRule(
  input: CreatePricingRuleInput,
  deps: Repositories = repositories
): Promise<Result<CreatePricingRuleResult>> {
  const overlaps = await deps.pricing.findOverlapping({
    daysOfWeek: input.daysOfWeek,
    hourFrom: input.hourFrom,
    hourTo: input.hourTo,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
  })

  const result = await runInTransaction(async (tx) => {
    const rule = await tx.pricing.createWithTiers({
      name: input.name.trim(),
      hourFrom: input.hourFrom,
      hourTo: input.hourTo,
      ratePerHour: input.ratePerHour,
      daysOfWeek: input.daysOfWeek,
      dayType: input.dayType,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      tiers: input.tiers,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'PRICING_RULE_CREATE',
      entityType: 'PricingRule',
      entityId: rule.id,
      details: {
        name: rule.name,
        hourFrom: rule.hourFrom,
        hourTo: rule.hourTo,
        ratePerHour: Number(rule.ratePerHour),
        daysOfWeek: rule.daysOfWeek,
        dayType: rule.dayType,
      },
    })

    return rule
  })

  if (!result.ok) return result
  return ok({
    rule: result.value,
    warnings: overlaps.map((o) => `Trùng khung giờ với quy tắc "${o.name}"`),
  })
}

export function mapCreatePricingRuleError(error: DomainError): HttpErrorInfo {
  return { code: error.code || 'UNKNOWN', message: error.detail || 'Lỗi máy chủ', status: 500 }
}

// ── Update ──
export interface UpdatePricingRuleInput {
  staffId: string
  ruleId: string
  name?: string
  hourFrom?: number
  hourTo?: number | null
  ratePerHour?: number
  daysOfWeek?: number[]
  dayType?: DayType
  effectiveFrom?: Date | null
  effectiveTo?: Date | null
  tiers?: Array<{ minHours: number; ratePerHour: number }>
}

export interface UpdatePricingRuleResult {
  rule: Prisma.PricingRuleGetPayload<object>
  warnings: string[]
}

export async function updatePricingRule(
  input: UpdatePricingRuleInput,
  deps: Repositories = repositories
): Promise<Result<UpdatePricingRuleResult>> {
  const existing = await deps.pricing.findById(input.ruleId)
  if (!existing) return err('PRICING_RULE_NOT_FOUND')

  const overlaps = await deps.pricing.findOverlapping({
    daysOfWeek: input.daysOfWeek ?? existing.daysOfWeek,
    hourFrom: input.hourFrom ?? existing.hourFrom,
    hourTo: input.hourTo !== undefined ? input.hourTo : existing.hourTo,
    effectiveFrom: input.effectiveFrom ?? existing.effectiveFrom,
    effectiveTo: input.effectiveTo !== undefined ? input.effectiveTo : existing.effectiveTo,
    excludeId: input.ruleId,
  })

  const result = await runInTransaction(async (tx) => {
    const data: Record<string, unknown> = {}
    if (input.name !== undefined) data.name = input.name.trim()
    if (input.hourFrom !== undefined) data.hourFrom = input.hourFrom
    if (input.hourTo !== undefined) data.hourTo = input.hourTo
    if (input.ratePerHour !== undefined) data.ratePerHour = input.ratePerHour
    if (input.daysOfWeek !== undefined) {
      data.daysOfWeek = input.daysOfWeek
      data.dayType = input.dayType
    }
    if (input.effectiveFrom !== undefined) data.effectiveFrom = input.effectiveFrom
    if (input.effectiveTo !== undefined) data.effectiveTo = input.effectiveTo

    const rule = await tx.pricing.update(input.ruleId, data)

    if (input.tiers !== undefined) {
      await tx.pricing.deleteTiersByRule(input.ruleId)
      if (input.tiers.length > 0) {
        await tx.pricing.createTiers(input.ruleId, input.tiers)
      }
    }

    await tx.audit.append({
      userId: input.staffId,
      action: 'PRICING_RULE_UPDATE',
      entityType: 'PricingRule',
      entityId: input.ruleId,
      details: {
        before: {
          name: existing.name,
          hourFrom: existing.hourFrom,
          hourTo: existing.hourTo,
          ratePerHour: Number(existing.ratePerHour),
          daysOfWeek: existing.daysOfWeek,
          dayType: existing.dayType,
        },
        after: {
          name: rule.name,
          hourFrom: rule.hourFrom,
          hourTo: rule.hourTo,
          ratePerHour: Number(rule.ratePerHour),
          daysOfWeek: rule.daysOfWeek,
          dayType: rule.dayType,
        },
      },
    })

    return rule
  })

  if (!result.ok) return result
  return ok({
    rule: result.value,
    warnings: overlaps.map((o) => `Trùng khung giờ với quy tắc "${o.name}"`),
  })
}

export function mapUpdatePricingRuleError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'PRICING_RULE_NOT_FOUND':
      return { code: 'PRICING_RULE_NOT_FOUND', message: 'Không tìm thấy quy tắc bảng giá', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

// ── Delete ──
export interface DeletePricingRuleInput {
  staffId: string
  ruleId: string
}

export interface DeletePricingRuleResult {
  deletedId: string
}

export async function deletePricingRule(
  input: DeletePricingRuleInput,
  deps: Repositories = repositories
): Promise<Result<DeletePricingRuleResult>> {
  const existing = await deps.pricing.findById(input.ruleId)
  if (!existing) return err('PRICING_RULE_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    await tx.pricing.delete(input.ruleId)

    await tx.audit.append({
      userId: input.staffId,
      action: 'PRICING_RULE_DELETE',
      entityType: 'PricingRule',
      entityId: input.ruleId,
      details: {
        name: existing.name,
        hourFrom: existing.hourFrom,
        hourTo: existing.hourTo,
        ratePerHour: Number(existing.ratePerHour),
        daysOfWeek: existing.daysOfWeek,
        dayType: existing.dayType,
      },
    })

    return { deletedId: input.ruleId }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapDeletePricingRuleError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'PRICING_RULE_NOT_FOUND':
      return { code: 'PRICING_RULE_NOT_FOUND', message: 'Không tìm thấy quy tắc bảng giá', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
