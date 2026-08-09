// ── Use-cases: CRUD gói hội viên (create/update/delete) ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { PlanRecord } from '../ports'

// ── Create ──
export interface CreateMembershipPlanInput {
  staffId: string
  name: string
  durationMonths: number
  price: number
}

export interface CreateMembershipPlanResult {
  plan: PlanRecord
}

export async function createMembershipPlan(
  input: CreateMembershipPlanInput,
  _deps: Repositories = repositories
): Promise<Result<CreateMembershipPlanResult>> {
  const result = await runInTransaction(async (tx) => {
    const plan = await tx.membershipPlan.create({
      name: input.name.trim(),
      durationMonths: input.durationMonths,
      price: input.price,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'MEMBERSHIP_PLAN_CREATE',
      entityType: 'MembershipPlan',
      entityId: plan.id,
      details: {
        name: plan.name,
        durationMonths: plan.durationMonths,
        price: Number(plan.price),
      },
    })

    return plan
  })

  if (!result.ok) return result
  return ok({ plan: result.value })
}

export function mapCreateMembershipPlanError(error: DomainError): HttpErrorInfo {
  return { code: error.code || 'UNKNOWN', message: error.detail || 'Lỗi máy chủ', status: 500 }
}

// ── Update ──
export interface UpdateMembershipPlanInput {
  staffId: string
  planId: string
  name?: string
  durationMonths?: number
  price?: number
  isActive?: boolean
}

export interface UpdateMembershipPlanResult {
  plan: PlanRecord
}

export async function updateMembershipPlan(
  input: UpdateMembershipPlanInput,
  deps: Repositories = repositories
): Promise<Result<UpdateMembershipPlanResult>> {
  const existing = await deps.membershipPlan.findById(input.planId)
  if (!existing) return err('PLAN_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    const plan = await tx.membershipPlan.update(input.planId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.durationMonths !== undefined ? { durationMonths: input.durationMonths } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'MEMBERSHIP_PLAN_UPDATE',
      entityType: 'MembershipPlan',
      entityId: input.planId,
      details: {
        before: {
          name: existing.name,
          durationMonths: existing.durationMonths,
          price: Number(existing.price),
          isActive: existing.isActive,
        },
        after: {
          name: plan.name,
          durationMonths: plan.durationMonths,
          price: Number(plan.price),
          isActive: plan.isActive,
        },
      },
    })

    return plan
  })

  if (!result.ok) return result
  return ok({ plan: result.value })
}

export function mapUpdateMembershipPlanError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'PLAN_NOT_FOUND':
      return { code: 'PLAN_NOT_FOUND', message: 'Không tìm thấy gói hội viên', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}

// ── Delete (soft-deactivate nếu đang dùng) ──
export interface DeleteMembershipPlanInput {
  staffId: string
  planId: string
}

export type DeleteMembershipPlanResult =
  | { deleted: true }
  | { deleted: false; deactivated: PlanRecord }

export async function deleteMembershipPlan(
  input: DeleteMembershipPlanInput,
  deps: Repositories = repositories
): Promise<Result<DeleteMembershipPlanResult>> {
  const existing = await deps.membershipPlan.findById(input.planId)
  if (!existing) return err('PLAN_NOT_FOUND')

  const usageCount = await deps.membershipPlan.countUsage(input.planId)

  // Nếu gói đang được dùng → đánh dấu ngừng dùng thay vì xoá cứng
  if (usageCount > 0) {
    const result = await runInTransaction(async (tx) => {
      const plan = await tx.membershipPlan.update(input.planId, { isActive: false })

      await tx.audit.append({
        userId: input.staffId,
        action: 'MEMBERSHIP_PLAN_DEACTIVATE',
        entityType: 'MembershipPlan',
        entityId: input.planId,
        details: {
          name: existing.name,
          reason: 'Gói đang được dùng bởi hội viên, chuyển sang trạng thái ngừng dùng',
          activeMembershipCount: usageCount,
        },
      })

      return plan
    })

    if (!result.ok) return result
    return ok({ deleted: false, deactivated: result.value })
  }

  const result = await runInTransaction(async (tx) => {
    await tx.membershipPlan.delete(input.planId)

    await tx.audit.append({
      userId: input.staffId,
      action: 'MEMBERSHIP_PLAN_DELETE',
      entityType: 'MembershipPlan',
      entityId: input.planId,
      details: {
        name: existing.name,
        durationMonths: existing.durationMonths,
        price: Number(existing.price),
      },
    })

    return { deleted: true as const }
  })

  if (!result.ok) return result
  return ok(result.value)
}

export function mapDeleteMembershipPlanError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'PLAN_NOT_FOUND':
      return { code: 'PLAN_NOT_FOUND', message: 'Không tìm thấy gói hội viên', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
