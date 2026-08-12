import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeStore = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  sessionPricingGroup: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  sessionPlayer: { update: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
  shift: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  shiftParticipant: { create: vi.fn() },
  product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  stockMovement: { create: vi.fn() },
  invoice: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  invoiceItem: { create: vi.fn(), findMany: vi.fn() },
  payment: { create: vi.fn(), findMany: vi.fn() },
  membershipPayment: { create: vi.fn() },
  membership: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  membershipPlan: { findUnique: vi.fn(), findMany: vi.fn() },
  customer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  appSetting: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  pricingRule: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  pricingTier: { findMany: vi.fn(), create: vi.fn() },
  promotionRule: { findUnique: vi.fn(), findMany: vi.fn() },
  activityLog: { create: vi.fn() },
  tool: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  shiftTool: { findUnique: vi.fn(), upsert: vi.fn() },
  cashflowEntry: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { renamePlayer } from '@/lib/sessions/use-cases/rename-player'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

function makeActiveSession() {
  return {
    id: 'sess-1',
    customerId: 'cust-1',
    customerName: null,
    membershipId: null,
    staffId: 'staff-1',
    shiftId: 'shift-1',
    startTime: new Date('2026-08-10T10:00:00Z'),
    endTime: null,
    status: 'ACTIVE',
    playerCount: 2,
    hourlyRate: 50000,
    customer: { id: 'cust-1', fullName: 'Khách A', type: 'WALK_IN' },
    membership: null,
    pricingGroups: [
      {
        id: 'group-1',
        label: 'Nhóm 1',
        playerCount: 2,
        remainingCount: 2,
        hourlyRate: 50000,
        pricingRuleId: 'rule-1',
        pricingSnapshot: null,
        players: [
          { id: 'player-1', name: null, pausedAt: null, totalPausedSeconds: 0, checkedOutAt: null, sessionId: 'sess-1', groupId: 'group-1', createdAt: new Date(), updatedAt: new Date() },
          { id: 'player-2', name: 'Minh', pausedAt: null, totalPausedSeconds: 0, checkedOutAt: null, sessionId: 'sess-1', groupId: 'group-1', createdAt: new Date(), updatedAt: new Date() },
        ],
      },
    ],
  }
}

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.session.findUnique.mockResolvedValue(makeActiveSession())
  fakeStore.sessionPlayer.update.mockResolvedValue({})
  fakeStore.shift.findUnique.mockResolvedValue({
    id: 'shift-1',
    staffId: 'staff-2',
    status: 'OPEN',
    participants: [{ staffId: 'staff-2' }],
  })
}

describe('renamePlayer', () => {
  beforeEach(resetMocks)

  it('trả SESSION_NOT_FOUND khi phiên không tồn tại', async () => {
    fakeStore.session.findUnique.mockResolvedValue(null)
    const result = await renamePlayer({ sessionId: 'x', playerId: 'player-1', staffId: 'staff-1', role: 'ADMIN', name: 'Lan' }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SESSION_NOT_FOUND' } })
  })

  it('trả SESSION_NOT_ACTIVE khi phiên đã kết thúc', async () => {
    fakeStore.session.findUnique.mockResolvedValue({ ...makeActiveSession(), status: 'COMPLETED' })
    const result = await renamePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-1', role: 'ADMIN', name: 'Lan' }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SESSION_NOT_ACTIVE' } })
  })

  it('trả PLAYER_NOT_FOUND khi player không thuộc session', async () => {
    const result = await renamePlayer({ sessionId: 'sess-1', playerId: 'player-999', staffId: 'staff-1', role: 'ADMIN', name: 'Lan' }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PLAYER_NOT_FOUND' } })
  })

  it('trả FORBIDDEN khi STAFF không phải owner và phiên không gắn ca', async () => {
    // staff-3 không tạo phiên, session không gắn shift → không có quyền
    fakeStore.session.findUnique.mockResolvedValue({ ...makeActiveSession(), shiftId: null })
    const result = await renamePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-3', role: 'STAFF', name: 'Lan' }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('STAFF là owner vẫn được đổi tên (không cần check ca)', async () => {
    fakeStore.session.findUnique.mockResolvedValue({ ...makeActiveSession(), shiftId: null })
    const result = await renamePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-1', role: 'STAFF', name: 'Lan' }, repos)
    expect(result.ok).toBe(true)
  })

  it('đổi tên thành công: update theo đúng playerId + ghi audit PLAYER_RENAME', async () => {
    const result = await renamePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-1', role: 'ADMIN', name: '  Lan  ' }, repos)
    expect(result).toEqual({
      ok: true,
      value: { id: 'player-1', name: 'Lan' },
    })
    // Update đúng theo id — giữ nguyên định danh timer/pause/pricing
    expect(fakeStore.sessionPlayer.update).toHaveBeenCalledWith({
      where: { id: 'player-1' },
      data: { name: 'Lan' },
    })
    // Audit với previousName (null) + newName
    expect(fakeStore.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'PLAYER_RENAME',
        entityType: 'SessionPlayer',
        entityId: 'player-1',
      }),
    }))
  })

  it('đổi tên người đã có tên: audit ghi previousName cũ', async () => {
    await renamePlayer({ sessionId: 'sess-1', playerId: 'player-2', staffId: 'staff-1', role: 'ADMIN', name: 'Minh Anh' }, repos)
    expect(fakeStore.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        details: expect.objectContaining({ previousName: 'Minh', newName: 'Minh Anh' }),
      }),
    }))
  })

  it('tên rỗng → lưu null (UI fallback "Người N")', async () => {
    const result = await renamePlayer({ sessionId: 'sess-1', playerId: 'player-2', staffId: 'staff-1', role: 'ADMIN', name: '   ' }, repos)
    expect(result).toEqual({ ok: true, value: { id: 'player-2', name: null } })
    expect(fakeStore.sessionPlayer.update).toHaveBeenCalledWith({
      where: { id: 'player-2' },
      data: { name: null },
    })
  })
})
