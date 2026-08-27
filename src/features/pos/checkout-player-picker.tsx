'use client'

import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { Select } from '@/components/ui/input'
import { money } from './format'

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

/** Tiền cần thu + thời gian đã chơi/tạm dừng của từng người chơi (key = playerId) */
export interface PickerMemberStat {
  /** null = không được thu lần này */
  amount?: number | null
  /** "Đã chơi" dạng hh:mm */
  playedText?: string
  /** "Nghỉ" dạng hh:mm */
  pausedText?: string
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

/** Cột tiền chung của hoá đơn — mọi số tiền thẳng một lề phải.
 *  Drawer và picker dùng chung để bảng đọc như một biên lai. */
export const MONEY_RAIL = 'w-[5.75rem] shrink-0 text-right tabular-nums'
export const GROUP_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400'

export function CheckoutPlayerPicker({
  groups,
  rules,
  memberStats,
  onChange,
}: {
  groups: PickerGroup[]
  rules: PickerRuleOption[]
  memberStats?: Record<string, PickerMemberStat>
  onChange: (groups: PickerGroup[]) => void
}) {
  const keyCounter = useRef(0)

  // Mode B: các nhóm đã gán giá (locked) không cần danh sách bảng giá để chọn người.
  // Chỉ ẩn picker khi còn nhóm chưa khóa (mode A) mà chưa tải được bảng giá hiệu lực.
  if (rules.length === 0 && groups.some((g) => !g.locked)) return null

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
    groups.some((g, gi) => gi !== selfIndex && g.selectedIds.includes(memberId))

  const totalPlayers = new Set(
    groups.flatMap((g) => g.members.map((m) => m.id)),
  ).size
  const assignedCount = new Set(groups.flatMap((g) => g.selectedIds)).size
  const showGroupNames = groups.length > 1

  return (
    <div className="space-y-5">
      {groups.map((group, i) => {
        const allSelected =
          group.members.length > 0 &&
          group.members.every((m) => group.selectedIds.includes(m.id))
        return (
          <div key={group.key}>
            {/* ── Tên nhóm | Chọn bảng giá ── */}
            <div className="flex items-center justify-between gap-2">
              <span className={`${GROUP_LABEL} min-w-0 truncate`}>
                {showGroupNames ? group.label : 'Giờ chơi'}
                {group.locked && group.pricingRuleName
                  ? ` · ${group.pricingRuleName}`
                  : ''}
                {group.locked && group.checkedOutCount
                  ? ` · đã thu ${group.checkedOutCount}`
                  : ''}
              </span>
              <div className="flex shrink-0 items-center justify-end gap-2">
                {!group.locked && rules.length > 0 && (
                  <Select
                    aria-label="Chọn bảng giá"
                    value={group.pricingRuleId}
                    className="w-[11rem] px-2 py-1.5 text-sm"
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
                )}
                {!group.locked && groups.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeGroup(i)}
                    className="text-xs text-red-500 dark:text-red-300"
                  >
                    Xoá nhóm
                  </button>
                )}
                {group.locked && (
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
                )}
              </div>
            </div>

            {/* ── Mỗi người chơi: [Checkbox] Tên + thời gian ‖ số tiền ── */}
            {group.members.length === 0 ? (
              <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">
                Không còn người chơi để chọn.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {group.members.map((m) => {
                  const checked = group.selectedIds.includes(m.id)
                  const inOther = !group.locked && assignedInOtherGroup(i, m.id)
                  const stat = memberStats?.[m.id]
                  return (
                    <li key={`${group.key}-${m.id}`}>
                      <button
                        type="button"
                        onClick={() => toggleMember(i, m.id)}
                        className={`flex w-full items-start gap-3 py-2 text-left transition-colors ${
                          checked ? '' : 'opacity-55'
                        } ${inOther ? 'opacity-40' : ''}`}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={checked}
                          tabIndex={-1}
                          className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] leading-tight text-zinc-950 dark:text-white">
                            {m.name?.trim() || 'Người chơi'}
                          </span>
                          <span className="block text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                            chơi {stat?.playedText ?? '—'} · nghỉ{' '}
                            {stat?.pausedText ?? '—'}
                          </span>
                        </span>
                        <span
                          className={`${MONEY_RAIL} pt-0.5 text-[15px] font-medium ${
                            checked
                              ? 'text-zinc-950 dark:text-white'
                              : 'text-zinc-400 dark:text-zinc-600'
                          }`}
                        >
                          {checked ? money(stat?.amount ?? 0) : '—'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      {/* ── Chọn ít hơn tổng người của phiên → tạo thêm nhóm ── */}
      {assignedCount < totalPlayers && (
        <button
          type="button"
          onClick={addGroup}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-300"
        >
          <Plus size={14} />
          Tạo thêm nhóm
        </button>
      )}
    </div>
  )
}
