import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma singleton: $transaction chạy work với fake store → toàn bộ
// use-case (pre-tx + in-tx) đi qua real adapters nhưng không cần database.
const fakeStore = vi.hoisted(() => ({
  shift: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  shiftParticipant: { updateMany: vi.fn(), upsert: vi.fn() },
  shiftTool: { upsert: vi.fn() },
  payment: { aggregate: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  activityLog: { create: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { closeShift } from '@/lib/shifts/use-cases/close-shift'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

const input = {
  shiftId: 'shift-1',
  staffId: 'staff-1',
  staffRole: 'STAFF' as const,
  username: 'nv_a',
  fullName: 'Nhân viên A',
  closingCash: 600000,
}

function resetMocks() {
  vi.clearAllMocks()
  // Pre-tx (findByIdForClose — có include): shift tồn tại, OPEN, người đóng là participant
  // In-tx (calculateExpectedCash — không include): chỉ cần openingCash
  fakeStore.shift.findUnique.mockImplementation((args: { include?: unknown }) =>
    args.include
      ? Promise.resolve({
          id: 'shift-1',
          status: 'OPEN',
          staffId: 'staff-1',
          participants: [{ staffId: 'staff-1' }],
        })
      : Promise.resolve({ id: 'shift-1', openingCash: 0 })
  )
  fakeStore.payment.aggregate.mockResolvedValue({ _sum: { grandTotal: 100000 } })
  // In-tx: shift.update trả shift CLOSED
  fakeStore.shift.update.mockResolvedValue({
    id: 'shift-1',
    staffId: 'staff-1',
    openSlot: null,
    openedAt: new Date('2026-08-07T08:00:00Z'),
    closedAt: new Date('2026-08-07T17:00:00Z'),
    openingCash: 0,
    closingCash: 600000,
    expectedCash: 100000,
    cashDifference: 500000,
    status: 'CLOSED',
    notes: null,
    staff: { id: 'staff-1', fullName: 'Nhân viên A' },
    participants: [],
  })
}

describe('closeShift', () => {
  beforeEach(resetMocks)

  it('trả SHIFT_NOT_FOUND khi ca không tồn tại', async () => {
    fakeStore.shift.findUnique.mockResolvedValue(null)
    const result = await closeShift(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SHIFT_NOT_FOUND' } })
    expect(fakeStore.shiftParticipant.updateMany).not.toHaveBeenCalled()
  })

  it('trả SHIFT_ALREADY_CLOSED khi ca đã đóng', async () => {
    fakeStore.shift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'CLOSED',
      staffId: 'staff-1',
      participants: [{ staffId: 'staff-1' }],
    })
    const result = await closeShift(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SHIFT_ALREADY_CLOSED' } })
  })

  it('trả FORBIDDEN khi STAFF không phải người mở ca và không tham gia', async () => {
    fakeStore.shift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'OPEN',
      staffId: 'staff-khac',
      participants: [{ staffId: 'staff-khac' }],
    })
    const result = await closeShift(input, repos)
    expect(result).toEqual({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('ADMIN được đóng ca của người khác', async () => {
    fakeStore.shift.findUnique.mockResolvedValue({
      id: 'shift-1',
      status: 'OPEN',
      staffId: 'staff-khac',
      participants: [],
    })
    const result = await closeShift({ ...input, staffRole: 'ADMIN' }, repos)
    expect(result.ok).toBe(true)
  })

  it('đóng ca thành công: markParticipantsLeft + close + audit', async () => {
    const result = await closeShift(input, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      id: 'shift-1',
      status: 'CLOSED',
      closingCash: 600000,
      expectedCash: 100000,
      cashDifference: 500000,
    })

    // 1. Đánh dấu participant rời ca
    expect(fakeStore.shiftParticipant.updateMany).toHaveBeenCalledWith({
      where: { shiftId: 'shift-1', leftAt: null },
      data: { leftAt: expect.any(Date) },
    })

    // 2. shift.update với status CLOSED + số liệu đối soát
    const updateCall = fakeStore.shift.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 'shift-1' })
    expect(updateCall.data).toMatchObject({
      status: 'CLOSED',
      closingCash: 600000,
      expectedCash: 100000,
      cashDifference: 500000,
      closedAt: expect.any(Date),
    })

    // 3. Audit SHIFT_CLOSE
    expect(fakeStore.activityLog.create).toHaveBeenCalledTimes(1)
    const auditData = fakeStore.activityLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('SHIFT_CLOSE')
    expect(auditData.details).toMatchObject({
      expectedCash: 100000,
      closingCash: 600000,
      cashDifference: 500000,
      closedBy: { userId: 'staff-1', username: 'nv_a', fullName: 'Nhân viên A', role: 'STAFF' },
    })
  })

  it('upsertToolCloseCount được gọi theo toolCounts', async () => {
    await closeShift({ ...input, toolCounts: [{ toolId: 'tool-1', openCount: 3 }] }, repos)
    expect(fakeStore.shiftTool.upsert).toHaveBeenCalledWith({
      where: { shiftId_toolId: { shiftId: 'shift-1', toolId: 'tool-1' } },
      update: { closeCount: 3 },
      create: { shiftId: 'shift-1', toolId: 'tool-1', openCount: 0, closeCount: 3 },
    })
  })
})
