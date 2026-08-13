import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { calcElapsedHMS, formatClock } from './format'
import type { SessionRow } from './types'

export function SellPickDialog({
  open,
  sessions,
  onClose,
  onSelect,
}: {
  open: boolean
  sessions: SessionRow[]
  onClose: () => void
  onSelect: (session: SessionRow) => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chọn phiên để bán kèm"
      size="sm"
    >
      <div className="space-y-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelect(session)}
            className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div>
              <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                {session.customerName ?? session.customer?.fullName ?? 'Khách lẻ'}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {calcElapsedHMS(session.startTime)} · {formatClock(session.startTime)}
              </p>
            </div>
            <Badge variant={session.customer?.type === 'MEMBER' ? 'purple' : 'default'} size="sm">
              {session.customer?.type === 'MEMBER' ? 'Hội viên' : 'Vãng lai'}
            </Badge>
          </button>
        ))}
      </div>
    </Modal>
  )
}
