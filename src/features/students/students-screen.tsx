'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Edit3, GraduationCap, Plus, RefreshCw, Trash2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { NoticeCard } from '@/components/ui/notice-card'
import { Skeleton, SkeletonPage, SkeletonRows } from '@/components/ui/skeleton'
import { SortableCardList, type Column as CardColumn } from '@/components/ui/sortable-card-list'
import { SortableTable, type Column } from '@/components/ui/sortable-table'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiJson } from '@/lib/api'
import { usePageRefresh } from '@/components/layout/page-refresh-context'
import { emptyStudentForm, studentFormBody, StudentFormModal, studentToForm, type StudentForm } from './student-form-modal'
import { studentClassOf, type Student, type CalendarStatus } from './types'

const emptyForm = emptyStudentForm()

export function StudentsScreen() {
  const { success: notifySuccess, error: notifyError } = useToast()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState('')
  const { data: studentsData, isLoading, mutate } = useApi<Student[]>(`/api/students?limit=20&offset=${offset}&search=${encodeURIComponent(query)}&status=${filter}`,  { dedupingInterval: 60_000 })
  const { data: calData, mutate: mutateCal } = useApi<CalendarStatus>('/api/google/status', { dedupingInterval: 60_000 })

  const { registerRefresh } = usePageRefresh()
  useEffect(() => {
    return registerRefresh(() => void mutate())
  }, [registerRefresh, mutate])

  const students = studentsData?.data ?? []
  const error = !studentsData?.success ? (studentsData?.error ?? '') : ''
  const loading = isLoading
  const calStatus = calData?.data

  const [submitting, setSubmitting] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null)
  const [form, setForm] = useState<StudentForm>(emptyForm)

  const openCreate = () => {
    setEditStudent(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  const openEdit = (s: Student) => {
    setEditStudent(s)
    setForm(studentToForm(s))
    setFormOpen(true)
  }

  const closeForm = () => {
    setEditStudent(null)
    setForm(emptyForm)
    setFormOpen(false)
  }

  const handleSubmit = async () => {
    if (!form.fullName.trim()) {
      notifyError('Tên học viên không được để trống')
      return
    }
    setSubmitting(true)
    try {
      const body = studentFormBody(form)
      const data = editStudent
        ? await apiJson<Student>(`/api/students/${editStudent.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await apiJson<Student>('/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!data.success) {
        notifyError(data.error || 'Không lưu được học viên')
        return
      }
      notifySuccess(editStudent ? 'Đã cập nhật học viên' : 'Đã thêm học viên')
      closeForm()
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteStudent) return
    setSubmitting(true)
    try {
      const data = await apiJson(`/api/students/${deleteStudent.id}`, { method: 'DELETE' })
      if (!data.success) {
        notifyError(data.error || 'Không xoá được học viên')
        return
      }
      notifySuccess('Đã xoá học viên')
      setDeleteStudent(null)
      await mutate()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConnect = () => {
    window.location.href = '/api/google/connect'
  }

  const handleDisconnect = async () => {
    setSubmitting(true)
    try {
      const data = await apiJson('/api/google/disconnect', { method: 'POST' })
      if (!data.success) {
        notifyError(data.error || 'Không ngắt kết nối được')
        return
      }
      notifySuccess('Đã ngắt kết nối Google Calendar')
      await mutateCal()
    } catch {
      notifyError('Lỗi kết nối máy chủ')
    } finally {
      setSubmitting(false)
    }
  }

  const statusBadge = (s: Student) =>
    s.status === 'ACTIVE' ? <Badge variant="success">Đang học</Badge> : <Badge variant="default">Dừng học</Badge>

  const remainingText = (s: Student) => {
    const total = s.packages.filter((p) => p.isActive).reduce((sum, p) => sum + (p.total - p.used), 0)
    return total > 0 ? `${total} buổi` : 'Chưa có gói'
  }

  const classCell = (s: Student) => {
    const item = studentClassOf(s)
    return item
      ? <Link href={`/classes/${item.id}`} className="text-sm text-blue-700 hover:underline dark:text-blue-300">{item.name}</Link>
      : <span className="text-sm text-zinc-400 dark:text-zinc-500">Chưa vào lớp</span>
  }

  const columns: Column<Student>[] = useMemo(() => [
    {
      key: 'fullName',
      label: 'Học viên',
      cellClassName: 'px-4 py-3 font-medium text-zinc-950 dark:text-white',
      render: (item) => (
        <div className="flex items-center gap-2">
          {item.fullName}
          {statusBadge(item)}
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'SĐT',
      cellClassName: 'px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400',
      render: (item) => item.phone || '—',
    },
    {
      key: 'class',
      label: 'Lớp',
      cellClassName: 'px-4 py-3',
      render: (item) => classCell(item),
    },
    {
      key: 'remaining',
      label: 'Còn lại',
      cellClassName: 'px-4 py-3 text-sm tabular-nums text-zinc-950 dark:text-white',
      render: (item) => remainingText(item),
    },
    {
      label: 'Thao tác',
      cellClassName: 'px-4 py-3',
      render: (item) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" icon={CalendarClock} disabled={submitting} onClick={() => router.push(`/students/${item.id}`)} title="Lịch học" />
          <Button variant="secondary" size="sm" icon={Edit3} disabled={submitting} onClick={() => openEdit(item)} title="Sửa" />
          <Button variant="outline-danger" size="sm" icon={Trash2} disabled={submitting} onClick={() => setDeleteStudent(item)} title="Xoá" />
        </div>
      ),
    },
  ], [submitting, router])

  const cardColumns: CardColumn<Student>[] = useMemo(() => [
    {
      key: 'fullName',
      label: 'Học viên',
      render: (item) => (
        <span className="flex items-center gap-2 text-base font-semibold text-zinc-950 dark:text-white">
          {item.fullName}
          {statusBadge(item)}
        </span>
      ),
    },
    { key: 'phone', label: 'SĐT', render: (item) => item.phone || '—' },
    { key: 'class', label: 'Lớp', render: (item) => classCell(item) },
    { key: 'remaining', label: 'Còn lại', render: (item) => <span className="font-semibold tabular-nums">{remainingText(item)}</span> },
    {
      label: '',
      render: (item) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" icon={CalendarClock} disabled={submitting} onClick={() => router.push(`/students/${item.id}`)} title="Lịch học" />
          <Button variant="secondary" size="sm" icon={Edit3} disabled={submitting} onClick={() => openEdit(item)} title="Sửa" />
          <Button variant="outline-danger" size="sm" icon={Trash2} disabled={submitting} onClick={() => setDeleteStudent(item)} title="Xoá" />
        </div>
      ),
    },
  ], [submitting, router])

  if (loading) {
    return (
      <SkeletonPage maxWidth="max-w-3xl">
          <Skeleton className="h-10 w-48" />
          <SkeletonRows count={2} />
      </SkeletonPage>
    )
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="hidden items-center justify-between gap-3 md:flex">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-950 dark:text-white">
              <GraduationCap size={24} className="text-amber-500" />
              Học viên
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={CalendarClock} onClick={() => router.push('/lessons')}>
              Lịch học
            </Button>
            <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
              Thêm học viên
            </Button>
          </div>
        </header>

        {/* Mobile actions */}
        <div className="flex gap-2 md:hidden">
          <Button variant="primary" size="md" icon={Plus} fullWidth onClick={openCreate}>
            Thêm học viên
          </Button>
          <Button variant="secondary" size="md" icon={CalendarClock} fullWidth onClick={() => router.push('/lessons')}>
            Lịch học
          </Button>
        </div>

        {/* Google Calendar connect */}
        <Card padding="md" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <RefreshCw size={20} className={`shrink-0 ${calStatus?.connected ? 'text-emerald-500' : 'text-zinc-400'}`} />
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                Google Calendar {calStatus?.connected ? `(${calStatus.email ?? ''})` : ''}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {calStatus?.connected
                  ? 'Đã kết nối — buổi học sẽ đồng bộ sang calendar CLB.'
                  : calStatus?.isConfigured
                    ? 'Kết nối để đồng bộ buổi học sang Google Calendar.'
                    : 'Chưa cấu hình Google Calendar (cần GOOGLE_CLIENT_ID/SECRET).'}
              </p>
            </div>
          </div>
          {calStatus?.connected ? (
            <Button variant="outline-danger" size="sm" disabled={submitting} onClick={handleDisconnect}>
              Ngắt kết nối
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled={!calStatus?.isConfigured} onClick={handleConnect}>
              Kết nối Google
            </Button>
          )}
        </Card>

        {error && <NoticeCard tone="danger" title="Không tải được dữ liệu" description={error} />}

        <div className="flex flex-wrap gap-2"><Input aria-label="Tìm học viên" placeholder="Tìm tên hoặc số điện thoại" value={query} onChange={e => { setQuery(e.target.value); setOffset(0) }} /><Select aria-label="Trạng thái học viên" value={filter} onChange={e => { setFilter(e.target.value); setOffset(0) }}><option value="">Tất cả trạng thái</option><option value="ACTIVE">Đang học</option><option value="INACTIVE">Đã nghỉ</option></Select></div>
        <div className="md:hidden">
          <SortableCardList
            columns={cardColumns}
            data={students}
            keyExtractor={(s) => s.id}
            sortableKeys={['fullName']}
            defaultSortKey="fullName"
            defaultSortDir="asc"
            emptyIcon={Users}
            emptyMessage="Chưa có học viên"
            emptyDescription="Thêm học viên để xếp lịch học."
          />
        </div>

        <div className="hidden md:block">
          <SortableTable
            columns={columns}
            data={students}
            keyExtractor={(s) => s.id}
            sortableKeys={['fullName', 'phone']}
            defaultSortKey="fullName"
            defaultSortDir="asc"
            emptyIcon={Users}
            emptyMessage="Chưa có học viên"
            emptyDescription="Thêm học viên để xếp lịch học."
          />
        </div>

        <div className="flex items-center justify-between"><Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 20))}>Trước</Button><span className="text-sm">Trang {offset / 20 + 1}</span><Button variant="secondary" disabled={students.length < 20} onClick={() => setOffset(n => n + 20)}>Tiếp</Button></div>
        <StudentFormModal
          open={formOpen}
          student={editStudent}
          form={form}
          submitting={submitting}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={() => void handleSubmit()}
        />

        <ConfirmDialog
          open={!!deleteStudent}
          onClose={() => setDeleteStudent(null)}
          title="Xóa học viên"
          description={deleteStudent ? `Học viên "${deleteStudent.fullName}" sẽ bị xoá (giữ lại lịch sử).` : undefined}
          confirmLabel="Xoá"
          submitting={submitting}
          onConfirm={handleConfirmDelete}
        />
      </div>
    </div>
  )
}
