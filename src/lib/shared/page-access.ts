// ── Page guard server-side cho các trang dashboard ─────
// User phải có ít nhất một quyền trong các nhóm khai báo; không đủ quyền thì
// redirect về module đầu tiên user được vào (xem firstAccessibleModuleRoute).
// User không vào được module nào → '/' → layout hiển thị màn hình "Chưa phân vai".
import { redirect } from 'next/navigation'
import { requireAuth, type AuthUser } from '@/lib/shared/auth'
import { firstAccessibleModuleRoute, hasPageAccess } from '@/lib/shared/permissions'

export async function requirePageAccess(...groupKeys: string[]): Promise<AuthUser> {
  const user = await requireAuth()
  const roleKey = user.role?.key
  if (!hasPageAccess(user.role?.permissions, groupKeys, roleKey)) {
    redirect(firstAccessibleModuleRoute(user.role?.permissions, roleKey) ?? '/')
  }
  return user
}
