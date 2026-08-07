// ── Shared module — cross-cutting, KHÔNG import từ domain ─────
export {
  type DomainError,
  type Result,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
} from './result'
