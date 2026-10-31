import { requirePageAccess } from '@/lib/shared/page-access'
import { StudentsScreen } from '@/features/students/students-screen'

export default async function StudentsPage() {
  await requirePageAccess('students')

  return <StudentsScreen />
}
