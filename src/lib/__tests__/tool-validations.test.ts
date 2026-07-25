import { describe, it, expect } from 'vitest'
import { createToolSchema, updateToolSchema } from '@/lib/validations/tool'
import {
  openShiftSchema,
  closeShiftSchema,
} from '@/lib/validations/shift'

const TOOL_A = '123e4567-e89b-42d3-a456-426614174000'
const TOOL_B = '223e4567-e89b-42d3-a456-426614174001'

// ── createToolSchema ─────────────────────────────────────

describe('createToolSchema', () => {
  it('hợp lệ với name', () => {
    const result = createToolSchema.safeParse({ name: 'Gạt tên' })
    expect(result.success).toBe(true)
  })

  it('hợp lệ với name + description + quantity + isRequired + order', () => {
    const result = createToolSchema.safeParse({
      name: 'Bút bi',
      description: 'Dùng để ghi phiếu',
      quantity: 5,
      isRequired: true,
      order: 1,
    })
    expect(result.success).toBe(true)
  })

  it('mặc định isRequired = false, order = 0, quantity = 0', () => {
    const result = createToolSchema.safeParse({ name: 'Giấy in' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isRequired).toBe(false)
      expect(result.data.order).toBe(0)
      expect(result.data.quantity).toBe(0)
    }
  })

  it('từ chối name rỗng', () => {
    const result = createToolSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('từ chối name > 120 ký tự', () => {
    const result = createToolSchema.safeParse({ name: 'A'.repeat(121) })
    expect(result.success).toBe(false)
  })

  it('từ chối description > 1000 ký tự', () => {
    const result = createToolSchema.safeParse({ name: 'Test', description: 'A'.repeat(1001) })
    expect(result.success).toBe(false)
  })

  it('từ chối order âm', () => {
    const result = createToolSchema.safeParse({ name: 'Test', order: -1 })
    expect(result.success).toBe(false)
  })

  it('từ chối quantity âm', () => {
    const result = createToolSchema.safeParse({ name: 'Test', quantity: -1 })
    expect(result.success).toBe(false)
  })
})

// ── updateToolSchema ─────────────────────────────────────

describe('updateToolSchema', () => {
  it('cho phép object rỗng (partial)', () => {
    const result = updateToolSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('cho phép chỉ update name', () => {
    const result = updateToolSchema.safeParse({ name: 'Tên mới' })
    expect(result.success).toBe(true)
  })

  it('cho phép chỉ update order', () => {
    const result = updateToolSchema.safeParse({ order: 5 })
    expect(result.success).toBe(true)
  })
})

// ── shift schema với toolCounts ─────────────────────────

describe('openShiftSchema với toolCounts', () => {
  it('hợp lệ với toolCounts', () => {
    const result = openShiftSchema.safeParse({
      openingCash: 0,
      toolCounts: [
        { toolId: TOOL_A, openCount: 10 },
        { toolId: TOOL_B, openCount: 5 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('hợp lệ không có toolCounts', () => {
    const result = openShiftSchema.safeParse({ openingCash: 0 })
    expect(result.success).toBe(true)
  })

  it('từ chối toolId không phải UUID', () => {
    const result = openShiftSchema.safeParse({
      openingCash: 0,
      toolCounts: [{ toolId: 'not-uuid', openCount: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('từ chối openCount âm', () => {
    const result = openShiftSchema.safeParse({
      openingCash: 0,
      toolCounts: [{ toolId: TOOL_A, openCount: -1 }],
    })
    expect(result.success).toBe(false)
  })
})

describe('closeShiftSchema với toolCounts', () => {
  it('hợp lệ với toolCounts', () => {
    const result = closeShiftSchema.safeParse({
      closingCash: 1000,
      toolCounts: [
        { toolId: TOOL_A, openCount: 10 },
        { toolId: TOOL_B, openCount: 5 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('hợp lệ không có toolCounts', () => {
    const result = closeShiftSchema.safeParse({ closingCash: 1000 })
    expect(result.success).toBe(true)
  })
})
