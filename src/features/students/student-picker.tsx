'use client'
import { useState } from 'react'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useApi } from '@/hooks/use-api'
import type { Student } from './types'

export function StudentPicker({ value, onChange, disabled = false, initial = [] }: {
  value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; initial?: { id: string; fullName: string }[]
}) {
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(initial.map(s => [s.id, s.fullName])))
  const { data, isLoading } = useApi<Student[]>(`/api/students?status=ACTIVE&limit=20&offset=${offset}&search=${encodeURIComponent(search)}`)
  const rows = data?.data ?? []
  return <fieldset disabled={disabled} className="space-y-2">
    <Label htmlFor="lesson-student-search" required>Học viên ({value.length})</Label>
    <Input id="lesson-student-search" placeholder="Tìm tên hoặc số điện thoại" value={search} onChange={e => { setSearch(e.target.value); setOffset(0) }} />
    {value.length > 0 && <div className="flex flex-wrap gap-2">{value.map(id => <button key={id} type="button" disabled={disabled} className="rounded-md bg-blue-50 px-2 py-1 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-100" onClick={() => onChange(value.filter(v => v !== id))} aria-label={`Bỏ ${names[id] ?? id}`}>{names[id] ?? rows.find(s => s.id === id)?.fullName ?? 'Học viên đã chọn'}</button>)}</div>}
    <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      {rows.map(student => <label key={student.id} className="flex min-h-10 cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
        <input type="checkbox" checked={value.includes(student.id)} onChange={e => { setNames(n => ({ ...n, [student.id]: student.fullName })); onChange(e.target.checked ? [...value, student.id] : value.filter(id => id !== student.id)) }} />
        {student.fullName}{student.phone && <span className="ml-auto text-xs text-zinc-500">{student.phone}</span>}
      </label>)}
      {!rows.length && <p className="p-3 text-sm text-zinc-500">{isLoading ? 'Đang tìm...' : data?.success === false ? 'Không tải được học viên' : 'Không có học viên phù hợp'}</p>}
    </div>
    <div className="flex justify-between"><Button type="button" variant="ghost" size="xs" disabled={disabled || offset === 0} onClick={() => setOffset(n => Math.max(0, n - 20))}>Trước</Button><Button type="button" variant="ghost" size="xs" disabled={disabled || rows.length < 20} onClick={() => setOffset(n => n + 20)}>Tiếp</Button></div>
  </fieldset>
}
