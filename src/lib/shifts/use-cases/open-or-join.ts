// ── Use-case: openOrJoinShift — mở ca mới hoặc tham gia ca đang mở ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { Prisma } from '@/generated/prisma/client'
import type { ToolCountEntry } from '../validations'

export interface OpenOrJoinShiftInput {
  staffId: string
  openingCash: number
  notes?: string
  toolCounts?: ToolCountEntry[]
}

export interface OpenOrJoinShiftResult {
  shift: {
    id: string
    staffId: string
    openSlot: string | null
    openedAt: Date
    closedAt: Date | null
    openingCash: number
    closingCash: number | null
    expectedCash: number | null
    cashDifference: number | null
    status: 'OPEN' | 'CLOSED'
    notes: string | null
    staff: { id: string; fullName: string } | null
    participants: Array<{
      id: string
      role: 'LEAD' | 'STAFF'
      joinedAt: Date
      leftAt: Date | null
      staff: { id: string; fullName: string }
    }>
  }
  created: boolean
  joined: boolean
}

/**
 * Mở ca mới nếu chưa có ca nào; tham gia ca quầy đang mở nếu có.
 * Dùng Serializable isolation + retry 2 lần để tránh race tạo ca trùng
 * (P2002/P2034).
 *
 * Không nhận deps: Repositories vì toàn bộ logic nằm trong transaction —
 * repos được inject bởi runInTransaction (giống voidInvoice).
 */
export async function openOrJoinShift(
  input: OpenOrJoinShiftInput
): Promise<Result<OpenOrJoinShiftResult>> {
  const { staffId, openingCash, notes, toolCounts } = input

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await runInTransaction(async (tx) => {
        const currentShift = await tx.shift.findOpenForStaff(staffId)
        if (currentShift) {
          return { shift: currentShift, created: false, joined: false }
        }

        const openShift = await tx.shift.findOpenOperational()
        if (openShift) {
          await tx.shift.upsertParticipant(openShift.id, staffId)

          await tx.audit.append({
            userId: staffId,
            action: 'SHIFT_JOIN',
            entityType: 'Shift',
            entityId: openShift.id,
            details: { joinedAt: new Date().toISOString() },
          })

          const joinedShift = await tx.shift.findByIdOrThrow(openShift.id)
          return { shift: joinedShift, created: false, joined: true }
        }

        const newShift = await tx.shift.createWithLead({ staffId, openingCash, notes, toolCounts })

        await tx.audit.append({
          userId: staffId,
          action: 'SHIFT_OPEN',
          entityType: 'Shift',
          entityId: newShift.id,
          details: { openingCash },
        })

        return { shift: newShift, created: true, joined: false }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

      if (!result.ok) return result
      const value = result.value
      return ok({
        shift: {
          ...value.shift,
          openingCash: Number(value.shift.openingCash),
          closingCash: value.shift.closingCash != null ? Number(value.shift.closingCash) : null,
          expectedCash: value.shift.expectedCash != null ? Number(value.shift.expectedCash) : null,
          cashDifference: value.shift.cashDifference != null ? Number(value.shift.cashDifference) : null,
        } as OpenOrJoinShiftResult['shift'],
        created: value.created,
        joined: value.joined,
      })
    } catch (error) {
      const isRetryable =
        error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === 'P2002' || error.code === 'P2034')

      if (!isRetryable || attempt === 1) {
        return err('SHIFT_OPEN_FAILED', error instanceof Error ? error.message : 'Lỗi không xác định')
      }
    }
  }

  return err('SHIFT_OPEN_FAILED')
}

export function mapOpenOrJoinShiftError(error: DomainError): HttpErrorInfo {
  return { code: 'SHIFT_OPEN_FAILED', message: error.detail || 'Không mở được ca', status: 500 }
}
