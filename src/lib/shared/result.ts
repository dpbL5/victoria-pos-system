// ── Result type — thay thế throw Error("CODE") trong use-cases ─────
export interface DomainError {
  /** Mã lỗi UPPER_SNAKE_CASE — giữ nguyên convention hiện tại */
  code: string
  /** Chi tiết động — thay cho hậu tố string như INSUFFICIENT_STOCK:name */
  detail?: string
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainError }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = (code: string, detail?: string): Result<never> => ({ ok: false, error: { code, detail } })
export const isOk = <T>(r: Result<T>): r is { ok: true; value: T } => r.ok
export const isErr = <T>(r: Result<T>): r is { ok: false; error: DomainError } => !r.ok

/** Bridge cho code chưa migrate: Result → throw Error(code) */
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value
  throw new Error(r.error.code)
}
