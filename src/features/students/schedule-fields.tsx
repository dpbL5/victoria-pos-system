'use client'
// ── Bộ trường lịch lặp dùng chung cho Lớp học và Lịch học ─────
import { Input, Label, Select } from '@/components/ui/input'

export const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()
const timeToMinutes = (value: string) => {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}
const minutesToTime = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

export interface ScheduleFormState {
  days: number[]
  startTime: string
  endTime: string
  startsOn: string
  intervalWeeks: string
  ending: 'NEVER' | 'DATE' | 'COUNT'
  endsOn: string
  occurrenceCount: string
}

/** Lịch đã lưu — đổ được từ `ClassSlot` (Lớp học) lẫn `LessonSeries` (Lịch học). */
export interface ScheduleSource {
  daysOfWeek: number[]
  startTime: string
  durationMin: number
  startsOn: string | Date
  endsOn?: string | Date | null
  intervalWeeks?: number
  occurrenceCount?: number | null
}

export interface ScheduleBody {
  daysOfWeek: number[]
  startTime: string
  durationMin: number
  startsOn: string
  endsOn: string | null
  intervalWeeks: number
  occurrenceCount: number | null
}

export const emptySchedule = (today: string): ScheduleFormState => ({
  days: [],
  startTime: '18:00',
  endTime: '19:30',
  startsOn: today,
  intervalWeeks: '1',
  ending: 'NEVER',
  endsOn: '',
  occurrenceCount: '12',
})

export function scheduleToForm(source: ScheduleSource): ScheduleFormState {
  const startsOn = new Date(new Date(source.startsOn).getTime() + 7 * 3600_000).toISOString().slice(0, 10)
  const endsOn = source.endsOn ? new Date(new Date(source.endsOn).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : ''
  return {
    days: [...source.daysOfWeek].sort((a, b) => a - b),
    startTime: source.startTime,
    endTime: minutesToTime(timeToMinutes(source.startTime) + source.durationMin),
    startsOn,
    intervalWeeks: String(source.intervalWeeks ?? 1),
    ending: source.occurrenceCount ? 'COUNT' : endsOn ? 'DATE' : 'NEVER',
    endsOn,
    occurrenceCount: String(source.occurrenceCount ?? 12),
  }
}

/** Câu lỗi tiếng Việt dùng chung; null khi biểu mẫu hợp lệ. */
export function scheduleError(form: ScheduleFormState): string | null {
  if (!form.days.length) return 'Chọn ít nhất một thứ trong tuần'
  if (!TIME_PATTERN.test(form.startTime) || !TIME_PATTERN.test(form.endTime)) return 'Giờ bắt đầu và giờ kết thúc không hợp lệ'
  if (timeToMinutes(form.endTime) <= timeToMinutes(form.startTime)) return 'Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày'
  if (!form.startsOn) return 'Chọn ngày bắt đầu'
  const intervalWeeks = Number(form.intervalWeeks)
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > 12) return 'Số tuần lặp phải từ 1 đến 12'
  if (form.ending === 'DATE') {
    if (!form.endsOn) return 'Chọn ngày kết thúc lặp'
    if (form.endsOn < form.startsOn) return 'Ngày kết thúc phải sau ngày bắt đầu'
  }
  if (form.ending === 'COUNT') {
    const occurrenceCount = Number(form.occurrenceCount)
    if (!Number.isInteger(occurrenceCount) || occurrenceCount < 1 || occurrenceCount > 500) return 'Số buổi phải từ 1 đến 500'
  }
  return null
}

/** Payload gửi API; trả null khi biểu mẫu chưa hợp lệ. */
export function scheduleBody(form: ScheduleFormState): ScheduleBody | null {
  if (scheduleError(form)) return null
  return {
    daysOfWeek: [...form.days].sort((a, b) => a - b),
    startTime: form.startTime,
    durationMin: timeToMinutes(form.endTime) - timeToMinutes(form.startTime),
    startsOn: form.startsOn,
    endsOn: form.ending === 'DATE' ? form.endsOn : null,
    intervalWeeks: Number(form.intervalWeeks),
    occurrenceCount: form.ending === 'COUNT' ? Number(form.occurrenceCount) : null,
  }
}

