import { StudentDetailScreen } from '@/features/students/student-detail-screen'

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StudentDetailScreen id={id} />
}
