// ── Use-cases: Lớp học — danh tính + sổ học viên + khung giờ ─────
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import { err, ok, type DomainError } from '@/lib/shared/result'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { repositories, type Repositories } from '@/lib/infrastructure/repositories'
import type { LessonClassRecord, LessonRecord } from '../ports'
import { classRoster, classRosterIds, type ClassSlotInput } from '../helpers/classes'
import { DAY_MS, SERIES_HORIZON_DAYS, weeklyOccurrences, weeklyRrule, type WeeklySchedule } from '../helpers/calendar'
import {
  closeSeriesFrom,
  deleteSeries,
  isLessonLocked,
  mapLessonError,
  materialize,
  seriesAvailable,
  studentsActive,
  updateSeries,
} from './lesson-crud'
import { assertStudentsInSingleClass } from './class-guards'
import { calendarAccessToken } from './calendar-sync'

const isolation = { isolationLevel: 'Serializable', timeout: 60000 } as const

const toSchedule = (slot: ClassSlotInput): WeeklySchedule => ({
  daysOfWeek: slot.daysOfWeek,
  startTime: slot.startTime,
  startsOn: slot.startsOn,
  endsOn: slot.endsOn ?? null,
  intervalWeeks: slot.intervalWeeks ?? 1,
  occurrenceCount: slot.occurrenceCount ?? null,
})

const horizon = (startsOn: Date) => new Date(Math.max(Date.now(), startsOn.getTime()) + SERIES_HORIZON_DAYS * DAY_MS)

/** Buổi neo để tách/đóng chuỗi: buổi sớm nhất còn ở tương lai và chưa huỷ. */
const anchorLesson = (lessons: LessonRecord[], now = new Date()) =>
  lessons.find(l => l.startsAt >= now && l.status !== 'CANCELLED')

/** Tạo khung giờ (LessonSeries) gắn lớp — dùng chung cho tạo lớp và thêm khung. */
export async function createSlotInTx(
  tx: Repositories,
  input: { classId: string; title: string; coachName?: string | null; slot: ClassSlotInput; studentIds: string[] }
) {
  const schedule = toSchedule(input.slot)
  if (!weeklyOccurrences(schedule, schedule.startsOn, new Date(schedule.startsOn.getTime() + 90 * DAY_MS)).length) fail('SERIES_NO_OCCURRENCES')
  const series = await tx.lessonSeries.create({
    ...schedule,
    durationMin: input.slot.durationMin,
    classId: input.classId,
    title: input.title,
    coachName: input.coachName ?? null,
    rrule: weeklyRrule(schedule),
    studentIds: input.studentIds,
  })
  await seriesAvailable(tx, series)
  const generatedCount = await materialize(tx, series, horizon(schedule.startsOn))
  await tx.calendarSync.enqueue('SERIES', series.id)
  return { series, generatedCount }
}

export interface CreateClassInput {
  staffId: string
  name: string
  coachName?: string
  note?: string
  slots?: ClassSlotInput[]
  studentIds?: string[]
}

export async function createClass(input: CreateClassInput, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const studentIds = input.studentIds ?? []
    if (studentIds.length) await studentsActive(tx, studentIds)
    await assertStudentsInSingleClass(tx, studentIds)
    const created = await tx.lessonClass.create({
      name: input.name,
      coachName: input.coachName || null,
      note: input.note || null,
    })
    await tx.lessonClass.replaceStudents(created.id, studentIds)
    let generatedCount = 0
    for (const slot of input.slots ?? []) {
      const result = await createSlotInTx(tx, {
        classId: created.id,
        title: created.name,
        coachName: created.coachName,
        slot,
        studentIds,
      })
      generatedCount += result.generatedCount
    }
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_CREATE',
      entityType: 'LessonClass',
      entityId: created.id,
      details: { slots: input.slots?.length ?? 0, students: studentIds.length },
    })
    return { lessonClass: (await tx.lessonClass.findById(created.id))!, generatedCount }
  }, isolation)
}

export interface UpdateClassInput {
  staffId: string
  classId: string
  name?: string
  coachName?: string
  note?: string
  isActive?: boolean
}

