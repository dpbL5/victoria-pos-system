// ── Use-cases: CRUD học viên ─────
import { err } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { StudentRecord } from '../ports'

// ── Create ──
export interface CreateStudentInput {
  staffId: string
  fullName: string
  phone?: string
  birthYear?: number | null
  notes?: string
}

export async function createStudent(input: CreateStudentInput): Promise<Result<StudentRecord>> {
  const result = await runInTransaction(async (tx) => {
    const student = await tx.student.create({
      fullName: input.fullName.trim(),
      phone: input.phone ? input.phone.trim() : undefined,
      birthYear: input.birthYear ?? undefined,
      notes: input.notes ? input.notes.trim() : undefined,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'STUDENT_CREATE',
      entityType: 'Student',
      entityId: student.id,
      details: { fullName: student.fullName, phone: student.phone },
    })

    return student
  })

  return result
}

// ── Update ──
export interface UpdateStudentInput {
  staffId: string
  studentId: string
  fullName?: string
  phone?: string
  birthYear?: number | null
  notes?: string
  status?: 'ACTIVE' | 'INACTIVE'
}

export async function updateStudent(
  input: UpdateStudentInput,
  deps: Repositories = repositories
): Promise<Result<StudentRecord>> {
  const existing = await deps.student.findByIdIncludingDeleted(input.studentId)
  if (!existing || existing.deletedAt) return err('STUDENT_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    const data: Record<string, unknown> = {}
    if (input.fullName !== undefined) data.fullName = input.fullName.trim()
    if (input.phone !== undefined) data.phone = input.phone ? input.phone.trim() : null
    if (input.birthYear !== undefined) data.birthYear = input.birthYear ?? null
    if (input.notes !== undefined) data.notes = input.notes ? input.notes.trim() : null
    if (input.status !== undefined) data.status = input.status

    const student = await tx.student.update(input.studentId, data)

    await tx.audit.append({
      userId: input.staffId,
      action: 'STUDENT_UPDATE',
      entityType: 'Student',
      entityId: input.studentId,
      details: { before: { fullName: existing.fullName }, after: { fullName: student.fullName } },
    })

    return student
  })

  return result
}

// ── Delete (soft delete) ──
export interface DeleteStudentInput {
  staffId: string
  studentId: string
}

export async function deleteStudent(
  input: DeleteStudentInput,
  deps: Repositories = repositories
): Promise<Result<StudentRecord>> {
  const existing = await deps.student.findByIdIncludingDeleted(input.studentId)
  if (!existing || existing.deletedAt) return err('STUDENT_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    const student = await tx.student.softDelete(input.studentId)

    await tx.audit.append({
      userId: input.staffId,
      action: 'STUDENT_DELETE',
      entityType: 'Student',
      entityId: input.studentId,
      details: { fullName: student.fullName },
    })

    return student
  })

  return result
}

// ── Error mapping ──
function mapStudentError(error: DomainError): HttpErrorInfo {
  if (error.code === 'STUDENT_NOT_FOUND') {
    return { code: 'STUDENT_NOT_FOUND', message: 'Không tìm thấy học viên', status: 404 }
  }
  return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
}

export const mapCreateStudentError = mapStudentError
export const mapUpdateStudentError = mapStudentError
export const mapDeleteStudentError = mapStudentError
