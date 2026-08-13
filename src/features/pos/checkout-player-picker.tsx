'use client'

import { useRef } from 'react'
import { Plus, User } from 'lucide-react'
import { Label, Select } from '@/components/ui/input'

export interface PickerRuleOption {
  id: string
  name: string
  ratePerHour: number
  tiers: { minHours: number; ratePerHour: number }[]
}

export interface PickerMember {
  id: string
  name: string | null
}

export interface PickerGroup {
  /** groupId thật (mode B) hoặc `new-${i}` (mode A) */
  key: string
  label: string
  /** true = nhóm đã gán giá từ check-in (rule cố định, không thêm/xoá/chuyển người) */
  locked: boolean
  pricingRuleId: string
  /** Tên bảng giá hiển thị khi locked */
  pricingRuleName?: string
  /** Còn X người chưa thu (mode B) */
  remainingCount?: number
  /** Số người đã thu (mode B) */
  checkedOutCount?: number
  /** Người chơi của nhóm (mode A: toàn bộ người phiên, chuyển nhóm tự do) */
  members: PickerMember[]
  /** Người đang được chọn thu lần này */
  selectedIds: string[]
}

export function CheckoutPlayerPicker({
  groups,
  rules,
  onChange,
}: {
  groups: PickerGroup[]
  rules: PickerRuleOption[]
  onChange: (groups: PickerGroup[]) => void
}) {
  const keyCounter = useRef(0)

  if (rules.length === 0) return null

  const setGroup = (index: number, patch: Partial<PickerGroup>) => {
    onChange(groups.map((g, i) => (i === index ? { ...g, ...patch } : g)))
  }

  /** Bật chọn → tự chuyển người khỏi nhóm khác (mỗi người chỉ thuộc 1 nhóm) */
  const toggleMember = (index: number, memberId: string) => {
    const group = groups[index]
    if (!group) return
    const isOn = group.selectedIds.includes(memberId)
    onChange(
      groups.map((g, i) => {
        if (i === index) {
          return {
            ...g,
            selectedIds: isOn
              ? g.selectedIds.filter((id) => id !== memberId)
              : [...g.selectedIds, memberId],
          }
        }
        if (!isOn && g.selectedIds.includes(memberId)) {
          return {
            ...g,
            selectedIds: g.selectedIds.filter((id) => id !== memberId),
          }
        }
        return g
      }),
    )
  }

  const addGroup = () => {
    const base = groups[0]
    keyCounter.current += 1
    onChange([
      ...groups,
      {
        key: `new-${Date.now()}-${keyCounter.current}`,
        label: `Nhóm ${groups.length + 1}`,
        locked: false,
        pricingRuleId: rules[0]?.id ?? '',
        members: base ? base.members : [],
        selectedIds: [],
      },
    ])
  }

  const removeGroup = (index: number) => {
    onChange(groups.filter((_, i) => i !== index))
  }

  const assignedInOtherGroup = (selfIndex: number, memberId: string) =>
    groups.some(
      (g, gi) => gi !== selfIndex && g.selectedIds.includes(memberId),
    )

  return (
    <div className="space-y-3">
      {groups.map((group, i) => {
        const totalMembers = group.members.length
        const allSelected =
          totalMembers > 0 &&
          group.members.every((m) => group.selectedIds.includes(m.id))
        const checkedInThis = group.selectedIds.length
        // Tổng người đã phân vào nhóm nào đó (để hiển thị tiến độ)
        const assignedCount = new Set(
          groups.flatMap((g) => g.selectedIds),
        ).size
        const totalPlayers = new Set(groups.flatMap((g) => g.members.map((m) => m.id))).size
        return (
          <div
            key={group.key}
            className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
          >
            {/* Header nhóm */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                  {group.label}
                </span>
                {group.locked ? (
                  <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {group.pricingRuleName ?? 'Bảng giá'}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {group.locked ? (
                  <button
                    type="button"
                    onClick={() =>
                      setGroup(i, {
                        selectedIds: allSelected
                          ? []
                          : group.members.map((m) => m.id),
                      })
                    }
                    className="text-xs font-medium text-blue-600 dark:text-blue-300"
                  >
                    {allSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
                  </button>
                ) : (
                  groups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGroup(i)}
                      className="text-xs text-red-500 dark:text-red-300"
                    >
                      Xoá nhóm
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Thông tin nhóm (mode B) */}
            {group.locked &&
              (group.remainingCount !== undefined ||
                group.checkedOutCount !== undefined) && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Còn {group.remainingCount ?? 0} người chưa thu
                  {group.checkedOutCount
                    ? ` · đã thu ${group.checkedOutCount}`
                    : ''}
                </p>
              )}

            {/* Chọn bảng giá (mode A) */}
            {!group.locked && (
              <>
                <Label className="text-xs mt-2">Bảng giá</Label>
                <Select
                  value={group.pricingRuleId}
                  onChange={(e) =>
                    setGroup(i, { pricingRuleId: e.target.value })
                  }
                >
                  {rules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </>
            )}

            {/* Người chơi */}
            <div className="mt-2">
              <Label className="text-xs">
                Người chơi
                {group.locked
                  ? ` (${checkedInThis}/${totalMembers})`
                  : ` (${assignedCount}/${totalPlayers})`}
              </Label>
              {totalMembers === 0 ? (
                <p className="rounded-lg bg-zinc-50 p-2 text-xs text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                  Không còn người chơi để chọn.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {group.members.map((m) => {
                    const checked = group.selectedIds.includes(m.id)
                    // Mode A: người đã ở nhóm khác — hiển thị mờ; bấm vào sẽ chuyển nhóm
                    const inOther = !group.locked && assignedInOtherGroup(i, m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMember(i, m.id)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ${
                          checked
                            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                            : inOther
                              ? 'border-zinc-200 bg-zinc-50 opacity-50 dark:border-zinc-800 dark:bg-zinc-900'
                              : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled
                          checked={checked}
                          className="h-3.5 w-3.5 accent-emerald-600"
                        />
                        <User size={13} className="shrink-0 text-zinc-400" />
                        <span className="max-w-[8rem] break-words leading-tight text-zinc-950 dark:text-white">
                          {m.name?.trim() || 'Người chơi'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {groups.some((g) => !g.locked) && (
        <button
          type="button"
          onClick={addGroup}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-300"
        >
          <Plus size={14} />
          Thêm nhóm
        </button>
      )}
    </div>
  )
}
