// ── Use-cases: quản lý gói buổi học của học viên ─────
import { err } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { LessonPackageRecord } from '../ports'

// ── Create ──
export interface CreatePackageInput {
  staffId: string
  studentId: string
  name: string
  total: number
}

export async function createPackage(
  input: CreatePackageInput,
  deps: Repositories = repositories
): Promise<Result<LessonPackageRecord>> {
  const student = await deps.student.findById(input.studentId)
  if (!student) return err('STUDENT_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    const pkg = await tx.lessonPackage.create({
      studentId: input.studentId,
      name: input.name.trim(),
      total: input.total,
    })

    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_PACKAGE_CREATE',
      entityType: 'LessonPackage',
      entityId: pkg.id,
      details: { studentId: input.studentId, name: pkg.name, total: pkg.total },
    })

    return pkg
  })

  return result
}

// ── Update (chỉ tăng total / đổi tên / vô hiệu) ──
export interface UpdatePackageInput {
  staffId: string
  packageId: string
  name?: string
  total?: number
  isActive?: boolean
}

export async function updatePackage(
  input: UpdatePackageInput,
  deps: Repositories = repositories
): Promise<Result<LessonPackageRecord>> {
  const existing = await deps.lessonPackage.findById(input.packageId)
  if (!existing) return err('LESSON_PACKAGE_NOT_FOUND')

  const result = await runInTransaction(async (tx) => {
    const data: Record<string, unknown> = {}
    if (input.name !== undefined) data.name = input.name.trim()
    if (input.total !== undefined) data.total = input.total
    if (input.isActive !== undefined) data.isActive = input.isActive

    const pkg = await tx.lessonPackage.update(input.packageId, data)

    await tx.audit.append({
      userId: input.staffId,
      action: 'LESSON_PACKAGE_UPDATE',
      entityType: 'LessonPackage',
      entityId: input.packageId,
      details: {
        before: { total: existing.total, isActive: existing.isActive },
        after: { total: pkg.total, isActive: pkg.isActive },
      },
    })

    return pkg
  })

  return result
}

export function mapCreatePackageError(error: DomainError): HttpErrorInfo {
  if (error.code === 'STUDENT_NOT_FOUND') {
    return { code: 'STUDENT_NOT_FOUND', message: 'Không tìm thấy học viên', status: 404 }
  }
  return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
}

export function mapUpdatePackageError(error: DomainError): HttpErrorInfo {
  if (error.code === 'LESSON_PACKAGE_NOT_FOUND') {
    return { code: 'LESSON_PACKAGE_NOT_FOUND', message: 'Không tìm thấy gói buổi học', status: 404 }
  }
  return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
}
