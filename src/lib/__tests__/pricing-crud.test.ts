import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma singleton: $transaction chạy work với fake store → use-case (pre-tx
// + in-tx) đi qua real adapters nhưng không cần database. Pattern B (giống register-member).
const fakeStore = vi.hoisted(() => ({
  pricingRule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  pricingTier: { createMany: vi.fn(), deleteMany: vi.fn() },
  activityLog: { create: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import {
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
} from '@/lib/pricing/use-cases/pricing-rule-crud'
import { createRepositories } from '@/lib/infrastructure/repositories'

const repos = createRepositories(fakeStore as never)

const validInput = {
  staffId: 'staff-1',
  name: 'Giờ thường',
  hourFrom: 9,
  hourTo: 17,
  ratePerHour: 150000,
  daysOfWeek: [1, 2, 3, 4, 5],
  dayType: 'WEEKDAY' as const,
  effectiveFrom: new Date('2026-07-01'),
  effectiveTo: null,
}

const existingRule = {
  id: 'rule-1',
  name: 'Giờ thường',
  hourFrom: 9,
  hourTo: 17,
  ratePerHour: 150000,
  daysOfWeek: [1, 2, 3, 4, 5],
  dayType: 'WEEKDAY',
  effectiveFrom: new Date('2026-07-01'),
  effectiveTo: null,
}

function resetMocks() {
  vi.clearAllMocks()
  // createWithTiers trả rule mới
  fakeStore.pricingRule.create.mockResolvedValue({ id: 'rule-1', ...existingRule })
  // findOverlapping (create/update) không có rule trùng
  fakeStore.pricingRule.findMany.mockResolvedValue([])
  // findById (update/delete) trả rule tồn tại
  fakeStore.pricingRule.findUnique.mockResolvedValue(existingRule)
  fakeStore.pricingRule.update.mockResolvedValue({ id: 'rule-1', ...existingRule })
  fakeStore.pricingRule.delete.mockResolvedValue(existingRule)
  fakeStore.pricingTier.createMany.mockResolvedValue({ count: 0 })
  fakeStore.pricingTier.deleteMany.mockResolvedValue({ count: 0 })
}

describe('createPricingRule', () => {
  beforeEach(resetMocks)

  it('tạo rule thành công + ghi audit PRICING_RULE_CREATE', async () => {
    const result = await createPricingRule(validInput, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rule.id).toBe('rule-1')
    expect(result.value.warnings).toEqual([])

    expect(fakeStore.pricingRule.create).toHaveBeenCalledTimes(1)
    const auditData = fakeStore.activityLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('PRICING_RULE_CREATE')
    expect(auditData.entityType).toBe('PricingRule')
    expect(auditData.entityId).toBe('rule-1')
  })

  it('tạo rule trùng khung giờ → ok nhưng warnings chứa cảnh báo trùng', async () => {
    fakeStore.pricingRule.findMany.mockResolvedValue([
      { id: 'rule-x', name: 'Giờ cũ', daysOfWeek: [1, 2, 3, 4, 5], hourFrom: 9, hourTo: 17, effectiveFrom: new Date('2026-07-01'), effectiveTo: null },
    ])

    const result = await createPricingRule(validInput, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.warnings).toEqual(['Trùng khung giờ với quy tắc "Giờ cũ"'])
  })
})

describe('updatePricingRule', () => {
  beforeEach(resetMocks)

  it('trả PRICING_RULE_NOT_FOUND khi rule không tồn tại', async () => {
    fakeStore.pricingRule.findUnique.mockResolvedValue(null)
    const result = await updatePricingRule({ staffId: 'staff-1', ruleId: 'rule-x', name: 'Mới' }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PRICING_RULE_NOT_FOUND' } })
    expect(fakeStore.pricingRule.update).not.toHaveBeenCalled()
  })

  it('cập nhật thành công + ghi audit PRICING_RULE_UPDATE', async () => {
    const result = await updatePricingRule({ staffId: 'staff-1', ruleId: 'rule-1', name: 'Giờ mới' }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rule.id).toBe('rule-1')

    const auditData = fakeStore.activityLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('PRICING_RULE_UPDATE')
    expect(auditData.entityId).toBe('rule-1')
  })

  it('cập nhật tiers → xoá tiers cũ + tạo tiers mới', async () => {
    const result = await updatePricingRule(
      { staffId: 'staff-1', ruleId: 'rule-1', tiers: [{ minHours: 1, ratePerHour: 100000 }] },
      repos
    )

    expect(result.ok).toBe(true)
    expect(fakeStore.pricingTier.deleteMany).toHaveBeenCalledWith({ where: { ruleId: 'rule-1' } })
    expect(fakeStore.pricingTier.createMany).toHaveBeenCalled()
  })
})

describe('deletePricingRule', () => {
  beforeEach(resetMocks)

  it('trả PRICING_RULE_NOT_FOUND khi rule không tồn tại', async () => {
    fakeStore.pricingRule.findUnique.mockResolvedValue(null)
    const result = await deletePricingRule({ staffId: 'staff-1', ruleId: 'rule-x' }, repos)
    expect(result).toEqual({ ok: false, error: { code: 'PRICING_RULE_NOT_FOUND' } })
    expect(fakeStore.pricingRule.delete).not.toHaveBeenCalled()
  })

  it('xoá thành công + ghi audit PRICING_RULE_DELETE', async () => {
    const result = await deletePricingRule({ staffId: 'staff-1', ruleId: 'rule-1' }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.deletedId).toBe('rule-1')

    const auditData = fakeStore.activityLog.create.mock.calls[0][0].data
    expect(auditData.action).toBe('PRICING_RULE_DELETE')
    expect(auditData.entityId).toBe('rule-1')
  })
})
