'use client'
// ── Form thêm/sửa học viên dùng chung cho màn danh sách và màn chi tiết ─────
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import type { Student } from './types'

export interface StudentForm {
  fullName: string
  phone: string
  birthYear: string
  notes: string
  status: 'ACTIVE' | 'INACTIVE'
}

export const emptyStudentForm = (): StudentForm => ({ fullName: '', phone: '', birthYear: '', notes: '', status: 'ACTIVE' })

export const studentToForm = (student: Pick<Student, 'fullName' | 'phone' | 'birthYear' | 'notes' | 'status'>): StudentForm => ({
  fullName: student.fullName,
  phone: student.phone ?? '',
  birthYear: student.birthYear ? String(student.birthYear) : '',
  notes: student.notes ?? '',
  status: student.status,
})

export const studentFormBody = (form: StudentForm) => ({
  fullName: form.fullName.trim(),
  phone: form.phone.trim(),
  birthYear: form.birthYear ? Number(form.birthYear) : null,
  notes: form.notes.trim(),
  status: form.status,
})

export function StudentFormModal({ open, student, form, submitting, onChange, onClose, onSubmit }: {
  open: boolean
  /** null = thêm mới (ẩn trạng thái vì học viên mới luôn Đang học). */
  student: Student | null
  form: StudentForm
  submitting: boolean
  onChange: (form: StudentForm) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return <Modal
    open={open}
    onClose={onClose}
    title={student ? 'Sửa học viên' : 'Thêm học viên'}
    size="md"
    footer={
    <Button variant="contrast" size="lg" fullWidth disabled={submitting || !form.fullName.trim()} onClick={onSubmit}>
        {submitting ? 'Đang lưu...' : student ? 'Cập nhật' : 'Thêm học viên'}
      </Button>
    }
  >
    <div className="space-y-3">
      <div>
        <Label htmlFor="student-name" required>Tên học viên</Label>
        <Input autoFocus id="student-name" maxLength={100} value={form.fullName} onChange={event => onChange({ ...form, fullName: event.target.value })} placeholder="Họ và tên" />
      </div>
      <div>
        <Label htmlFor="student-phone">Số điện thoại</Label>
        <Input id="student-phone" maxLength={20} value={form.phone} onChange={event => onChange({ ...form, phone: event.target.value })} placeholder="0xxxxxxxxx" />
      </div>
      <div>
        <Label htmlFor="student-birth">Năm sinh</Label>
        <Input id="student-birth" type="number" min={1900} max={2100} value={form.birthYear} onChange={event => onChange({ ...form, birthYear: event.target.value })} placeholder="VD: 2005" />
      </div>
      {student && <div>
        <Label htmlFor="student-status">Trạng thái</Label>
        <Select id="student-status" value={form.status} onChange={event => onChange({ ...form, status: event.target.value as StudentForm['status'] })}>
          <option value="ACTIVE">Đang học</option>
          <option value="INACTIVE">Dừng học</option>
        </Select>
      </div>}
      <div>
        <Label htmlFor="student-notes">Ghi chú</Label>
        <Textarea id="student-notes" rows={3} maxLength={2000} value={form.notes} onChange={event => onChange({ ...form, notes: event.target.value })} placeholder="Ghi chú (tuỳ chọn)" />
      </div>
    </div>
  </Modal>
}
