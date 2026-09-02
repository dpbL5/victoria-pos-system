// ── Adapter: implement ShiftRepository bằng Prisma ─────
import type { Prisma } from '@/generated/prisma/client'
import type { ShiftStore } from '../store-types'
import { fail } from '../db-helpers'
import {
  calculateExpectedCash as calculateExpectedCashHelper,
  findOpenOperationalShift,
  findOpenShiftForStaff,
  shiftWithAllParticipantsInclude,
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

    async upsertToolOpenCount(shiftId, toolId, openCount) {
      await store.shiftTool.upsert({
        where: {
          shiftId_toolId: { shiftId, toolId },
        },
        update: { openCount },
        create: {
          shiftId,
          toolId,
          openCount,
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

    async findByIdWithToolStats(shiftId) {
      const shift = await store.shift.findUnique({
        where: { id: shiftId },
        include: {
          staff: { select: { id: true, fullName: true } },
          participants: {
            include: { staff: { select: { id: true, fullName: true } } },
            orderBy: { joinedAt: 'asc' },
          },
          toolCounts: {
            include: { tool: { select: { id: true, name: true, quantity: true, isRequired: true } } },
            orderBy: { createdAt: 'asc' },
          },
          _count: { select: { sessions: true } },
        },
      })
      return shift as unknown as Awaited<ReturnType<ShiftRepository['findByIdWithToolStats']>>
    },

    async findByIdAccess(shiftId) {
      return store.shift.findUnique({
        where: { id: shiftId },
        select: { id: true, staffId: true, status: true, participants: { select: { staffId: true } } },
      })
    },

    async findManyWithCount(input) {
      const where: Record<string, unknown> = {
        openedAt: { gte: input.from, lt: input.to },
      }
      if (input.status) where.status = input.status
      if (input.staffId) {
        where.OR = [
          { staffId: input.staffId },
          { participants: { some: { staffId: input.staffId } } },
        ]
      }

      const [rows, total] = await Promise.all([
        store.shift.findMany({
          where,
          include: input.includeParticipants === 'all'
            ? shiftWithAllParticipantsInclude
            : shiftWithParticipantsInclude,
          orderBy: { openedAt: 'desc' },
          skip: input.skip,
          take: input.take,
        }),
        store.shift.count({ where }),
      ])
      return { rows: rows as unknown as Awaited<ReturnType<ShiftRepository['findManyWithCount']>>['rows'], total }
    },

    async findByIdExport(shiftId) {
      return store.shift.findUnique({
        where: { id: shiftId },
        select: { id: true, status: true, openedAt: true },
      })
    },

    async adjustCashDifference(shiftId, data) {
      const updated = await store.shift.update({
        where: { id: shiftId },
        data: {
          cashDifference: data.cashDifference,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        select: {
          id: true,
          cashDifference: true,
          notes: true,
          updatedAt: true,
        },
      })
      return {
        ...updated,
        cashDifference: Number(updated.cashDifference),
      }
    },
  }
}
