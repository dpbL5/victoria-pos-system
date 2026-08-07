import { describe, it, expect } from 'vitest'
import {
  createMembershipPlanSchema,
  updateMembershipPlanSchema,
  registerMemberSchema,
  renewMembershipSchema,
} from '@/lib/memberships'

// UUID hợp lệ cho test (Zod v4 yêu cầu UUID đúng chuẩn: version 1-8, variant 8-b)
const CUST_A = '123e4567-e89b-42d3-a456-426614174000'
const CUST_B = '223e4567-e89b-42d3-a456-426614174001'
const PLAN_A = '323e4567-e89b-42d3-a456-426614174002'
const PLAN_B = '423e4567-e89b-42d3-a456-426614174003'

// ── createMembershipPlanSchema ──────────────────────────

describe('createMembershipPlanSchema', () => {
  it('hợp lệ với dữ liệu đầy đủ', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Gói Tháng',
      durationMonths: 1,
      price: 500000,
      isActive: true,
    })
    expect(result.success).toBe(true)
  })

  it('dùng giá trị mặc định durationMonths = 1', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Gói Tháng',
      price: 500000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.durationMonths).toBe(1)
    }
  })

  it('dùng giá trị mặc định isActive = true', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Gói Tháng',
      price: 500000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isActive).toBe(true)
    }
  })

  it('từ chối khi thiếu tên', () => {
    const result = createMembershipPlanSchema.safeParse({
      durationMonths: 1,
      price: 500000,
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi tên rỗng', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: '',
      price: 500000,
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi giá = 0', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Gói Tháng',
      price: 0,
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi giá âm', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Gói Tháng',
      price: -100000,
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi durationMonths <= 0', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Gói Tháng',
      price: 500000,
      durationMonths: 0,
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi durationMonths không phải số nguyên', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Gói Tháng',
      price: 500000,
      durationMonths: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('chấp nhận isActive = false', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Gói Tháng',
      price: 500000,
      isActive: false,
    })
    expect(result.success).toBe(true)
  })

  it('từ chối khi tên > 100 ký tự', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'A'.repeat(101),
      price: 500000,
    })
    expect(result.success).toBe(false)
  })
})

// ── updateMembershipPlanSchema ──────────────────────────

