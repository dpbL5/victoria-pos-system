import { Minus, Plus } from 'lucide-react'
import { Label, Select } from '@/components/ui/input'
import { money } from './format'

interface PricingRuleOption {
  id: string
  name: string
  ratePerHour: number
  tiers: { minHours: number; ratePerHour: number }[]
}

export function GroupBuilder({
  totalPlayers,
  groups,
  onChange,
  applicablePricingRules,
}: {
  totalPlayers: number
  groups: Array<{ playerCount: number; pricingRuleId: string }>
  onChange: (groups: Array<{ playerCount: number; pricingRuleId: string }>) => void
  applicablePricingRules: PricingRuleOption[]
}) {
  const usedCount = groups.reduce((s, g) => s + g.playerCount, 0)
  const remaining = totalPlayers - usedCount

  const addGroup = () => {
    if (remaining <= 0) return
    const defaultRule = applicablePricingRules[0]
    onChange([...groups, { playerCount: Math.min(1, remaining), pricingRuleId: defaultRule?.id ?? '' }])
  }

  const updateGroup = (index: number, field: 'playerCount' | 'pricingRuleId', value: number | string) => {
    const updated = [...groups]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  const removeGroup = (index: number) => {
    onChange(groups.filter((_, i) => i !== index))
  }

  const groupRemaining = (index: number) => {
    const prevSum = groups.slice(0, index).reduce((s, g) => s + g.playerCount, 0)
    const otherSum = groups.slice(index + 1).reduce((s, g) => s + g.playerCount, 0)
    return totalPlayers - prevSum - otherSum
  }

  if (applicablePricingRules.length === 0) return null

  return (
    <div className="mt-3 space-y-3">
      <Label>Phân chia bảng giá</Label>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {usedCount}/{totalPlayers} người đã phân — còn {remaining} người
      </p>
      {groups.map((group, i) => (
        <div key={i} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-zinc-950 dark:text-white">Nhóm {i + 1}</span>
            {groups.length > 1 && (
              <button type="button" onClick={() => removeGroup(i)} className="text-xs text-red-500 dark:text-red-300">
                Xoá
              </button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Số người</Label>
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateGroup(i, 'playerCount', Math.max(1, group.playerCount - 1))}
                  disabled={group.playerCount <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                >
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
                  {group.playerCount}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const maxAdd = remaining + group.playerCount
                    updateGroup(i, 'playerCount', Math.min(maxAdd, group.playerCount + 1))
                  }}
                  disabled={group.playerCount >= (groupRemaining(i) + remaining)}
                  className="flex h-8 w-8 items-center justify-center rounded bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Bảng giá</Label>
              <Select
                value={group.pricingRuleId}
                onChange={(e) => updateGroup(i, 'pricingRuleId', e.target.value)}
              >
                {applicablePricingRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {money(r.ratePerHour)}/giờ
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={addGroup}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-300"
        >
          <Plus size={14} />
          Thêm nhóm ({remaining} người chưa phân)
        </button>
      )}
    </div>
  )
}
