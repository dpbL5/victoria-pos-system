import { RolesScreen } from '@/features/roles/roles-screen'
import { requirePageAccess } from '@/lib/shared/page-access'

export default async function RolesPage() {
  await requirePageAccess('roles')

  return <RolesScreen />
}