/** Mô tả ngắn của lịch đã lưu: 'T2, T5 · 18:00 · 60 phút · mỗi 2 tuần · 12 buổi'. */
export function formatSchedule(source: Pick<ScheduleSource, 'daysOfWeek' | 'startTime' | 'durationMin' | 'intervalWeeks' | 'occurrenceCount'>) {
  const days = [...source.daysOfWeek].sort((a, b) => a - b).map(day => DAY_LABELS[day]).join(', ')
  const repeat = [
    (source.intervalWeeks ?? 1) > 1 ? `mỗi ${source.intervalWeeks} tuần` : '',
    source.occurrenceCount ? `${source.occurrenceCount} buổi` : '',
  ].filter(Boolean).join(' · ')
  return [`${days} · ${source.startTime} · ${source.durationMin} phút`, repeat].filter(Boolean).join(' · ')
}

export function ScheduleFields({ idPrefix, form, onChange, disabled = false, showRepeat = true, startsOnLabel = 'Bắt đầu từ ngày' }: {
  idPrefix: string
  form: ScheduleFormState
  onChange: (next: ScheduleFormState) => void
  disabled?: boolean
  /** false = chỉ ngày + giờ (buổi lẻ); true = thêm thứ trong tuần, số tuần lặp và cách kết thúc. */
  showRepeat?: boolean
  startsOnLabel?: string
}) {
  const patch = (values: Partial<ScheduleFormState>) => onChange({ ...form, ...values })
  return <fieldset disabled={disabled} className="space-y-3">
    {showRepeat && <div>
      <Label required>Các thứ trong tuần</Label>
      <div className="flex flex-wrap gap-1.5">
        {DAY_LABELS.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={form.days.includes(index)}
            className={`min-h-9 min-w-9 rounded-lg border text-sm ${form.days.includes(index) ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-700'}`}
            onClick={() => patch({ days: form.days.includes(index) ? form.days.filter(day => day !== index) : [...form.days, index] })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>}
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor={`${idPrefix}-start-time`} required>Giờ bắt đầu</Label><Input id={`${idPrefix}-start-time`} type="time" value={form.startTime} onChange={event => patch({ startTime: event.target.value })} /></div>
      <div><Label htmlFor={`${idPrefix}-end-time`} required>Giờ kết thúc</Label><Input id={`${idPrefix}-end-time`} type="time" value={form.endTime} onChange={event => patch({ endTime: event.target.value })} /></div>
      <div>
        <Label htmlFor={`${idPrefix}-starts-on`} required>{startsOnLabel}</Label>
        <Input id={`${idPrefix}-starts-on`} type="date" value={form.startsOn} onChange={event => {
          const next = event.target.value
          patch({
            startsOn: next,
            days: showRepeat && next ? [...new Set([...form.days.filter(day => day !== weekdayOf(form.startsOn)), weekdayOf(next)])] : form.days,
          })
        }} />
      </div>
      {showRepeat && <div><Label htmlFor={`${idPrefix}-interval`}>Lặp mỗi bao nhiêu tuần</Label><Input id={`${idPrefix}-interval`} type="number" min={1} max={12} value={form.intervalWeeks} onChange={event => patch({ intervalWeeks: event.target.value })} /></div>}
    </div>
    {showRepeat && <>
      <div>
        <Label htmlFor={`${idPrefix}-ending`}>Kết thúc lặp</Label>
        <Select id={`${idPrefix}-ending`} value={form.ending} onChange={event => patch({ ending: event.target.value as ScheduleFormState['ending'] })}>
          <option value="NEVER">Không kết thúc</option>
          <option value="DATE">Vào ngày</option>
          <option value="COUNT">Sau số buổi</option>
        </Select>
      </div>
      {form.ending === 'DATE' && <Input aria-label="Ngày kết thúc lặp" type="date" min={form.startsOn} value={form.endsOn} onChange={event => patch({ endsOn: event.target.value })} />}
      {form.ending === 'COUNT' && <Input aria-label="Số buổi lặp" type="number" min={1} max={500} value={form.occurrenceCount} onChange={event => patch({ occurrenceCount: event.target.value })} />}
    </>}
  </fieldset>
}
