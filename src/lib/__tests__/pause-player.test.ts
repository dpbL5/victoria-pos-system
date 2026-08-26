import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playerPausedSeconds, groupPausedSeconds, sessionPauseSeconds } from '@/lib/sessions/ports'

const fakeStore = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  sessionPricingGroup: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  sessionPlayer: { update: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
  shift: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  shiftParticipant: { create: vi.fn() },
  product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  stockMovement: { create: vi.fn() },
  invoice: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  invoiceItem: { create: vi.fn(), findMany: vi.fn() },
  payment: { create: vi.fn(), findMany: vi.fn() },
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

import { pausePlayer, resumePlayer, pauseSession, resumeSession } from '@/lib/sessions/use-cases/pause-session'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

const NOW = new Date('2026-08-10T12:00:00Z')

function makeMultiPlayerSession() {
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
  fakeStore.session.findUnique.mockResolvedValue(makeMultiPlayerSession())
  fakeStore.sessionPlayer.update.mockResolvedValue({})
  fakeStore.sessionPlayer.updateMany.mockResolvedValue({ count: 2 })
}

describe('pausePlayer', () => {
  beforeEach(resetMocks)

  it('trả SESSION_NOT_FOUND khi phiên không tồn tại', async () => {
    fakeStore.session.findUnique.mockResolvedValue(null)
    const result = await pausePlayer({ sessionId: 'x', playerId: 'player-1', staffId: 'staff-1', now: NOW }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SESSION_NOT_FOUND' } })
  })

  it('trả SESSION_NOT_ACTIVE khi phiên đã kết thúc', async () => {
    fakeStore.session.findUnique.mockResolvedValue({ ...makeMultiPlayerSession(), status: 'COMPLETED' })
    const result = await pausePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-1', now: NOW }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SESSION_NOT_ACTIVE' } })
  })

  it('phiên 1 người: pausePlayer vẫn hoạt động (có player row — dùng chung luồng nhóm)', async () => {
    fakeStore.session.findUnique.mockResolvedValue({ ...makeMultiPlayerSession(), playerCount: 1 })
    const result = await pausePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-1', now: NOW }, repos)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ sessionId: 'sess-1', playerId: 'player-1', pausedAt: NOW })
    expect(fakeStore.sessionPlayer.update).toHaveBeenCalledWith({
      where: { id: 'player-1' },
      data: { pausedAt: NOW },
    })
  })

  it('trả PLAYER_NOT_FOUND khi player không thuộc session', async () => {
    const result = await pausePlayer({ sessionId: 'sess-1', playerId: 'player-999', staffId: 'staff-1', now: NOW }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PLAYER_NOT_FOUND' } })
  })

  it('trả PLAYER_ALREADY_PAUSED khi player đã tạm dừng', async () => {
    fakeStore.session.findUnique.mockResolvedValue({
      ...makeMultiPlayerSession(),
      pricingGroups: [{
        ...makeMultiPlayerSession().pricingGroups[0],
        players: [{ ...makeMultiPlayerSession().pricingGroups[0].players[0], pausedAt: NOW }],
      }],
    })
    const result = await pausePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-1', now: NOW }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PLAYER_ALREADY_PAUSED' } })
  })

  it('pause thành công: set pausedAt + ghi audit PLAYER_PAUSE', async () => {
    const result = await pausePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-1', now: NOW }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ sessionId: 'sess-1', playerId: 'player-1', pausedAt: NOW })

    expect(fakeStore.sessionPlayer.update).toHaveBeenCalledWith({
      where: { id: 'player-1' },
      data: { pausedAt: NOW },
    })
    const auditCall = fakeStore.activityLog.create.mock.calls[0][0]
    expect(auditCall.data).toMatchObject({ userId: 'staff-1', action: 'PLAYER_PAUSE', entityType: 'SessionPlayer', entityId: 'player-1' })
  })
})

