import { requirePageAccess } from '@/lib/shared/page-access'
import { ClassesScreen } from '@/features/classes/classes-screen'

export default async function ClassesPage() {
  await requirePageAccess('classes')

  return <ClassesScreen />
}
