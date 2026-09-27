import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

interface RequestMetrics {
  requestId: string
  route: string
  startedAt: number
  authMs: number
  transactionMs: number
  transactionCallbackMs: number
  sqlCount: number
  sqlMs: number
  retryCount: number
}

const requestMetrics = new AsyncLocalStorage<RequestMetrics>()

function isEnabled() {
  return process.env.API_PERF_DIAGNOSTICS === '1'
}

export function measureApiAuth<T>(work: () => Promise<T>): Promise<T> {
  const metrics = requestMetrics.getStore()
  if (!metrics) return work()

  const startedAt = performance.now()
  return work().finally(() => {
    metrics.authMs += performance.now() - startedAt
  })
}

export function startApiTransaction() {
  const metrics = requestMetrics.getStore()
  const startedAt = metrics ? performance.now() : null

  return {
    async measureCallback<T>(work: () => Promise<T>): Promise<T> {
      if (!metrics) return work()
      const callbackStartedAt = performance.now()
      try {
        return await work()
      } finally {
        metrics.transactionCallbackMs += performance.now() - callbackStartedAt
      }
    },
    finish() {
      if (metrics && startedAt !== null) {
        metrics.transactionMs += performance.now() - startedAt
      }
    },
  }
}

export function recordApiSqlQuery(durationMs: number) {
  const metrics = requestMetrics.getStore()
  if (!metrics) return
  metrics.sqlCount += 1
  metrics.sqlMs += durationMs
}

export function recordApiRetry() {
  const metrics = requestMetrics.getStore()
  if (metrics) metrics.retryCount += 1
}

export function withApiDiagnostics<TArgs extends unknown[], TResponse extends Response>(
  route: string,
  handler: (...args: TArgs) => Promise<TResponse>
): (...args: TArgs) => Promise<TResponse> {
  return (...args) => {
    if (!isEnabled()) return handler(...args)

    const metrics: RequestMetrics = {
      requestId: randomUUID(),
      route,
      startedAt: performance.now(),
      authMs: 0,
      transactionMs: 0,
      transactionCallbackMs: 0,
      sqlCount: 0,
      sqlMs: 0,
      retryCount: 0,
    }

    return requestMetrics.run(metrics, async () => {
      let outcome = 'error'
      let response: TResponse | undefined
      try {
        response = await handler(...args)
        outcome = String(response.status)
        response.headers.set('X-Request-Id', metrics.requestId)
        if (process.env.API_PERF_SERVER_TIMING === '1') {
          const totalMs = performance.now() - metrics.startedAt
          const prepareMs = Math.max(0, totalMs - metrics.authMs - metrics.transactionMs)
          response.headers.set(
            'Server-Timing',
            `auth;dur=${metrics.authMs.toFixed(1)}, prepare;dur=${prepareMs.toFixed(1)}, transaction;dur=${metrics.transactionMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`
          )
        }
        return response
      } finally {
        const sampleRate = Number(process.env.API_PERF_SAMPLE_RATE ?? '0.1')
        if (Number.isFinite(sampleRate) && Math.random() < Math.min(1, Math.max(0, sampleRate))) {
          const totalMs = performance.now() - metrics.startedAt
          console.info(JSON.stringify({
            type: 'api-performance',
            requestId: metrics.requestId,
            route: metrics.route,
            outcome,
            authMs: +metrics.authMs.toFixed(1),
            prepareMs: +Math.max(0, totalMs - metrics.authMs - metrics.transactionMs).toFixed(1),
            transactionMs: +metrics.transactionMs.toFixed(1),
            transactionCallbackMs: +metrics.transactionCallbackMs.toFixed(1),
            retryCount: metrics.retryCount,
            ...(process.env.API_PERF_SQL_DIAGNOSTICS === '1'
              ? { sqlCount: metrics.sqlCount, sqlMs: +metrics.sqlMs.toFixed(1) }
              : {}),
            totalMs: +totalMs.toFixed(1),
          }))
        }
      }
    })
  }
}
