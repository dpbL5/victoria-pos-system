import { requirePageAccess } from '@/lib/shared/page-access'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('users')

  return <>{children}</>
}