export async function updateClass(input: UpdateClassInput, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const lessonClass = await tx.lessonClass.findById(input.classId)
    if (!lessonClass) fail('CLASS_NOT_FOUND')
    const renamed = input.name !== undefined && input.name !== lessonClass!.name
    if (input.isActive === true && !lessonClass!.isActive) {
      await assertStudentsInSingleClass(tx, classRosterIds(lessonClass!))
    }
    const updated = await tx.lessonClass.update(input.classId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.coachName !== undefined ? { coachName: input.coachName || null } : {}),
      ...(input.note !== undefined ? { note: input.note || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
    // Đổi tên lớp thì kéo theo tiêu đề khung giờ + các buổi chưa điểm danh (buổi đã chốt giữ nguyên lịch sử).
    if (renamed) {
      const now = new Date()
      for (const slot of lessonClass!.slots) {
        await tx.lessonSeries.update(slot.id, { title: updated.name }, slot.version)
        await tx.calendarSync.enqueue('SERIES', slot.id)
        for (const lesson of await tx.lesson.findBySeries(slot.id)) {
          if (lesson.startsAt < now || lesson.status !== 'SCHEDULED' || isLessonLocked(lesson)) continue
          await tx.lesson.update(lesson.id, { title: updated.name }, lesson.version)
        }
      }
    }
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_UPDATE',
      entityType: 'LessonClass',
      entityId: input.classId,
      details: { renamed, isActive: updated.isActive },
    })
    return updated
  }, isolation)
}

/** Kết thúc lớp: đóng mọi khung giờ từ mốc `from` (mặc định bây giờ) và huỷ các buổi tương lai. */
export async function endClass(input: { staffId: string; classId: string; from?: Date }, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const lessonClass = await tx.lessonClass.findById(input.classId)
    if (!lessonClass) fail('CLASS_NOT_FOUND')
    const cutoff = input.from ?? new Date()
    let cancelledLessons = 0
    for (const slot of lessonClass!.slots) {
      if (!slot.isActive) continue
      const closed = await closeSeriesFrom(tx, { staffId: input.staffId, series: slot, cutoff, version: slot.version })
      cancelledLessons += closed.cancelledLessons
    }
    const updated = await tx.lessonClass.update(input.classId, { isActive: false })
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_END',
      entityType: 'LessonClass',
      entityId: input.classId,
      details: { cancelledLessons },
    })
    return { lessonClass: updated, cancelledLessons }
  }, isolation)
}

/**
 * Dọn event Google của lớp trước khi xoá DB.
 * Worker chỉ xoá event khi còn đọc được row, nên phải xoá ở đây; lỗi từng event bỏ qua (best-effort).
 * Mỗi ADMIN có kết nối riêng nên phải gỡ event trên MỌI connection đã chọn lịch đích.
 */
async function deleteClassEvents(lessonClass: LessonClassRecord, lessons: LessonRecord[], deps: Repositories) {
  let deleted = 0
  for (const connection of await deps.calendarConnection.listReady()) {
    const calendarId = connection.calendarId!
    const ids = new Set<string>()
    // Cột googleEventId chỉ giữ lần sync gần nhất; mapping theo từng lịch mới là nguồn chuẩn.
    for (const slot of lessonClass.slots) {
      const mapped = await deps.calendarSync.getMapping(`SERIES:${slot.id}`, calendarId)
      if (mapped) ids.add(mapped)
      else if (slot.googleEventId && slot.googleCalendarId === calendarId) ids.add(slot.googleEventId)
    }
    for (const lesson of lessons) {
      const mapped = await deps.calendarSync.getMapping(`LESSON:${lesson.id}`, calendarId)
      if (mapped) ids.add(mapped)
      else if (lesson.googleEventId && lesson.googleCalendarId === calendarId) ids.add(lesson.googleEventId)
    }
    if (!ids.size) continue
    let accessToken: string
    try {
      ({ accessToken } = await calendarAccessToken(connection.userId, deps))
    } catch {
      continue
    }
    for (const id of ids) {
      try {
        await deps.googleCalendar.deleteEvent(accessToken, calendarId, id)
        deleted++
      } catch {
        // Event đã bị xoá/không còn quyền — bỏ qua, không chặn việc xoá lớp.
      }
    }
  }
  return deleted
}

/**
 * Chỉ xoá lớp thêm nhầm khi mọi buổi chưa có hoạt động hoặc ghi chú.
 * Dùng khi tạo lớp sai và muốn gỡ hoàn toàn. Muốn giữ lịch sử thì dùng "Kết thúc lớp".
 */
