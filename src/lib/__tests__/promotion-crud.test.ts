import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma singleton (Pattern B) — use-case đi qua real adapters với fake store.
const fakeStore = vi.hoisted(() => ({
  promotionRule: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  activityLog: { create: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import {
  createPromotionRule,
  updatePromotionRule,
  deletePromotionRule,
} from '@/lib/promotions/use-cases/promotion-rule-crud'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

const validData = {
  name: 'Giảm giờ ngày thường',
  discountType: 'FIXED_PER_HOUR',
  discountValue: 20000,
  daysOfWeek: [1, 2, 3, 4, 5],
  hourFrom: 9,
  hourTo: 17,
  dayType: 'WEEKDAY',
  effectiveFrom: new Date('2026-07-01'),
  effectiveTo: null,
  isActive: true,
}

const existingRule = {
  id: 'promo-1',
  name: 'Giảm giờ ngày thường',
  discountType: 'FIXED_PER_HOUR',
  discountValue: 20000,
  daysOfWeek: [1, 2, 3, 4, 5],
  hourFrom: 9,
  hourTo: 17,
  dayType: 'WEEKDAY',
  effectiveFrom: new Date('2026-07-01'),
  effectiveTo: null,
  isActive: true,
}

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.promotionRule.create.mockResolvedValue({ id: 'promo-1', ...existingRule })
  fakeStore.promotionRule.findUnique.mockResolvedValue(existingRule)
  fakeStore.promotionRule.update.mockResolvedValue({ id: 'promo-1', ...existingRule })
  fakeStore.promotionRule.delete.mockResolvedValue(existingRule)
}

describe('createPromotionRule', () => {
  beforeEach(resetMocks)

  it('tạo khuyến mại + ghi audit PROMOTION_RULE_CREATE', async () => {
    const result = await createPromotionRule({ ...validData, staffId: 'staff-1' }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rule.id).toBe('promo-1')

    const auditData = fakeStore.activityLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('PROMOTION_RULE_CREATE')
    expect(auditData.entityType).toBe('PromotionRule')
  })
})

describe('updatePromotionRule', () => {
  beforeEach(resetMocks)

  it('trả PROMOTION_NOT_FOUND khi khuyến mại không tồn tại', async () => {
    fakeStore.promotionRule.findUnique.mockResolvedValue(null)
    const result = await updatePromotionRule(
      { staffId: 'staff-1', ruleId: 'promo-x', data: validData },
      repos
    )
    expect(result).toEqual({ ok: false, error: { code: 'PROMOTION_NOT_FOUND' } })
    expect(fakeStore.promotionRule.update).not.toHaveBeenCalled()
  })

  it('cập nhật thành công + ghi audit PROMOTION_RULE_UPDATE', async () => {
    const result = await updatePromotionRule(
      { staffId: 'staff-1', ruleId: 'promo-1', data: validData },
      repos
    )

    expect(result.ok).toBe(true)
    const auditData = fakeStore.activityLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('PROMOTION_RULE_UPDATE')
    expect(auditData.entityId).toBe('promo-1')
  })
})

describe('deletePromotionRule', () => {
  beforeEach(resetMocks)

  it('trả PROMOTION_NOT_FOUND khi khuyến mại không tồn tại', async () => {
    fakeStore.promotionRule.findUnique.mockResolvedValue(null)
    const result = await deletePromotionRule({ staffId: 'staff-1', ruleId: 'promo-x' }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PROMOTION_NOT_FOUND' } })
    expect(fakeStore.promotionRule.delete).not.toHaveBeenCalled()
  })

  it('xoá thành công + ghi audit PROMOTION_RULE_DELETE', async () => {
    const result = await deletePromotionRule({ staffId: 'staff-1', ruleId: 'promo-1' }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.deletedId).toBe('promo-1')

    const auditData = fakeStore.activityLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('PROMOTION_RULE_DELETE')
    expect(auditData.entityId).toBe('promo-1')
  })
})
