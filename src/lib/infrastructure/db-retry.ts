/**
 * Retry helper cho transient database errors (Supabase free tier).
 *
 * Supabase free tier thường xuyên gặp các lỗi tạm thời:
 * - Connection terminated unexpectedly
 * - Connection pool exhausted (too many clients)
 * - Server idle timeout
 * - Prepared statement stale
 *
 * Hàm này tự động retry với exponential backoff cho các lỗi trên.
 */
const RETRYABLE_MESSAGES = [
  'Connection terminated unexpectedly',
  'Connection pool timeout',
  'too many clients',
  'remaining connection slots',
  'Connection reset by peer',
  'read ECONNRESET',
  'connect ETIMEDOUT',
  'prepared statement',
  'idle transaction timeout',
  'server closed the connection',
]

function isRetryable(error: unknown): boolean {
  const message = (error as Error).message ?? String(error)
  return RETRYABLE_MESSAGES.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase())
  )
}

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  onRetry?: (attempt: number, error: unknown) => void
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 3,
  baseDelayMs: 300,
  maxDelayMs: 5000,
}

/**
 * Thực thi `fn` với cơ chế retry cho transient database errors.
 * Dùng exponential backoff: delay = min(baseDelay * 2^attempt, maxDelay).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_OPTIONS,
    ...options,
  }
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxRetries || !isRetryable(error)) {
        throw error
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      if (options.onRetry) {
        options.onRetry(attempt + 1, error)
      }

      // Log retry ra console để debug
      console.warn(
        `[DB-RETRY] Attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms: ${(error as Error).message}`
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Tạo wrapper cho Prisma model delegate, tự động retry tất cả query.
 * Dùng: const payment = withRetryModel(prisma.payment)
 *       const result = await payment.aggregate({ ... })
 *
 * Lưu ý: không wrap transaction vì retry bên trong transaction có thể
 * gây inconsistent state.
 */
export function withRetryModel<T extends object>(
  model: T
): T {
  return new Proxy(model, {
    get(target, prop: string | symbol) {
      const value = (target as Record<string | symbol, unknown>)[prop]
      if (typeof value === 'function' && !prop.toString().startsWith('$')) {
        return (...args: unknown[]) =>
          withRetry(() => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args))
      }
      return value
    },
  }) as T
}