describe('updateMembershipPlanSchema', () => {
  it('cho phép cập nhật một phần (chỉ tên)', () => {
    const result = updateMembershipPlanSchema.safeParse({
      name: 'Gói VIP Mới',
    })
    expect(result.success).toBe(true)
  })

  it('cho phép cập nhật một phần (chỉ giá)', () => {
    const result = updateMembershipPlanSchema.safeParse({
      price: 800000,
    })
    expect(result.success).toBe(true)
  })

  it('cho phép cập nhật nhiều trường', () => {
    const result = updateMembershipPlanSchema.safeParse({
      name: 'Gói VIP Mới',
      price: 800000,
      durationMonths: 3,
      isActive: false,
    })
    expect(result.success).toBe(true)
  })

  it('cho phép object rỗng (không cập nhật gì)', () => {
    const result = updateMembershipPlanSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('từ chối giá = 0 khi cập nhật', () => {
    const result = updateMembershipPlanSchema.safeParse({
      price: 0,
    })
    expect(result.success).toBe(false)
  })

  it('từ chối giá âm khi cập nhật', () => {
    const result = updateMembershipPlanSchema.safeParse({
      price: -100000,
    })
    expect(result.success).toBe(false)
  })

  it('từ chối tên rỗng khi cập nhật', () => {
    const result = updateMembershipPlanSchema.safeParse({
      name: '',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối durationMonths <= 0', () => {
    const result = updateMembershipPlanSchema.safeParse({
      durationMonths: 0,
    })
    expect(result.success).toBe(false)
  })
})

// ── registerMemberSchema ────────────────────────────────

describe('registerMemberSchema', () => {
  it('hợp lệ với dữ liệu đầy đủ', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      phone: '0912345678',
      planId: PLAN_A,
      paymentMethod: 'CASH',
      notes: 'Ghi chú test',
    })
    expect(result.success).toBe(true)
  })

  it('hợp lệ không có phone', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      planId: PLAN_A,
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(true)
  })

  it('hợp lệ với phone rỗng', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      phone: '',
      planId: PLAN_A,
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(true)
  })

  it('từ chối khi thiếu fullName', () => {
    const result = registerMemberSchema.safeParse({
      phone: '0912345678',
      planId: PLAN_A,
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi fullName rỗng', () => {
    const result = registerMemberSchema.safeParse({
      fullName: '',
      planId: PLAN_A,
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi thiếu planId', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi planId không phải UUID', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      planId: 'not-a-uuid',
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi paymentMethod không hợp lệ', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      planId: PLAN_A,
      paymentMethod: 'BITCOIN',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối số điện thoại sai định dạng (không bắt đầu bằng 0)', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      phone: '1234567890',
      planId: PLAN_A,
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối số điện thoại quá ngắn', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      phone: '0123',
      planId: PLAN_A,
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('chấp nhận paymentMethod CASH, TRANSFER, CARD', () => {
    for (const method of ['CASH', 'TRANSFER', 'CARD']) {
      const result = registerMemberSchema.safeParse({
        fullName: 'Nguyễn Văn A',
        planId: PLAN_A,
        paymentMethod: method,
      })
      expect(result.success).toBe(true)
    }
  })

  it('hợp lệ với paidAt dạng ISO datetime', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      planId: PLAN_A,
      paymentMethod: 'CASH',
      paidAt: '2026-07-08T10:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })

  it('từ chối fullName > 100 ký tự', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'A'.repeat(101),
      planId: PLAN_A,
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối notes > 500 ký tự', () => {
    const result = registerMemberSchema.safeParse({
      fullName: 'Nguyễn Văn A',
      planId: PLAN_A,
      paymentMethod: 'CASH',
      notes: 'A'.repeat(501),
    })
    expect(result.success).toBe(false)
  })
})

// ── renewMembershipSchema ────────────────────────────────

describe('renewMembershipSchema', () => {
  it('hợp lệ với dữ liệu đầy đủ', () => {
    const result = renewMembershipSchema.safeParse({
      customerId: CUST_A,
      planId: PLAN_A,
      paymentMethod: 'CASH',
      notes: 'Gia hạn tháng 7',
    })
    expect(result.success).toBe(true)
  })

  it('hợp lệ không có notes', () => {
    const result = renewMembershipSchema.safeParse({
      customerId: CUST_A,
      planId: PLAN_A,
      paymentMethod: 'TRANSFER',
    })
    expect(result.success).toBe(true)
  })

  it('từ chối khi thiếu customerId', () => {
    const result = renewMembershipSchema.safeParse({
      planId: PLAN_A,
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi customerId không phải UUID', () => {
    const result = renewMembershipSchema.safeParse({
      customerId: 'invalid',
      planId: PLAN_A,
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi planId không phải UUID', () => {
    const result = renewMembershipSchema.safeParse({
      customerId: CUST_A,
      planId: 'invalid',
      paymentMethod: 'CASH',
    })
    expect(result.success).toBe(false)
  })

  it('từ chối khi paymentMethod không hợp lệ', () => {
    const result = renewMembershipSchema.safeParse({
      customerId: CUST_A,
      planId: PLAN_A,
      paymentMethod: 'INVALID',
    })
    expect(result.success).toBe(false)
  })

  it('chấp nhận cả 3 phương thức thanh toán', () => {
    for (const method of ['CASH', 'TRANSFER', 'CARD']) {
      const result = renewMembershipSchema.safeParse({
        customerId: CUST_A,
        planId: PLAN_A,
        paymentMethod: method,
      })
      expect(result.success).toBe(true)
    }
  })

  it('từ chối notes > 500 ký tự', () => {
    const result = renewMembershipSchema.safeParse({
      customerId: CUST_A,
      planId: PLAN_A,
      paymentMethod: 'CASH',
      notes: 'A'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('hợp lệ với paidAt dạng ISO datetime', () => {
    const result = renewMembershipSchema.safeParse({
      customerId: CUST_A,
      planId: PLAN_A,
      paymentMethod: 'CASH',
      paidAt: '2026-07-08T10:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })
})
