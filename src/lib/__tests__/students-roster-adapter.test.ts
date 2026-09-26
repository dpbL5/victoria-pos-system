import { expect, it, vi } from 'vitest'
import { createLessonRepository } from '@/lib/infrastructure/adapters/student-adapter'
import { RollbackSignal } from '@/lib/infrastructure/db-helpers'

vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

it('mọi đường đổi học viên đều giữ dòng có ghi chú trước khi xoá khỏi buổi', async () => {
  const findFirst = vi.fn(async () => ({ studentId: 'a', note: 'Chuẩn bị' }))
  const deleteMany = vi.fn()
  const createMany = vi.fn()
  const repo = createLessonRepository({ lessonStudent: { findFirst, deleteMany, createMany } } as never)
  await expect(repo.replaceStudents('lesson', ['b'])).rejects.toBeInstanceOf(RollbackSignal)
  expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ lessonId: 'lesson', studentId: { notIn: ['b'] } }) }))
  expect(deleteMany).not.toHaveBeenCalled()
  expect(createMany).not.toHaveBeenCalled()
})
