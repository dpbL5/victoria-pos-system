// ── Use-case: updateCustomer — cập nhật thông tin khách hàng/hội viên ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { CustomerRecord } from '../ports'

export interface UpdateCustomerInput {
  staffId: string
  customerId: string
  fullName?: string
  phone?: string | null
  notes?: string
}

export interface UpdateCustomerResult {
  customer: CustomerRecord
}

/**
 * Cập nhật thông tin khách hàng (fullName, phone, notes).
 * - Tìm khách qua `findById` (loại bỏ khách đã xoá mềm) → 404 nếu không thấy.
 * - Ghi `customer.update` + `audit.append(CUSTOMER_UPDATE)` trong 1 transaction.
 * - Chuẩn hóa phone rỗng thành null.
 */
export async function updateCustomer(
  input: UpdateCustomerInput,
  deps: Repositories = repositories
): Promise<Result<UpdateCustomerResult>> {
  const { staffId, customerId, fullName, phone, notes } = input

  // ── Pre-transaction guard: khách phải tồn tại (chưa bị xoá mềm) ──
  const existing = await deps.customer.findById(customerId)
  if (!existing) return err('CUSTOMER_NOT_FOUND')

  // ── Build update data — chỉ gửi field được cung cấp, chuẩn hóa phone rỗng → null ──
  const updateData: { fullName?: string; phone?: string | null; notes?: string } = {}
  if (fullName !== undefined) updateData.fullName = fullName
  if (phone !== undefined) updateData.phone = phone || null
  if (notes !== undefined) updateData.notes = notes

  const result = await runInTransaction(async (tx) => {
    const customer = await tx.customer.update(customerId, updateData)

    await tx.audit.append({
      userId: staffId,
      action: 'CUSTOMER_UPDATE',
      entityType: 'Customer',
      entityId: customerId,
      details: {
        before: {
          fullName: existing.fullName,
          phone: existing.phone,
          notes: existing.notes,
        },
        after: {
          fullName: customer.fullName,
          phone: customer.phone,
          notes: customer.notes,
        },
      },
    })

    return customer
  })

  if (!result.ok) return result
  return ok({ customer: result.value })
}

export function mapUpdateCustomerError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'CUSTOMER_NOT_FOUND':
      return { code: 'CUSTOMER_NOT_FOUND', message: 'Không tìm thấy khách hàng', status: 404 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
