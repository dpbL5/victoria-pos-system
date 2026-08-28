'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarClock, GraduationCap, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton, SkeletonPage, SkeletonPanel } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import type { Student, LessonPackage, Lesson } from './types'

interface StudentDetailProps {
  id: string
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function StudentDetailScreen({ id }: StudentDetailProps) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const router = useRouter()
  const { data: studentData, isLoading, mutate } = useApi<Student>(`/api/students/${id}`)
  const { data: lessonsData, mutate: mutateLessons } = useApi<{ upcoming: Lesson[]; past: Lesson[] }>(`/api/students/${id}/lessons`)

  const { registerRefresh } = usePageRefresh()
  useEffect(() => {
    return registerRefresh(() => void Promise.all([mutate(), mutateLessons()]))
  }, [registerRefresh, mutate, mutateLessons])

  const student = studentData?.data
  const error = studentData && !studentData.success ? (studentData.error ?? '') : ''
  const loading = isLoading
  const upcoming = lessonsData?.data?.upcoming ?? []
  const past = lessonsData?.data?.past ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ fullName: '', phone: '', birthYear: '', notes: '', status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' })
  const [pkgOpen, setPkgOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const openEdit = useCallback(() => {
    if (!student) return
    setForm({
      fullName: student.fullName,
      phone: student.phone ?? '',
      birthYear: student.birthYear ? String(student.birthYear) : '',
      notes: student.notes ?? '',
      status: student.status,
    })
    setFormOpen(true)
  }, [student])

  const handleSubmit = async () => {
    if (!student) return
    if (!form.fullName.trim()) {
      notifyError('Tên học viên không được để trống')
      return
    }
    setSubmitting(true)
    try {
      const data = await apiJson<Student>(`/api/students/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || undefined,
          birthYear: form.birthYear ? Number(form.birthYear) : null,
          notes: form.notes.trim() || undefined,
          status: form.status,
        }),
      })
      if (!data.success) {
        notifyError(data.error || 'Không cập nhật được')
        return
      }
      notifySuccess('Đã cập nhật học viên')
      setFormOpen(false)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !student) {
    return (
      <SkeletonPage maxWidth="max-w-3xl">
          <Skeleton className="h-10 w-48" />
          <SkeletonPanel><Skeleton className="h-40 w-full" /></SkeletonPanel>
          <SkeletonPanel><Skeleton className="h-40 w-full" /></SkeletonPanel>
      </SkeletonPage>
    )
  }

  if (!student) {
    return (
      <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
        <div className="mx-auto max-w-3xl">
          <NoticeCard tone="danger" title="Không tìm thấy học viên" description={error || 'Học viên không tồn tại hoặc đã bị xoá.'} />
        </div>
      </div>
    )
  }

  const totalRemaining = student.packages.filter((p) => p.isActive).reduce((sum, p) => sum + Math.max(0, p.total - p.used), 0)

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.push('/students')} title="Quay lại" />
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-950 dark:text-white">
            <GraduationCap size={24} className="text-amber-500" />
            {student.fullName}
          </h1>
          {student.status === 'ACTIVE' ? <Badge variant="success">Đang học</Badge> : <Badge variant="default">Dừng học</Badge>}
        </header>

        {/* Profile */}
        <Card padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Thông tin</h2>
            <Button variant="secondary" size="sm" onClick={openEdit}>Sửa</Button>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">SĐT</dt><dd className="font-medium">{student.phone || '—'}</dd></div>
            <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Năm sinh</dt><dd className="font-medium">{student.birthYear || '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-zinc-500 dark:text-zinc-400">Ghi chú</dt><dd className="font-medium">{student.notes || '—'}</dd></div>
          </dl>
        </Card>

        {/* Packages */}
        <Card padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Gói buổi học <Badge variant="blue" size="sm">còn {totalRemaining} buổi</Badge>
            </h2>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setPkgOpen(true)}>Thêm gói</Button>
          </div>
          {student.packages.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Chưa có gói buổi học.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {student.packages.map((p) => {
                const remain = Math.max(0, p.total - p.used)
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">{p.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{p.total} buổi · đã dùng {p.used} · {p.isActive ? 'đang hoạt động' : 'ngừng'}</p>
                    </div>
                    <Badge variant={remain > 0 ? 'success' : 'default'}>còn {remain}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Lessons */}
        <Card padding="none">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Lịch học</h2>
            <Button variant="secondary" size="sm" icon={CalendarClock} onClick={() => router.push('/lessons')}>Xếp lịch</Button>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {upcoming.length === 0 && past.length === 0 && (
              <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">Chưa có buổi học nào.</p>
            )}
            {upcoming.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{l.title}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{fmtDate(l.startsAt)} · {l.durationMin} phút</p>
                </div>
                <Badge variant="blue">Sắp tới</Badge>
              </div>
            ))}
            {past.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{l.title}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{fmtDate(l.startsAt)} · {l.durationMin} phút</p>
                  {l.students.find((s) => s.studentId === id)?.note && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-300">Note: {l.students.find((s) => s.studentId === id)?.note}</p>
                  )}
                </div>
                <Badge variant={l.students.find((s) => s.studentId === id)?.status === 'COMPLETED' ? 'success' : l.students.find((s) => s.studentId === id)?.status === 'ABSENT' ? 'danger' : 'default'}>
                  {l.students.find((s) => s.studentId === id)?.status === 'COMPLETED' ? 'Hoàn thành' : l.students.find((s) => s.studentId === id)?.status === 'ABSENT' ? 'Vắng' : '—'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Edit modal */}
        <Modal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="Sửa học viên"
          size="md"
          footer={
            <Button variant="inverse" size="lg" fullWidth disabled={submitting || !form.fullName.trim()} onClick={handleSubmit}>
              {submitting ? 'Đang lưu...' : 'Cập nhật'}
            </Button>
          }
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="detail-name" required>Tên học viên</Label>
              <Input id="detail-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="detail-phone">Số điện thoại</Label>
              <Input id="detail-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="detail-birth">Năm sinh</Label>
              <Input id="detail-birth" type="number" min={1900} max={2100} value={form.birthYear} onChange={(e) => setForm({ ...form, birthYear: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="detail-notes">Ghi chú</Label>
              <Input id="detail-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="detail-status">Trạng thái</Label>
              <select
                id="detail-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="ACTIVE">Đang học</option>
                <option value="INACTIVE">Dừng học</option>
              </select>
            </div>
          </div>
        </Modal>

        {pkgOpen && (
          <PackageModal student={student} onClose={() => setPkgOpen(false)} onSaved={() => { setPkgOpen(false); void mutate() }} />
        )}
      </div>
    </div>
  )
}

// ── Quản lý gói buổi của học viên ──
function PackageModal({
  student,
  onClose,
  onSaved,
}: {
  student: Student
  onClose: () => void
  onSaved: () => void
}) {
  const { success: notifySuccess, error: notifyError } = useToast()
  const { data: pkgData, mutate } = useApi<LessonPackage[]>(`/api/students/${student.id}/packages`)
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [total, setTotal] = useState('')

  const packages = pkgData?.data ?? []

  const handleAdd = async () => {
    const n = Number(total)
    if (!name.trim() || !Number.isInteger(n) || n <= 0) {
      notifyError('Nhập tên gói và số buổi hợp lệ')
      return
    }
    setSubmitting(true)
    try {
      const data = await apiJson<LessonPackage>(`/api/students/${student.id}/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), total: n }),
      })
      if (!data.success) {
        notifyError(data.error || 'Không tạo được gói')
        return
      }
      notifySuccess('Đã thêm gói buổi học')
      setName('')
      setTotal('')
      await mutate()
      onSaved()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Gói buổi học — ${student.fullName}`} size="md">
      <div className="space-y-3">
        {packages.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">Chưa có gói buổi học nào.</p>}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {packages.map((p) => {
            const remain = Math.max(0, p.total - p.used)
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{p.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{p.total} buổi, đã dùng {p.used}</p>
                </div>
                <Badge variant={remain > 0 ? 'success' : 'default'}>còn {remain}</Badge>
              </li>
            )
          })}
        </ul>

        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">Thêm gói mới</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Tên gói (VD: Gói 12 buổi)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input type="number" min={1} placeholder="Số buổi" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <Button variant="primary" size="md" fullWidth className="mt-2" disabled={submitting} onClick={handleAdd}>
            {submitting ? 'Đang lưu...' : 'Thêm gói'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
