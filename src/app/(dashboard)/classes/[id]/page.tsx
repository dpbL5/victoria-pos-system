import { ClassDetailScreen } from '@/features/classes/class-detail-screen'
import { requirePageAccess } from '@/lib/shared/page-access'

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess('classes')

  const { id } = await params
  return <ClassDetailScreen id={id} />
}