export async function deleteClass(input: { staffId: string; classId: string }, deps: Repositories = repositories) {
  const result = await runInTransaction(async tx => {
    const current = await tx.lessonClass.findById(input.classId)
    if (!current) fail('CLASS_NOT_FOUND')
    const currentLessons = await tx.lesson.findByClass(input.classId)
    if (hasClassHistory(currentLessons)) fail('CLASS_HAS_HISTORY')
    await tx.lesson.deleteMany(currentLessons.map(lesson => lesson.id))
    for (const slot of current!.slots) await tx.lessonSeries.delete(slot.id)
    await tx.lessonClass.delete(input.classId)
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_DELETE',
      entityType: 'LessonClass',
      entityId: input.classId,
      details: { name: current!.name, slots: current!.slots.length, lessons: currentLessons.length, hardDelete: true },
    })
    return { deleted: true as const, deletedSlots: current!.slots.length, deletedLessons: currentLessons.length, lessonClass: current!, lessons: currentLessons }
  }, isolation)
  if (!result.ok) return result
  const { lessonClass, lessons, ...deleted } = result.value
  const deletedEvents = await deleteClassEvents(lessonClass, lessons, deps)
  return ok({ ...deleted, deletedEvents })
}

const hasClassHistory = (lessons: LessonRecord[]) => lessons.some(lesson =>
  lesson.status !== 'SCHEDULED' || Boolean(lesson.note?.trim()) || lesson.students.some(student =>
    student.status !== 'SCHEDULED' || Boolean(student.note?.trim())
  )
)

/** Ghi sổ học viên: áp cho mọi khung giờ + các buổi tương lai chưa điểm danh. */
async function applyRoster(tx: Repositories, lessonClass: LessonClassRecord, studentIds: string[]) {
  const now = new Date()
  let updatedLessons = 0
  let skippedLocked = 0
  await tx.lessonClass.replaceStudents(lessonClass.id, studentIds)
  for (const slot of lessonClass.slots) {
    await tx.lessonSeries.replaceStudents(slot.id, studentIds)
    await tx.lessonSeries.update(slot.id, {}, slot.version)
    const future = (await tx.lesson.findBySeries(slot.id)).filter(l => l.startsAt >= now && l.status === 'SCHEDULED')
    for (const lesson of future) {
      if (isLessonLocked(lesson) || lesson.students.some(member => member.note !== null && !studentIds.includes(member.studentId))) {
        skippedLocked++
        continue
      }
      await tx.lesson.replaceStudents(lesson.id, studentIds)
      await tx.lesson.update(lesson.id, {}, lesson.version)
      updatedLessons++
    }
  }
  return { updatedLessons, skippedLocked }
}

/** Cập nhật sổ học viên: áp cho mọi khung giờ + các buổi tương lai chưa điểm danh. */
export async function setClassRoster(input: { staffId: string; classId: string; studentIds: string[] }, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const lessonClass = await tx.lessonClass.findById(input.classId)
    if (!lessonClass) fail('CLASS_NOT_FOUND')
    if (!lessonClass.isActive) fail('CLASS_ENDED')
    if (input.studentIds.length) await studentsActive(tx, input.studentIds)
    // Chỉ chặn học viên MỚI thêm vào lớp; thành viên đang có (kể cả dữ liệu cũ vi phạm) không bị chặn khi lưu sổ.
    const current = new Set(classRosterIds(lessonClass!))
    await assertStudentsInSingleClass(tx, input.studentIds.filter(id => !current.has(id)), { excludeClassId: input.classId })
    const result = await applyRoster(tx, lessonClass!, input.studentIds)
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_ROSTER_UPDATE',
      entityType: 'LessonClass',
      entityId: input.classId,
      details: { students: input.studentIds.length, ...result },
    })
    return result
  }, isolation)
}

/** Xếp một học viên vào lớp — tránh client phải đọc rồi ghi lại cả sổ lớp. */
export async function addClassStudent(input: { staffId: string; classId: string; studentId: string }, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const lessonClass = await tx.lessonClass.findById(input.classId)
    if (!lessonClass) fail('CLASS_NOT_FOUND')
    if (!lessonClass.isActive) fail('CLASS_ENDED')
    await studentsActive(tx, [input.studentId])
    const current = classRosterIds(lessonClass!)
    if (!current.includes(input.studentId)) await assertStudentsInSingleClass(tx, [input.studentId], { excludeClassId: input.classId })
    const studentIds = [...new Set([...current, input.studentId])]
    const result = await applyRoster(tx, lessonClass!, studentIds)
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_STUDENT_ADD',
      entityType: 'LessonClass',
      entityId: input.classId,
      details: { studentId: input.studentId, ...result },
    })
    return result
  }, isolation)
}

