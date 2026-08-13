import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeStore = vi.hoisted(() => ({
  appSetting: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  activityLog: { create: vi.fn() },
}))

vi.mock('@/lib/infrastructure/prisma', () => ({
  prisma: { $transaction: (work: (store: unknown) => Promise<unknown>) => work(fakeStore) },
}))

import { updateSetting } from '@/lib/settings/use-cases/update-setting'
import { createRepositories } from '@/lib/infrastructure/repositories'

// Settings dùng cache wrapper — test use-case thuần qua createRepositories
const repos = createRepositories(fakeStore as never)

function resetMocks() {
  vi.clearAllMocks()
  fakeStore.appSetting.findUnique.mockResolvedValue(null)
  fakeStore.appSetting.upsert.mockResolvedValue({ id: 'set-1' })
}

describe('updateSetting', () => {
  beforeEach(resetMocks)

  it('upsert giá trị mới + ghi audit', async () => {
    const result = await updateSetting({
      staffId: 'staff-1',
      key: 'PARKING_FEE_UNIT_PRICE',
      value: '20000',
      label: 'Phí gửi xe',
    }, repos)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ key: 'PARKING_FEE_UNIT_PRICE', value: '20000' })

    expect(fakeStore.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'PARKING_FEE_UNIT_PRICE' },
      update: { value: '20000', label: 'Phí gửi xe' },
      create: { key: 'PARKING_FEE_UNIT_PRICE', value: '20000', label: 'Phí gửi xe' },
    })
    expect(fakeStore.activityLog.create).toHaveBeenCalled()
  })

  it('ghi audit kèm oldValue khi setting đã tồn tại', async () => {
    fakeStore.appSetting.findUnique.mockResolvedValue({
      id: 'set-1', key: 'PARKING_FEE_UNIT_PRICE', value: '10000',
    })

    await updateSetting({
      staffId: 'staff-1',
      key: 'PARKING_FEE_UNIT_PRICE',
      value: '15000',
    }, repos)

    const auditCall = fakeStore.activityLog.create.mock.calls[0][0]
    expect(auditCall.data.details).toMatchObject({
      key: 'PARKING_FEE_UNIT_PRICE',
      oldValue: '10000',
      newValue: '15000',
    })
  })
})
