'use client'
import { Input, Label } from '@/components/ui/input'
import type { ClassSlot } from './types'

export const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export interface SlotFormState {
  days: number[]
  startTime: string
  durationMin: string
  startsOn: string
  endsOn: string
}

export const emptySlot = (today: string): SlotFormState => ({ days: [], startTime: '18:00', durationMin: '60', startsOn: today, endsOn: '' })

export const todayInput = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

export const slotToForm = (slot: ClassSlot): SlotFormState => ({
  days: [...slot.daysOfWeek].sort((a, b) => a - b),
  startTime: slot.startTime,
  durationMin: String(slot.durationMin),
  startsOn: slot.startsOn.slice(0, 10),
  endsOn: slot.endsOn ? slot.endsOn.slice(0, 10) : '',
})

/** Payload gửi API; trả null khi biểu mẫu chưa hợp lệ. */
export function slotBody(form: SlotFormState) {
  const durationMin = Number(form.durationMin)
  if (!form.days.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime) || !form.startsOn) return null
  if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 1440) return null
  if (form.endsOn && form.endsOn < form.startsOn) return null
  return {
    daysOfWeek: [...form.days].sort((a, b) => a - b),
    startTime: form.startTime,
    durationMin,
    startsOn: form.startsOn,
    endsOn: form.endsOn || null,
    intervalWeeks: 1,
  }
}

export function formatSlot(slot: Pick<ClassSlot, 'daysOfWeek' | 'startTime' | 'durationMin'>) {
  const days = [...slot.daysOfWeek].sort((a, b) => a - b).map(day => DAY_LABELS[day]).join(', ')
  return `${days} · ${slot.startTime} · ${slot.durationMin} phút`
}

/** Ngày trong DB lưu theo giờ Việt Nam (UTC+7 đã trừ vào mốc UTC) — cộng lại khi hiển thị. */
const vnDateTime = (value: string) => new Date(Date.parse(value) + 7 * 3600_000).toISOString().slice(0, 16)

export const formatDate = (value: string | null) => value ? vnDateTime(value).slice(0, 10).split('-').reverse().join('/') : '—'

export const formatDateTime = (value: string) => {
  const [date, time] = vnDateTime(value).split('T')
  return `${date.split('-').reverse().join('/')} ${time}`
}

export function SlotFields({ idPrefix, form, onChange }: { idPrefix: string; form: SlotFormState; onChange: (next: SlotFormState) => void }) {
  return <div className="space-y-3">
    <div>
      <Label required>Các thứ trong tuần</Label>
      <div className="flex flex-wrap gap-1.5">
        {DAY_LABELS.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={form.days.includes(index)}
            className={`min-h-9 min-w-9 rounded-lg border text-sm ${form.days.includes(index) ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-700'}`}
            onClick={() => onChange({ ...form, days: form.days.includes(index) ? form.days.filter(day => day !== index) : [...form.days, index] })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor={`${idPrefix}-time`} required>Giờ bắt đầu</Label><Input id={`${idPrefix}-time`} type="time" value={form.startTime} onChange={event => onChange({ ...form, startTime: event.target.value })} /></div>
      <div><Label htmlFor={`${idPrefix}-duration`} required>Thời lượng (phút)</Label><Input id={`${idPrefix}-duration`} type="number" min={15} max={1440} step={15} value={form.durationMin} onChange={event => onChange({ ...form, durationMin: event.target.value })} /></div>
      <div><Label htmlFor={`${idPrefix}-start`} required>Bắt đầu từ ngày</Label><Input id={`${idPrefix}-start`} type="date" value={form.startsOn} onChange={event => onChange({ ...form, startsOn: event.target.value })} /></div>
      <div><Label htmlFor={`${idPrefix}-end`}>Kết thúc ngày (tuỳ chọn)</Label><Input id={`${idPrefix}-end`} type="date" min={form.startsOn} value={form.endsOn} onChange={event => onChange({ ...form, endsOn: event.target.value })} /></div>
    </div>
  </div>
}
