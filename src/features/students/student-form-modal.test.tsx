import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { emptyStudentForm, StudentFormModal, studentFormBody, studentToForm } from './student-form-modal'
import type { Student } from './types'

const student = { id: 's1', fullName: 'Nguyễn Văn A', phone: '0900000000', birthYear: 2005, notes: null, status: 'ACTIVE' } as Student
const noop = () => {}

const render = (target: Student | null) =>
  renderToStaticMarkup(<StudentFormModal open student={target} form={emptyStudentForm()} submitting={false} onChange={noop} onClose={noop} onSubmit={noop} />)

it('hiện trạng thái khi sửa và ẩn khi thêm mới', () => {
  expect(render(student)).toContain('Trạng thái')
  expect(render(null)).not.toContain('Trạng thái')
})

it('dùng cùng bộ trường và câu chữ ở mọi màn', () => {
  const html = render(student)

  expect(html).toContain('Sửa học viên')
  expect(html).toContain('Tên học viên')
  expect(html).toContain('Số điện thoại')
  expect(html).toContain('Năm sinh')
  expect(html).toContain('Ghi chú')
  expect(html).toContain('Cập nhật')
})

it('studentFormBody chuẩn hoá dữ liệu gửi API', () => {
  expect(studentFormBody({ fullName: '  A  ', phone: ' 0900 ', birthYear: '', notes: ' note ', status: 'INACTIVE' })).toEqual({
    fullName: 'A',
    phone: '0900',
    birthYear: null,
    notes: 'note',
    status: 'INACTIVE',
  })
})

it('studentToForm đổ dữ liệu học viên vào form', () => {
  expect(studentToForm(student)).toEqual({ fullName: 'Nguyễn Văn A', phone: '0900000000', birthYear: '2005', notes: '', status: 'ACTIVE' })
})
