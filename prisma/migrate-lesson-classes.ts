/**
 * Migration data: chuyển các chuỗi lặp (LessonSeries) đang hoạt động thành lớp học (LessonClass).
 *
 * Bối cảnh:
 * - Trước đây lịch lặp chỉ tồn tại như `LessonSeries` (không có thực thể lớp).
 * - Tính năng Lớp học thêm `LessonClass` + `LessonSeries.classId`; mỗi lớp có nhiều khung giờ.
 *
 * Cách xử lý:
 * - Mỗi `LessonSeries` có `isActive = true` và chưa thuộc lớp → tạo 1 lớp
 *   (name = title, coachName = coachName) rồi gán `class_id`.
 * - Lấy luôn `series.id` làm `class.id` để chạy lại an toàn và truy vết được nguồn.
 * - Chuỗi đã kết thúc (`isActive = false`) giữ `class_id = null`: vẫn hiện trên lịch toàn cục,
 *   không làm rác danh sách lớp (admin có thể tự tạo lớp nếu cần).
 * - Chuỗi bị tách khi sửa lịch sẽ thành nhiều lớp cùng tên → admin tự sửa/kết thúc trong UI.
 *
 * Idempotent: chạy lại nhiều lần vẫn an toàn.
 *
 * Chạy: npm run migrate:lesson-classes
 */
import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL chưa được cấu hình trong .env')
  }

  const series = await prisma.lessonSeries.findMany({
    where: { isActive: true, classId: null },
    select: { id: true, title: true, coachName: true, students: { select: { studentId: true } } },
    orderBy: { startsOn: 'asc' },
  })

  console.log(`Tìm thấy ${series.length} chuỗi lặp đang hoạt động cần chuyển thành lớp`)

  let created = 0
  let skipped = 0

  for (const item of series) {
    const existing = await prisma.lessonClass.findUnique({ where: { id: item.id } })
    if (existing) {
      await prisma.lessonSeries.update({ where: { id: item.id }, data: { classId: existing.id } })
      skipped += 1
      continue
    }
    await prisma.$transaction(async tx => {
      await tx.lessonClass.create({
        data: { id: item.id, name: item.title, coachName: item.coachName, isActive: true, students: { create: item.students.map(row => ({ studentId: row.studentId })) } },
      })
      await tx.lessonSeries.update({ where: { id: item.id }, data: { classId: item.id } })
    })
    created += 1
    console.log(`  ✓ "${item.title}" — ${item.students.length} học viên`)
  }

  console.log('Hoàn tất:')
  console.log(`  - Lớp đã tạo: ${created}`)
  console.log(`  - Chuỗi đã có lớp (bỏ qua tạo mới): ${skipped}`)
}

main()
  .catch((error) => {
    console.error('Migration thất bại:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
