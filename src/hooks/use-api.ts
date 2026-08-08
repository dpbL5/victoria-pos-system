'use client'

import useSWR, { type SWRConfiguration } from 'swr'
import { swrFetcher } from '@/lib/swr-fetcher'
import type { ApiResponse } from '@/types'

/**
 * Client-side data fetching hook với SWR cache.
 *
 * Usage:
 *   const { data, error, isLoading, mutate } = useApi<T>('/api/xxx', { dedupingInterval: 300_000 })
 *
 * data: ApiResponse<T> | undefined — check data.success để lấy payload
 * error: lỗi network (fetch throw)
 * isLoading: true trong lần fetch đầu tiên
 * mutate: gọi sau create/update/delete để refresh
 */
export function useApi<T>(
  url: string | null,
  config?: SWRConfiguration<ApiResponse<T>>,
) {
  return useSWR<ApiResponse<T>>(url, swrFetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    ...config,
  })
}
