// ── Use-cases: CRUD khuyến mại (create/update/delete) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { PromotionRuleRow } from '../ports'

interface PromotionData {
  name: string
  discountType: string
  discountValue: number
  daysOfWeek: number[]
  hourFrom: number
  hourTo: number | null
  dayType: string
  effectiveFrom: Date
  effectiveTo: Date | null
  isActive: boolean
}

function auditDetails(rule: PromotionRuleRow) {
  return {
    name: rule.name,
    discountType: rule.discountType,
    discountValue: Number(rule.discountValue),
    daysOfWeek: rule.daysOfWeek,
    hourFrom: rule.hourFrom,
    hourTo: rule.hourTo,
    dayType: rule.dayType,
    effectiveFrom: rule.effectiveFrom.toISOString(),
    effectiveTo: rule.effectiveTo?.toISOString() ?? null,
    isActive: rule.isActive,
  }
}

// ── Create ──
export interface CreatePromotionRuleInput extends PromotionData {
  staffId: string
}

export interface CreatePromotionRuleResult {
  rule: PromotionRuleRow
}

export async function createPromotionRule(
  input: CreatePromotionRuleInput,
  deps: Repositories = repositories
): Promise<Result<CreatePromotionRuleResult>> {
  const result = await runInTransaction(async (tx) => {
    const rule = await tx.promotions.create({
      name: input.name,
      discountType: input.discountType,
      discountValue: input.discountValue,
      daysOfWeek: input.daysOfWeek,
      hourFrom: input.hourFrom,
      hourTo: input.hourTo,
      dayType: input.dayType,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      isActive: input.isActive,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'PROMOTION_RULE_CREATE',
      entityType: 'PromotionRule',
      entityId: rule.id,
      details: auditDetails(rule),
    })

    return rule
  })

  if (!result.ok) return result
  return ok({ rule: result.value })
}

export function mapCreatePromotionRuleError(error: DomainError): HttpErrorInfo {
  return { code: error.code || 'UNKNOWN', message: error.detail || 'Lỗi máy chủ', status: 500 }
}

// ── Update ──
export interface UpdatePromotionRuleInput {
  staffId: string
  ruleId: string
  data: Omit<PromotionData, 'effectiveFrom' | 'effectiveTo'> & {
    effectiveFrom: Date
    effectiveTo: Date | null
  }
}

export interface UpdatePromotionRuleResult {
  rule: PromotionRuleRow
}

export async function updatePromotionRule(
  input: UpdatePromotionRuleInput,
  deps: Repositories = repositories
): Promise<Result<UpdatePromotionRuleResult>> {
  const existing = await deps.promotions.findById(input.ruleId)
  if (!existing) return err('PROMOTION_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    const rule = await tx.promotions.update(input.ruleId, {
      name: input.data.name,
      discountType: input.data.discountType,
      discountValue: input.data.discountValue,
      daysOfWeek: input.data.daysOfWeek,
      hourFrom: input.data.hourFrom,
      hourTo: input.data.hourTo,
      dayType: input.data.dayType,
      effectiveFrom: input.data.effectiveFrom,
      effectiveTo: input.data.effectiveTo,
      isActive: input.data.isActive,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'PROMOTION_RULE_UPDATE',
      entityType: 'PromotionRule',
      entityId: input.ruleId,
      details: {
        before: auditDetails(existing),
        after: auditDetails(rule),
      },
    })

    return rule
  })

  if (!result.ok) return result
  return ok({ rule: result.value })
}

export function mapUpdatePromotionRuleError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'PROMOTION_NOT_FOUND':
      return { code: 'PROMOTION_NOT_FOUND', message: 'Không tìm thấy khuyến mại', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

// ── Delete ──
export interface DeletePromotionRuleInput {
  staffId: string
  ruleId: string
}

export interface DeletePromotionRuleResult {
  deletedId: string
}

export async function deletePromotionRule(
  input: DeletePromotionRuleInput,
  deps: Repositories = repositories
): Promise<Result<DeletePromotionRuleResult>> {
  const existing = await deps.promotions.findById(input.ruleId)
  if (!existing) return err('PROMOTION_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    await tx.promotions.delete(input.ruleId)

    await tx.audit.append({
      userId: input.staffId,
      action: 'PROMOTION_RULE_DELETE',
      entityType: 'PromotionRule',
      entityId: input.ruleId,
      details: {
        before: auditDetails(existing),
      },
    })

    return { deletedId: input.ruleId }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapDeletePromotionRuleError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'PROMOTION_NOT_FOUND':
      return { code: 'PROMOTION_NOT_FOUND', message: 'Không tìm thấy khuyến mại', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
