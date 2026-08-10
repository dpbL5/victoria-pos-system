// ── Use-case: deleteMember — xoá mềm hội viên ─────
import { err } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'

export interface DeleteMemberInput {
  staffId: string
  customerId: string
  now?: Date
}

export interface DeleteMemberResult {
  id: string
  fullName: string
  deletedAt: Date
}

/**
 * Xoá mềm hội viên: set `deletedAt` — hội viên ẩn khỏi danh sách/tìm kiếm/check-in,
 * nhưng mọi bản ghi tài chính (invoice/payment/membership) được giữ nguyên
 * để báo cáo doanh thu và đối soát ca không đổi.
 * Chặn xoá khi hội viên đang có phiên chơi ACTIVE.
 */
export async function deleteMember(
  input: DeleteMemberInput,
  deps: Repositories = repositories
): Promise<Result<DeleteMemberResult>> {
  const { staffId, customerId, now = new Date() } = input

  // ── Pha 1: Guard trước transaction ──
  const customer = await deps.customer.findByIdIncludingDeleted(customerId)
  if (!customer) return err('CUSTOMER_NOT_FOUND')
  if (customer.deletedAt) return err('MEMBER_ALREADY_DELETED')
  if (customer.type !== 'MEMBER') return err('NOT_A_MEMBER')

  const activeSession = await deps.session.findActiveByCustomer(customerId)
  if (activeSession) return err('MEMBER_HAS_ACTIVE_SESSION')

  // ── Pha 2: Transaction — set deletedAt + audit ──
  const result = await runInTransaction((tx) =>
    runDeleteMemberTx(tx, { staffId, customerId, fullName: customer.fullName, phone: customer.phone, now })
  )

  return result
}

/** Input cho transaction body — guards đã xong (pre-tx), chỉ cần ghi DB. Tách để test với fake repositories. */
export interface DeleteMemberTxInput {
  staffId: string
  customerId: string
  fullName: string
  phone: string | null
  now: Date
}

/** Thân transaction — set deletedAt + audit. Lỗi validation trong tx dùng fail() → rollback. */
export async function runDeleteMemberTx(
  tx: Repositories,
  input: DeleteMemberTxInput
): Promise<DeleteMemberResult> {
  const { staffId, customerId, fullName, phone, now } = input

  await tx.customer.softDelete(customerId, now)
  await tx.audit.append({
    userId: staffId,
    action: 'MEMBER_DELETE',
    entityType: 'Customer',
    entityId: customerId,
    details: {
      fullName,
      phone,
      deletedAt: now.toISOString(),
    },
  })

  return {
    id: customerId,
    fullName,
    deletedAt: now,
  }
}

export function mapDeleteMemberError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'CUSTOMER_NOT_FOUND':
      return { code: 'CUSTOMER_NOT_FOUND', message: 'Không tìm thấy khách hàng', status: 404 }
    case 'MEMBER_ALREADY_DELETED':
      return { code: 'MEMBER_ALREADY_DELETED', message: 'Hội viên đã bị xoá rồi', status: 400 }
    case 'NOT_A_MEMBER':
      return { code: 'NOT_A_MEMBER', message: 'Chỉ xoá được hội viên', status: 400 }
    case 'MEMBER_HAS_ACTIVE_SESSION':
      return {
        code: 'MEMBER_HAS_ACTIVE_SESSION',
        message: 'Hội viên đang có phiên chơi chưa kết thúc. Hãy thu tiền trước khi xoá.',
        status: 409,
      }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