describe('resumePlayer', () => {
  beforeEach(resetMocks)

  it('trả PLAYER_NOT_PAUSED khi player chưa tạm dừng', async () => {
    const result = await resumePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-1', now: NOW }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PLAYER_NOT_PAUSED' } })
  })

  it('resume thành công: chỉ tính elapsed của lần pause này, increment, clear pausedAt + audit', async () => {
    // Player-1 paused từ 11:00 → resume lúc 12:00 = 3600 giây (600 là totalPausedSeconds cũ)
    fakeStore.session.findUnique.mockResolvedValue({
      ...makeMultiPlayerSession(),
      pricingGroups: [{
        ...makeMultiPlayerSession().pricingGroups[0],
        players: [{
          ...makeMultiPlayerSession().pricingGroups[0].players[0],
          pausedAt: new Date('2026-08-10T11:00:00Z'),
          totalPausedSeconds: 600,
        }],
      }],
    })
    const result = await resumePlayer({ sessionId: 'sess-1', playerId: 'player-1', staffId: 'staff-1', now: NOW }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Chỉ elapsed lần pause này: 12:00 - 11:00 = 3600 (KHÔNG cộng 600 cũ — đã increment trước đó)
    expect(result.value.pausedSeconds).toBe(3600)

    expect(fakeStore.sessionPlayer.update).toHaveBeenCalledWith({
      where: { id: 'player-1' },
      data: { pausedAt: null, totalPausedSeconds: { increment: 3600 } },
    })
    const auditCall = fakeStore.activityLog.create.mock.calls[0][0]
    expect(auditCall.data).toMatchObject({ userId: 'staff-1', action: 'PLAYER_RESUME', entityId: 'player-1', details: { pausedSeconds: 3600 } })
  })
})

describe('pauseSession / resumeSession — đồng bộ session pause xuống player', () => {
  beforeEach(resetMocks)

  it('pauseSession: set Session.pausedAt + đồng bộ pausedAt cho player chưa checkout', async () => {
    const result = await pauseSession({ sessionId: 'sess-1', staffId: 'staff-1', now: NOW }, repos)

    expect(result.ok).toBe(true)
    expect(fakeStore.session.update).toHaveBeenCalledWith({ where: { id: 'sess-1' }, data: { pausedAt: NOW } })
    expect(fakeStore.sessionPlayer.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'sess-1', checkedOutAt: null },
      data: { pausedAt: NOW },
    })
  })

  it('resumeSession: increment session + increment/clear tất cả player chưa checkout', async () => {
    fakeStore.session.findUnique.mockResolvedValue({
      ...makeMultiPlayerSession(),
      pausedAt: new Date('2026-08-10T11:00:00Z'),
      totalPausedSeconds: 600,
    })
    const result = await resumeSession({ sessionId: 'sess-1', staffId: 'staff-1', now: NOW }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.pausedSeconds).toBe(3600)
    expect(fakeStore.session.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { pausedAt: null, totalPausedSeconds: { increment: 3600 } },
    })
    expect(fakeStore.sessionPlayer.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'sess-1', checkedOutAt: null },
      data: { pausedAt: null, totalPausedSeconds: { increment: 3600 } },
    })
  })

  it('resumeSession: trả SESSION_NOT_PAUSED khi session chưa paused', async () => {
    const result = await resumeSession({ sessionId: 'sess-1', staffId: 'staff-1', now: NOW }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'SESSION_NOT_PAUSED' } })
  })
})

describe('sessionPauseSeconds (pure helper)', () => {
  it('session chưa paused: trả totalPausedSeconds', () => {
    expect(sessionPauseSeconds({ pausedAt: null, totalPausedSeconds: 900 }, NOW)).toBe(900)
  })

  it('session đang paused: cộng elapsed từ pausedAt', () => {
    // 12:00 - 11:30 = 1800 + 900 tích lũy
    expect(sessionPauseSeconds({ pausedAt: new Date('2026-08-10T11:30:00Z'), totalPausedSeconds: 900 }, NOW)).toBe(2700)
  })
})

describe('playerPausedSeconds / groupPausedSeconds (pure helpers)', () => {
  it('player đang chạy: chỉ totalPausedSeconds đã tích lũy', () => {
    expect(playerPausedSeconds({ pausedAt: null, totalPausedSeconds: 300 }, NOW)).toBe(300)
  })

  it('player đang tạm dừng: cộng thêm elapsed từ pausedAt', () => {
    const pausedAt = new Date('2026-08-10T11:30:00Z')
    // 12:00 - 11:30 = 1800 giây + 300 đã tích lũy
    expect(playerPausedSeconds({ pausedAt, totalPausedSeconds: 300 }, NOW)).toBe(2100)
  })

  it('group = tổng các player (chạy + tạm dừng)', () => {
    const group = {
      players: [
        { pausedAt: null, totalPausedSeconds: 120 },
        { pausedAt: new Date('2026-08-10T11:30:00Z'), totalPausedSeconds: 60 },
      ],
    }
    // 120 + (1800 + 60) = 1980
    expect(groupPausedSeconds(group, NOW)).toBe(1980)
  })
})
