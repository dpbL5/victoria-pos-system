// ── Helpers: đếm số buổi còn lại của gói ─────
import type { LessonPackageRecord } from '../ports'

/** Số buổi còn lại của gói. */
export function remaining(pkg: Pick<LessonPackageRecord, 'total' | 'used'>): number {
  return Math.max(0, pkg.total - pkg.used)
}

/** Chọn gói hoạt động còn buổi (ưu tiên gói tạo trước) để trừ khi hoàn thành buổi. */
export function pickChargeablePackage(packages: LessonPackageRecord[]): LessonPackageRecord | null {
  const active = packages.filter((p) => p.isActive && remaining(p) > 0)
  if (active.length === 0) return null
  return active.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
}
