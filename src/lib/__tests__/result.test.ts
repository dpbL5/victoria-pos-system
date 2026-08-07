import { describe, it, expect } from 'vitest'
import { ok, err, isOk, isErr, unwrap, type Result } from '@/lib/shared/result'

describe('Result type', () => {
  it('ok() tạo Result thành công', () => {
    const r: Result<number> = ok(42)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(42)
  })

  it('err() tạo Result thất bại với code + detail', () => {
    const r = err('INSUFFICIENT_STOCK', 'Trà đào')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('INSUFFICIENT_STOCK')
      expect(r.error.detail).toBe('Trà đào')
    }
  })

  it('isOk / isErr là type guards', () => {
    const a = ok('x')
    const b = err('NOT_FOUND')
    expect(isOk(a)).toBe(true)
    expect(isErr(a)).toBe(false)
    expect(isOk(b)).toBe(false)
    expect(isErr(b)).toBe(true)
  })

  it('unwrap() trả value khi ok, throw Error(code) khi err', () => {
    expect(unwrap(ok(7))).toBe(7)
    expect(() => unwrap(err('SESSION_NOT_FOUND'))).toThrow('SESSION_NOT_FOUND')
  })

  it('err() không bắt buộc detail', () => {
    const r = err('SHIFT_REQUIRED')
    expect(r).toEqual({ ok: false, error: { code: 'SHIFT_REQUIRED' } })
  })
})
