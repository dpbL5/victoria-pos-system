import { requirePageAccess } from '@/lib/shared/page-access'
import { LessonsScreen } from '@/features/students/lessons-screen'

export default async function LessonsPage() {
  await requirePageAccess('lessons')

  return <LessonsScreen />
}
