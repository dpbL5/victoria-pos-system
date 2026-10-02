import { describe, it, expect, vi, afterEach } from 'vitest'

// apiJson dùng chung cho mọi màn — hành vi khi body không phải JSON quyết định
// lỗi hiện lên UI là "số HTTP thật" hay chung chung "Lỗi kết nối máy chủ".
import { apiJson } from '@/lib/api'

function stubFetch(response: Partial<Response> & { json: () => Promise<unknown> }) {
  const fetchMock = vi.fn(async () => response as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('apiJson', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('trả về body JSON khi server trả 200', async () => {
    stubFetch({ status: 200, json: async () => ({ success: true, data: { id: 1 } }) })
    const result = await apiJson<{ id: number }>('/api/x')
    expect(result).toEqual({ success: true, data: { id: 1 } })
  })

  it('trả về lỗi có sẵn khi server trả 4xx dạng JSON', async () => {
    stubFetch({ status: 400, json: async () => ({ success: false, error: 'Số lượng không hợp lệ' }) })
    const result = await apiJson('/api/x')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Số lượng không hợp lệ')
  })

  // Route không có method tương ứng trả 405 với body rỗng — nếu ném ra, mọi màn
  // đều báo "Lỗi kết nối máy chủ" và che mất nguyên nhân thật.
  it('không ném khi body không phải JSON, mà trả kèm số HTTP', async () => {
    stubFetch({
      status: 405,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input')
      },
    })
    const result = await apiJson('/api/x', { method: 'POST' })
    expect(result.success).toBe(false)
    expect(result.code).toBe('HTTP_ERROR')
    expect(result.error).toContain('405')
  })
})
