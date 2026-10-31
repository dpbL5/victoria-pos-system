import { StudentDetailScreen } from '@/features/students/student-detail-screen'
import { requirePageAccess } from '@/lib/shared/page-access'

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess('students')

  const { id } = await params
  return <StudentDetailScreen id={id} />
}
