import { z } from 'zod'

export const createStudentSchema = z.object({
  fullName: z.string().min(1, 'Tên học viên không được để trống').max(100),
  phone: z.string().max(20).optional().or(z.literal('')),
  birthYear: z.number().int().min(1900).max(2100).optional().nullable(),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

export const updateStudentSchema = createStudentSchema
  .partial()
  .extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() })

export const createPackageSchema = z.object({
  studentId: z.string().uuid('Mã học viên không hợp lệ'),
  name: z.string().min(1, 'Tên gói không được để trống').max(100),
  total: z.number().int().positive('Số buổi phải lớn hơn 0'),
})

export const updatePackageSchema = z.object({
  name: z.string().min(1, 'Tên gói không được để trống').max(100).optional(),
  total: z.number().int().positive('Số buổi phải lớn hơn 0').optional(),
  isActive: z.boolean().optional(),
})

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export const createLessonSchema = z.object({
  title: z.string().min(1, 'Tiêu đề buổi học không được để trống').max(150),
  coachName: z.string().max(100).optional().or(z.literal('')),
  startsAt: z.string().min(1, 'Thiếu thời gian bắt đầu').refine((v) => !Number.isNaN(Date.parse(v)), 'Thời gian bắt đầu không hợp lệ'),
  durationMin: z.number().int().positive('Thời lượng phải > 0').max(1440).default(60),
  studentIds: z.array(z.string().uuid('Mã học viên không hợp lệ')).min(1, 'Chọn ít nhất 1 học viên'),
  note: z.string().max(2000).optional().or(z.literal('')),
})

export const updateLessonSchema = z.object({
  title: z.string().min(1, 'Tiêu đề buổi học không được để trống').max(150).optional(),
  coachName: z.string().max(100).optional().or(z.literal('')),
  startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Thời gian bắt đầu không hợp lệ').optional(),
  durationMin: z.number().int().positive('Thời lượng phải > 0').max(1440).optional(),
  note: z.string().max(2000).optional().or(z.literal('')),
})

export const createSeriesSchema = z.object({
  title: z.string().min(1, 'Tiêu đề lịch học không được để trống').max(150),
  coachName: z.string().max(100).optional().or(z.literal('')),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Chọn ít nhất 1 ngày trong tuần'),
  startTime: z.string().regex(timePattern, 'Giờ bắt đầu không hợp lệ (vd: 18:00)'),
  durationMin: z.number().int().positive('Thời lượng phải > 0').max(1440).default(60),
  startsOn: z.string().min(1, 'Thiếu ngày bắt đầu').refine((v) => !Number.isNaN(Date.parse(v)), 'Ngày bắt đầu không hợp lệ'),
  endsOn: z.string().optional().nullable().refine((v) => v == null || v === '' || !Number.isNaN(Date.parse(v)), 'Ngày kết thúc không hợp lệ'),
  studentIds: z.array(z.string().uuid('Mã học viên không hợp lệ')).min(1, 'Chọn ít nhất 1 học viên'),
})

export const markAttendanceSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.string().uuid('Mã học viên không hợp lệ'),
        status: z.enum(['COMPLETED', 'ABSENT', 'SCHEDULED']),
        note: z.string().max(2000).optional().or(z.literal('')),
      })
    )
    .min(1, 'Không có học viên nào để điểm danh'),
})

export const connectCalendarSchema = z.object({
  code: z.string().min(1, 'Thiếu mã xác thực'),
  state: z.string().min(1, 'Thiếu state'),
})

export type StudentCreateInput = z.infer<typeof createStudentSchema>
export type StudentUpdateInput = z.infer<typeof updateStudentSchema>
export type PackageCreateInput = z.infer<typeof createPackageSchema>
export type PackageUpdateInput = z.infer<typeof updatePackageSchema>
export type LessonCreateInput = z.infer<typeof createLessonSchema>
export type LessonUpdateInput = z.infer<typeof updateLessonSchema>
export type SeriesCreateInput = z.infer<typeof createSeriesSchema>
export type AttendanceMarkInput = z.infer<typeof markAttendanceSchema>
export type CalendarConnectInput = z.infer<typeof connectCalendarSchema>
