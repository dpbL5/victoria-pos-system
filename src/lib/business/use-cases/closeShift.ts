import { logActivity } from '@/lib/business/audit'
import { calculateExpectedCash, shiftWithParticipantsInclude } from '@/lib/business/shifts'
import { prisma } from '@/lib/prisma'
import type { ToolCountEntry } from '@/lib/validations/shift'

export interface CloseShiftInput {
  shiftId: string
  staffId: string
  staffRole: 'ADMIN' | 'STAFF'
  username: string
  fullName: string
  closingCash: number
  notes?: string
  toolCounts?: ToolCountEntry[]
}

export interface CloseShiftResult {
  id: string
  status: 'CLOSED'
  closedAt: Date
  closingCash: number
  expectedCash: number
  cashDifference: number
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

export async function closeShift({
  shiftId,
  staffId,
  staffRole,
  username,
  fullName,
  closingCash,
  notes,
  toolCounts,
}: CloseShiftInput): Promise<CloseShiftResult> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      participants: {
        where: { leftAt: null },
        select: { staffId: true },
      },
    },
  })

  if (!shift) {
    throw new Error('SHIFT_NOT_FOUND')
  }
  if (shift.status !== 'OPEN') {
    throw new Error('SHIFT_ALREADY_CLOSED')
  }

  const isActiveParticipant = shift.participants.some(
    (participant) => participant.staffId === staffId
  )

  if (staffRole !== 'ADMIN' && shift.staffId !== staffId && !isActiveParticipant) {
    throw new Error('FORBIDDEN')
  }

  const closedAt = new Date()

  const updated = await prisma.$transaction(async (tx) => {
    const expectedCash = await calculateExpectedCash(tx, shiftId)
    const cashDifference = closingCash - expectedCash

    await tx.shiftParticipant.updateMany({
      where: {
        shiftId,
        leftAt: null,
      },
      data: {
        leftAt: closedAt,
      },
    })

    if (toolCounts && toolCounts.length > 0) {
      for (const tc of toolCounts) {
        await tx.shiftTool.upsert({
          where: {
            shiftId_toolId: {
              shiftId,
              toolId: tc.toolId,
            },
          },
          update: {
            closeCount: tc.openCount,
          },
          create: {
            shiftId,
            toolId: tc.toolId,
            openCount: 0,
            closeCount: tc.openCount,
          },
        })
      }
    }

    const closedShift = await tx.shift.update({
      where: { id: shiftId },
      data: {
        status: 'CLOSED',
        openSlot: null,
        closedAt,
        closingCash,
        expectedCash,
        cashDifference,
        notes,
      },
      include: shiftWithParticipantsInclude,
    })

    await logActivity(tx, {
      userId: staffId,
      action: 'SHIFT_CLOSE',
      entityType: 'Shift',
      entityId: shiftId,
      details: {
        closedBy: {
          userId: staffId,
          username,
          fullName,
          role: staffRole,
        },
        expectedCash,
        closingCash,
        cashDifference,
        closedAt: closedAt.toISOString(),
      },
    })

    return closedShift
  })

  return {
    ...updated,
    closingCash: Number(updated.closingCash),
    expectedCash: Number(updated.expectedCash),
    cashDifference: Number(updated.cashDifference),
  } as CloseShiftResult
}

export function mapCloseShiftError(error: Error): { code: string; message: string; status: number } {
  const message = error.message

  if (message === 'SHIFT_NOT_FOUND') {
    return { code: 'SHIFT_NOT_FOUND', message: 'Không tìm thấy ca làm', status: 404 }
  }
  if (message === 'SHIFT_ALREADY_CLOSED') {
    return { code: 'SHIFT_ALREADY_CLOSED', message: 'Ca làm đã đóng', status: 400 }
  }
  if (message === 'FORBIDDEN') {
    return { code: 'FORBIDDEN', message: 'Không có quyền đóng ca này', status: 403 }
  }

  return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
}
