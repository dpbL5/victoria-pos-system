import { Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { calcCurrentPlayCost, calcElapsedHMS, formatClock, money, toNumber } from './format'
import type { SessionRow } from './types'

export function ActiveSessionCard({
  session,
  checkoutDisabled,
  onCheckout,
}: {
  session: SessionRow
  checkoutDisabled: boolean
  onCheckout: () => void
}) {
  const isMember = session.customer.type === 'MEMBER'
  const playerCount = session.playerCount ?? 1
  const isGroup = playerCount > 1
  const groups = session.pricingGroups ?? []
  const hasGroups = groups.length > 0

  // Calculate total running cost
  const currentCost = isMember
    ? 0
    : hasGroups
      ? groups
          .filter(g => g.remainingCount > 0)
          .reduce((sum, g) => {
            return sum + calcCurrentPlayCost(
              session.startTime,
              g.hourlyRate,
              undefined,
              g.pricingSnapshot?.tiers,
              g.remainingCount,
            )
          }, 0)
      : calcCurrentPlayCost(
          session.startTime,
          session.hourlyRate,
          undefined,
          session.pricingRuleSnapshot?.tiers,
          playerCount,
        )
  const pendingSell = toNumber(session.pendingSellTotal ?? 0)
  const runningTotal = currentCost + pendingSell

  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            {session.customer.fullName}
          </p>
          <Badge variant={isMember ? 'purple' : 'default'} size="sm">
            {isMember ? 'Hội viên' : 'Vãng lai'}
          </Badge>
          {isGroup && (
            <Badge variant="outline" size="sm">
              {playerCount} người
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Timer size={13} />
            {calcElapsedHMS(session.startTime)}
          </span>
          <span>{formatClock(session.startTime)}</span>
          {session.shift ? <span>Ca {formatClock(session.shift.openedAt)}</span> : <span>Chưa gắn ca</span>}
        </div>
        {!isMember && hasGroups && (
          <div className="mt-2 space-y-1">
            {groups.filter(g => g.remainingCount > 0).map((g) => {
              const groupCost = calcCurrentPlayCost(
                session.startTime,
                g.hourlyRate,
                undefined,
                g.pricingSnapshot?.tiers,
                g.remainingCount,
              )
              return (
                <div key={g.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-zinc-400 dark:text-zinc-500">
                    {g.label}: {g.remainingCount} người · {g.pricingSnapshot?.name ?? 'Bảng giá'}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                    {money(groupCost)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {!isMember && !hasGroups && session.pricingRuleSnapshot && (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Bảng giá: {session.pricingRuleSnapshot.name} — {money(session.pricingRuleSnapshot.ratePerHour)}/giờ
          </p>
        )}
      </div>
      <div className="flex flex-col items-end justify-between gap-2">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-zinc-950 dark:text-white">
            {money(runningTotal)}
          </p>
          {isGroup && !isMember && !hasGroups && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {money(currentCost / playerCount)}/người
            </p>
          )}
          {pendingSell > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {!isGroup && !isMember ? `${money(currentCost)} giờ + ` : ''}{money(pendingSell)} thêm
            </p>
          )}
        </div>
        <Button variant="inverse" size="xs" disabled={checkoutDisabled} onClick={onCheckout}>
          Thu
        </Button>
      </div>
    </div>
  )
}