/** Rút một học viên khỏi lớp. */
export async function removeClassStudent(input: { staffId: string; classId: string; studentId: string }, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const lessonClass = await tx.lessonClass.findById(input.classId)
    if (!lessonClass) fail('CLASS_NOT_FOUND')
    if (!lessonClass.isActive) fail('CLASS_ENDED')
    const studentIds = classRosterIds(lessonClass!).filter(id => id !== input.studentId)
    const result = await applyRoster(tx, lessonClass!, studentIds)
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_STUDENT_REMOVE',
      entityType: 'LessonClass',
      entityId: input.classId,
      details: { studentId: input.studentId, ...result },
    })
    return result
  }, isolation)
}

export interface CreateClassSlotInput extends ClassSlotInput {
  staffId: string
  classId: string
}

export async function createClassSlot(input: CreateClassSlotInput, deps: Repositories = repositories) {
  void deps
  return runInTransaction(async tx => {
    const lessonClass = await tx.lessonClass.findById(input.classId)
    if (!lessonClass) fail('CLASS_NOT_FOUND')
    if (!lessonClass.isActive) fail('CLASS_ENDED')
    const { series, generatedCount } = await createSlotInTx(tx, {
      classId: lessonClass!.id,
      title: lessonClass!.name,
      coachName: lessonClass!.coachName,
      slot: input,
      studentIds: classRosterIds(lessonClass!),
    })
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_SLOT_CREATE',
      entityType: 'LessonSeries',
      entityId: series.id,
      details: { classId: lessonClass!.id, generatedCount },
    })
    return { series, generatedCount }
  }, isolation)
}

export interface UpdateClassSlotInput extends Partial<ClassSlotInput> {
  staffId: string
  classId: string
  slotId: string
  version: number
  scope: 'FOLLOWING' | 'ALL'
}

/** Sửa khung giờ: uỷ quyền cho updateSeries khi còn buổi tương lai (giữ nguyên logic tách chuỗi). */
export async function updateClassSlot(input: UpdateClassSlotInput, deps: Repositories = repositories) {
  const lessonClass = await deps.lessonClass.findById(input.classId)
  if (!lessonClass) return err('CLASS_NOT_FOUND')
  if (!lessonClass.isActive) return err('CLASS_ENDED')
  const slot = lessonClass.slots.find(s => s.id === input.slotId)
  if (!slot) return err('CLASS_SLOT_NOT_FOUND')
  const anchor = anchorLesson(await deps.lesson.findBySeries(slot.id))
  if (anchor) {
    return updateSeries(
      {
        staffId: input.staffId,
        seriesId: slot.id,
        version: input.version,
        scope: input.scope,
        lessonId: anchor.id,
        title: lessonClass.name,
        coachName: lessonClass.coachName ?? '',
        ...(input.daysOfWeek !== undefined ? { daysOfWeek: input.daysOfWeek } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
        ...(input.startsOn !== undefined ? { startsOn: input.startsOn } : {}),
        ...(input.endsOn !== undefined ? { endsOn: input.endsOn } : {}),
        ...(input.intervalWeeks !== undefined ? { intervalWeeks: input.intervalWeeks } : {}),
        ...(input.occurrenceCount !== undefined ? { occurrenceCount: input.occurrenceCount } : {}),
      },
      deps
    )
  }
  return runInTransaction(async tx => {
    const current = await tx.lessonSeries.findById(slot.id)
    if (!current) fail('CLASS_SLOT_NOT_FOUND')
    if (current!.version !== input.version) fail('LESSON_CONFLICT')
    const schedule: WeeklySchedule = {
      daysOfWeek: input.daysOfWeek ?? current!.daysOfWeek,
      startTime: input.startTime ?? current!.startTime,
      startsOn: input.startsOn ?? current!.startsOn,
      endsOn: input.endsOn !== undefined ? input.endsOn : current!.endsOn,
      intervalWeeks: input.intervalWeeks ?? current!.intervalWeeks,
      occurrenceCount: input.occurrenceCount !== undefined ? input.occurrenceCount : current!.occurrenceCount,
    }
    if (schedule.endsOn && schedule.endsOn < schedule.startsOn) fail('SERIES_NO_OCCURRENCES')
    const updated = await tx.lessonSeries.update(
      slot.id,
      {
        ...schedule,
        durationMin: input.durationMin ?? current!.durationMin,
        title: lessonClass.name,
        coachName: lessonClass.coachName ?? null,
        rrule: weeklyRrule(schedule),
      },
      input.version
    )
    await seriesAvailable(tx, updated)
    const generatedCount = await materialize(tx, updated, horizon(schedule.startsOn))
    await tx.calendarSync.enqueue('SERIES', slot.id)
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_SLOT_UPDATE',
      entityType: 'LessonSeries',
      entityId: slot.id,
      details: { classId: lessonClass.id, generatedCount },
    })
    return { series: updated, generatedCount }
  }, isolation)
}

