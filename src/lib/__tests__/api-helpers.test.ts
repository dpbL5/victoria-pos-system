import { describe, it, expect } from 'vitest'
import {
  apiError,
  apiSuccess,
  resultToResponse,
  ERR_UNAUTHORIZED,
} from '@/lib/infrastructure/api-helpers'
import { ok, err, type DomainError } from '@/lib/shared/result'

const mapper = (e: DomainError) => ({
  code: e.code,
  message: e.code === 'INVOICE_NOT_FOUND' ? 'Không tìm thấy hoá đơn' : 'Lỗi',
  status: e.code === 'INVOICE_NOT_FOUND' ? 404 : 400,
})

describe('api helpers', () => {
  it('apiError trả JSON { success: false, code, error } với status đúng', async () => {
    const res = apiError(ERR_UNAUTHORIZED)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Chưa đăng nhập' })
  })

  it('apiSuccess trả JSON { success: true, data }', async () => {
    const res = apiSuccess({ id: 'abc' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { id: 'abc' } })
  })

  it('resultToResponse map err qua mapper', async () => {
    const res = resultToResponse(err('INVOICE_NOT_FOUND'), mapper)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ success: false, code: 'INVOICE_NOT_FOUND', error: 'Không tìm thấy hoá đơn' })
  })

  it('resultToResponse trả data khi ok', async () => {
    const res = resultToResponse(ok({ done: true }), mapper)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { done: true } })
  })
})
