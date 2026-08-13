import { Plus, User } from 'lucide-react'
import { Label, Select } from '@/components/ui/input'

interface PricingRuleOption {
  id: string
  name: string
  ratePerHour: number
  tiers: { minHours: number; ratePerHour: number }[]
}

interface PlayerOption {
  id: string
  name: string | null
}

export interface CheckoutGroup {
  /** Người chơi chọn tay vào nhóm */
  playerIds: string[]
  pricingRuleId: string
}

export function GroupBuilder({
  players,
  groups,
  onChange,
  applicablePricingRules,
}: {
  players: PlayerOption[]
  groups: CheckoutGroup[]
  onChange: (groups: CheckoutGroup[]) => void
  applicablePricingRules: PricingRuleOption[]
}) {
  const assignedIds = new Set(groups.flatMap((g) => g.playerIds))
  const remaining = players.filter((p) => !assignedIds.has(p.id))

  const addGroup = () => {
    if (remaining.length === 0) return
    const defaultRule = applicablePricingRules[0]
    onChange([...groups, { playerIds: [], pricingRuleId: defaultRule?.id ?? '' }])
  }

  const togglePlayer = (groupIndex: number, playerId: string) => {
    const updated = [...groups]
    const group = { ...updated[groupIndex] }
    group.playerIds = group.playerIds.includes(playerId)
      ? group.playerIds.filter((id) => id !== playerId)
      : [...group.playerIds, playerId]
    updated[groupIndex] = group
    onChange(updated)
  }

  const setRule = (groupIndex: number, pricingRuleId: string) => {
    const updated = [...groups]
    updated[groupIndex] = { ...updated[groupIndex], pricingRuleId }
    onChange(updated)
  }

  const removeGroup = (index: number) => {
    onChange(groups.filter((_, i) => i !== index))
  }

  if (applicablePricingRules.length === 0) return null

  return (
    <div className="mt-3 space-y-3">
      <Label>Phân chia bảng giá</Label>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {assignedIds.size}/{players.length} người đã phân — còn {remaining.length} người chưa chọn
      </p>
      {groups.map((group, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-zinc-950 dark:text-white">Nhóm {i + 1}</span>
            {groups.length > 1 && (
              <button type="button" onClick={() => removeGroup(i)} className="text-xs text-red-500 dark:text-red-300">
                Xoá
              </button>
            )}
          </div>
          <div className="mt-2">
            <Label className="text-xs">Bảng giá</Label>
            <Select
              value={group.pricingRuleId}
              onChange={(e) => setRule(i, e.target.value)}
            >
              {applicablePricingRules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-2">
            <Label className="text-xs">Người chơi ({group.playerIds.length})</Label>
            <div className="mt-1 space-y-1">
              {players.map((p) => {
                const inOtherGroup = assignedIds.has(p.id) && !group.playerIds.includes(p.id)
                const checked = group.playerIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={inOtherGroup}
                    onClick={() => togglePlayer(i, p.id)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-40 ${
                      checked
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                        : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                    }`}
                  >
                    <input type="checkbox" disabled checked={checked} className="h-3.5 w-3.5 accent-emerald-600" />
                    <User size={13} className="shrink-0 text-zinc-400" />
                    <span className="truncate text-zinc-950 dark:text-white">
                      {p.name?.trim() || `Người ${players.findIndex((x) => x.id === p.id) + 1}`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ))}
      {remaining.length > 0 && (
        <button
          type="button"
          onClick={addGroup}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-300"
        >
          <Plus size={14} />
          Thêm nhóm ({remaining.length} người chưa phân)
        </button>
      )}
    </div>
  )
}
