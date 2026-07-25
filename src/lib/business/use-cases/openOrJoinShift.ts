import { logActivity } from '@/lib/business/audit'
import {
  findOpenOperationalShift,
  findOpenShiftForStaff,
  shiftWithParticipantsInclude,
} from '@/lib/business/shifts'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import type { ToolCountEntry } from '@/lib/validations/shift'

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

export async function openOrJoinShift({
  staffId,
  openingCash,
  notes,
  toolCounts,
}: OpenOrJoinShiftInput): Promise<OpenOrJoinShiftResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const currentShift = await findOpenShiftForStaff(tx, staffId)
        if (currentShift) {
          return { shift: currentShift, created: false, joined: false }
        }

        const openShift = await findOpenOperationalShift(tx)
        if (openShift) {
          await tx.shiftParticipant.upsert({
            where: {
              shiftId_staffId: {
                shiftId: openShift.id,
                staffId,
              },
            },
            update: {
              leftAt: null,
              role: 'STAFF',
            },
            create: {
              shiftId: openShift.id,
              staffId,
              role: 'STAFF',
            },
          })

          await logActivity(tx, {
            userId: staffId,
            action: 'SHIFT_JOIN',
            entityType: 'Shift',
            entityId: openShift.id,
            details: { joinedAt: new Date().toISOString() },
          })

          const joinedShift = await tx.shift.findUniqueOrThrow({
            where: { id: openShift.id },
            include: shiftWithParticipantsInclude,
          })

          return { shift: joinedShift, created: false, joined: true }
        }

        const newShift = await tx.shift.create({
          data: {
            staffId,
            openSlot: 'OPERATIONAL',
            openingCash,
            notes,
            participants: {
              create: {
                staffId,
                role: 'LEAD',
              },
            },
            ...(toolCounts && toolCounts.length > 0
              ? {
                  toolCounts: {
                    createMany: {
                      data: toolCounts.map((tc) => ({
                        toolId: tc.toolId,
                        openCount: tc.openCount,
                      })),
                    },
                  },
                }
              : {}),
          },
          include: shiftWithParticipantsInclude,
        })

        await logActivity(tx, {
          userId: staffId,
          action: 'SHIFT_OPEN',
          entityType: 'Shift',
          entityId: newShift.id,
          details: { openingCash },
        })

        return { shift: newShift, created: true, joined: false }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

      return {
        shift: {
          ...result.shift,
          openingCash: Number(result.shift.openingCash),
          closingCash: result.shift.closingCash != null ? Number(result.shift.closingCash) : null,
          expectedCash: result.shift.expectedCash != null ? Number(result.shift.expectedCash) : null,
          cashDifference: result.shift.cashDifference != null ? Number(result.shift.cashDifference) : null,
        },
        created: result.created,
        joined: result.joined,
      } as OpenOrJoinShiftResult
    } catch (error) {
      const isRetryable =
        error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === 'P2002' || error.code === 'P2034')

      if (!isRetryable || attempt === 1) {
        throw new Error(`SHIFT_OPEN_FAILED: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`)
      }
    }
  }

  throw new Error('SHIFT_OPEN_FAILED')
}

export function mapOpenOrJoinShiftError(error: Error): { code: string; message: string; status: number } {
  return { code: 'SHIFT_OPEN_FAILED', message: error.message || 'Không mở được ca', status: 500 }
}
