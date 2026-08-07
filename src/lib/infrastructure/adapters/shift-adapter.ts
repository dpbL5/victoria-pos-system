// ── Adapter: implement ShiftRepository bằng Prisma ─────
import type { Prisma } from '@/generated/prisma/client'
import type { ShiftStore } from '../store-types'
import { fail } from '../db-helpers'
import {
  calculateExpectedCash as calculateExpectedCashHelper,
  findOpenOperationalShift,
  findOpenShiftForStaff,
  shiftWithParticipantsInclude,
} from '@/lib/shifts'
import type { ShiftRepository } from '@/lib/shifts'

type ShiftAdapterStore = ShiftStore & Pick<Prisma.TransactionClient, 'payment'>

export function createShiftRepository(store: ShiftAdapterStore): ShiftRepository {
  return {
    findOpenForStaff: (staffId) => findOpenShiftForStaff(store, staffId),
    findOpenOperational: () => findOpenOperationalShift(store),

    async findByIdForClose(shiftId) {
      const shift = await store.shift.findUnique({
        where: { id: shiftId },
        include: {
          participants: {
            where: { leftAt: null },
            select: { staffId: true },
          },
        },
      })
      return shift
    },

    async calculateExpectedCash(shiftId) {
      const expected = await calculateExpectedCashHelper(store, shiftId)
      if (expected === null) fail('SHIFT_NOT_FOUND')
      return expected
    },

    async markParticipantsLeft(shiftId, leftAt) {
      await store.shiftParticipant.updateMany({
        where: { shiftId, leftAt: null },
        data: { leftAt },
      })
    },

    async upsertToolCloseCount(shiftId, toolId, closeCount) {
      await store.shiftTool.upsert({
        where: {
          shiftId_toolId: { shiftId, toolId },
        },
        update: { closeCount },
        create: {
          shiftId,
          toolId,
          openCount: 0,
          closeCount,
        },
      })
    },

    async close(shiftId, data) {
      return store.shift.update({
        where: { id: shiftId },
        data: {
          status: 'CLOSED',
          openSlot: null,
          closedAt: data.closedAt,
          closingCash: data.closingCash,
          expectedCash: data.expectedCash,
          cashDifference: data.cashDifference,
          notes: data.notes,
        },
        include: shiftWithParticipantsInclude,
      })
    },

    async upsertParticipant(shiftId, staffId) {
      await store.shiftParticipant.upsert({
        where: {
          shiftId_staffId: { shiftId, staffId },
        },
        update: { leftAt: null, role: 'STAFF' },
        create: { shiftId, staffId, role: 'STAFF' },
      })
    },

    findByIdOrThrow: (shiftId) =>
      store.shift.findUniqueOrThrow({
        where: { id: shiftId },
        include: shiftWithParticipantsInclude,
      }),

    async createWithLead(data) {
      return store.shift.create({
        data: {
          staffId: data.staffId,
          openSlot: 'OPERATIONAL',
          openingCash: data.openingCash,
          notes: data.notes,
          participants: {
            create: {
              staffId: data.staffId,
              role: 'LEAD',
            },
          },
          ...(data.toolCounts && data.toolCounts.length > 0
            ? {
                toolCounts: {
                  createMany: {
                    data: data.toolCounts.map((tc) => ({
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
    },
  }
}
