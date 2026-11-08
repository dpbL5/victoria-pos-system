import { requirePageAccess } from '@/lib/shared/page-access'
import { ToolsScreen } from '@/features/tools/tools-screen'

export default async function ToolsPage() {
  await requirePageAccess('tools')

  return <ToolsScreen />
}
