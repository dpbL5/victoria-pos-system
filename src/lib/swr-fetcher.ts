// ── SWR fetcher — wrap apiJson cho useSWR ─────
import { apiJson } from '@/features/pos/api'
import type { ApiResponse } from '@/types'

/**
 * Fetcher dùng với useSWR.
 * Trả về ApiResponse<T> nguyên vẹn — consumer check data.success.
 * Trả về data nguyên trần nếu success, throw error để SWR bắt.
 */
export async function swrFetcher<T>(url: string): Promise<ApiResponse<T>> {
  const result = await apiJson<T>(url)
  // SWR coi response là data bất kể success hay không —
  // consumer tự check result.success để hiển thị lỗi.
  return result
}