/** Kết thúc một khung giờ từ mốc `from` (mặc định bây giờ), giữ nguyên lịch sử các buổi đã qua. */
export async function endClassSlot(
  input: { staffId: string; classId: string; slotId: string; version: number; scope: 'FOLLOWING' | 'ALL'; from?: Date },
  deps: Repositories = repositories
) {
  const lessonClass = await deps.lessonClass.findById(input.classId)
  if (!lessonClass) return err('CLASS_NOT_FOUND')
  const slot = lessonClass.slots.find(s => s.id === input.slotId)
  if (!slot) return err('CLASS_SLOT_NOT_FOUND')
  const anchor = anchorLesson(await deps.lesson.findBySeries(slot.id))
  if (anchor) {
    return deleteSeries(
      { staffId: input.staffId, seriesId: slot.id, version: input.version, scope: input.scope, lessonId: anchor.id },
      deps
    )
  }
  return runInTransaction(async tx => {
    const { cancelledLessons } = await closeSeriesFrom(tx, {
      staffId: input.staffId,
      series: slot,
      cutoff: input.from ?? new Date(),
      version: input.version,
    })
    await tx.audit.append({
      userId: input.staffId,
      action: 'CLASS_SLOT_END',
      entityType: 'LessonSeries',
      entityId: slot.id,
      details: { classId: lessonClass.id, cancelledLessons },
    })
    return { deletedId: slot.id, cancelledLessons }
  }, isolation)
}

export interface ClassListItem extends LessonClassRecord {
  studentCount: number
  nextLessonAt: Date | null
}

/** Danh sách lớp kèm sổ học viên (hợp nhất) và buổi tới gần nhất. */
export async function listClasses(input: { status?: 'ACTIVE' | 'ENDED'; search?: string } = {}, deps: Repositories = repositories): Promise<ClassListItem[]> {
  const rows = await deps.lessonClass.findMany(input)
  const upcoming = rows.length ? await deps.lessonClass.findUpcomingLessons(rows.map(c => c.id), new Date()) : []
  return rows.map(lessonClass => ({
    ...lessonClass,
    studentCount: classRosterIds(lessonClass).length,
    nextLessonAt: upcoming.find(l => l.classId === lessonClass.id || (l.seriesId && lessonClass.slots.some(s => s.id === l.seriesId)))?.startsAt ?? null,
  }))
}

/** Chi tiết lớp: thông tin + khung giờ + sổ học viên (kèm tên) + số buổi đã có. */
export async function getClassDetail(classId: string, deps: Repositories = repositories) {
  const lessonClass = await deps.lessonClass.findById(classId)
  if (!lessonClass) return err('CLASS_NOT_FOUND')
  return ok({
    ...lessonClass,
    roster: classRoster(lessonClass),
    studentCount: classRosterIds(lessonClass).length,
    lessonCount: lessonClass._count.lessons,
  })
}

export function mapClassError(error: DomainError): HttpErrorInfo {
  const errors: Record<string, [number, string]> = {
    CLASS_NOT_FOUND: [404, 'Không tìm thấy lớp học'],
    CLASS_SLOT_NOT_FOUND: [404, 'Không tìm thấy khung giờ của lớp'],
    CLASS_HAS_HISTORY: [409, 'Lớp đã có hoạt động hoặc ghi chú. Hãy kết thúc lớp để giữ lịch sử'],
    CLASS_ENDED: [409, 'Lớp đã kết thúc, không thể thay đổi sổ học viên hoặc thêm lịch'],
  }
  const mapped = errors[error.code]
  return mapped ? { code: error.code, status: mapped[0], message: mapped[1] } : mapLessonError(error)
}
export const mapCreateClassError = mapClassError
export const mapUpdateClassError = mapClassError
export const mapDeleteClassError = mapClassError
export const mapEndClassError = mapClassError
export const mapCreateClassSlotError = mapClassError
export const mapUpdateClassSlotError = mapClassError
export const mapEndClassSlotError = mapClassError
export const mapSetClassRosterError = mapClassError
