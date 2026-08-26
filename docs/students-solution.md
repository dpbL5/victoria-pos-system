# Giải pháp chức năng Học viên — Students + Lessons + Google Calendar

> Ngày: 2026-08-17 | Trạng thái: Đang triển khai

## Bối cảnh

Victoria Archery Club cần quản lý **học viên** tách biệt khỏi hệ thống POS: admin thêm/sửa/xoá học viên, xếp lịch học (buổi lẻ + lịch lặp hàng tuần), đồng bộ sang **Google Calendar** (OAuth2, 1 calendar CLB dùng chung), ghi note + điểm danh (hoàn thành/vắng) sau mỗi buổi, đếm **số buổi còn lại** theo gói.

Đây là subsystem mới, **không đụng** Customer/Membership/Session/POS. **Chỉ ADMIN** thao tác.

## Quyết định thiết kế

- **Entity riêng** `Student` + `Lesson`, độc lập hoàn toàn với `Customer`. Không FK qua Customer — tránh rủi ro dữ liệu POS đang vận hành.
- **Google Calendar OAuth2 đầy đủ**, **1 calendar CLB dùng chung** (1 bộ token, admin connect). Dùng server-side fetch tới Google Calendar API v3 — **không cần** thêm dependency `googleapis`.
- **Nhiều học viên / 1 buổi** — `LessonStudent` (join many-to-many), mỗi HV có trạng thái riêng `SCHEDULED/COMPLETED/ABSENT` + note riêng.
- **Lịch lặp + buổi lẻ** — `LessonSeries` (RRULE weekly) **materialize** từng `Lesson` tương lai (horizon ~12 tuần) để lưu note/điểm danh/đếm buổi. Series gắn **1 recurring event** Google Calendar (không sync per-occurrence).
- **Đếm số buổi** — `LessonPackage { total, used }`; hoàn thành 1 buổi giảm remaining (chống đếm trùng theo `[lessonId, studentId]`).
- **Chỉ ADMIN** thao tác; STAFF không thấy màn này (sidebar `adminOnly`).
- **Coach = tên hiển thị** — `lesson.coachName` string, không FK User.

## Các thay đổi cụ thể

### Schema (`prisma/schema.prisma`)

Thêm 5 models + 2 enum (chi tiết đầy đủ trong plan):

```
1. Student           — fullName, phone?, birthYear?, notes?, status ACTIVE/INACTIVE, deletedAt (soft delete)
2. LessonPackage     — studentId, name, total, used, isActive
3. LessonSeries      — title, coachName?, daysOfWeek Int[], startTime "HH:mm", durationMin, rrule, startsOn, endsOn?, isActive, googleEventId?
4. Lesson            — seriesId?, title, coachName?, startsAt, durationMin, status, note?, googleEventId?
5. LessonStudent     — lessonId + studentId (unique), status, note?, packageId? (gói trừ khi hoàn thành)
6. CalendarConnection— email, accessToken, refreshToken, tokenExpiresAt, calendarId? (1 row duy nhất cho CLB)
7. enum LessonStatus        — SCHEDULED | COMPLETED | CANCELLED
8. enum LessonAttendance    — SCHEDULED | COMPLETED | ABSENT
```

### Domain `src/lib/students/` (Port/Adapter + use-cases)

- `ports.ts` — `StudentRepository`, `LessonRepository`, `LessonSeriesRepository`, `LessonPackageRepository`, `CalendarConnectionRepository`.
- `validations.ts` — zod schema tiếng Việt: `createStudentSchema`, `updateStudentSchema`, `createLessonSchema`, `createSeriesSchema`, `markAttendanceSchema`, `createPackageSchema`, `updatePackageSchema`.
- `helpers/` — pure functions (test được):
  - `rrule.ts`: `buildWeeklyRrule(daysOfWeek)`, `generateOccurrences(...)` — sinh các buổi theo tuần giờ Việt Nam.
  - `package-math.ts`: `remaining(pkg) = total - used`.
- `use-cases/` — chuẩn pricing use-case (`ok/err/fail`, `runInTransaction`, `tx.audit.append`, `mapXxxError`):
  - `student-crud.ts` — create/update/delete (soft delete).
  - `package-crud.ts` — create/update (chỉ tăng total).
  - `lesson-crud.ts` — createLesson (lẻ), updateLesson, deleteLesson (CANCELLED + xoá event GCal), createSeries (materialize + recurring GCal event), updateSeries, deleteSeries.
  - `attendance.ts` — markAttendance: đặt status/note từng HV, COMPLETED → `used+1` (transaction).
  - `calendar-connect.ts` — connect/disconnect/getStatus.
- `index.ts` — barrel export.

### Domain `src/lib/google/` (OAuth2 + Calendar API, server-side fetch)

- `env.ts` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect uri `${APP_URL}/api/google/callback`.
- `oauth.ts` — `buildAuthUrl(state)`, `exchangeCodeForTokens(code)`, `refreshAccessToken(refreshToken)`.
- `calendar.ts` — `createEvent`, `updateEvent`, `deleteEvent`, `createRecurringEvent` (body kèm `recurrence`), `deleteRecurringEvent`.
- `sync.ts` — `syncLessonToCalendar`, `syncSeriesToCalendar` — **best-effort**: chưa connect/đổi mật → warning, không chặn nghiệp vụ nội bộ.

### API (admin-only)

```
GET/POST        /api/students
GET/PUT/DELETE  /api/students/[id]
GET             /api/students/[id]/lessons
GET/POST        /api/students/[id]/packages
GET/POST        /api/lessons
PATCH/DELETE    /api/lessons/[id]
POST            /api/lessons/[id]/attendance
POST            /api/series
DELETE          /api/series/[id]
GET             /api/google/status
GET             /api/google/connect   (302 → Google OAuth)
GET             /api/google/callback  (exchange → lưu token)
POST            /api/google/disconnect
```

### UI (`src/features/students/`)

- `students-screen.tsx` — `StudentsScreen`: danh sách HV, search, số buổi còn lại, CRUD, nút **Kết nối Google Calendar** + trạng thái connect.
- `student-detail-screen.tsx` — `StudentDetailScreen({ id })`: profile, gói buổi, lịch sử buổi học, note.
- `lessons-screen.tsx` — `LessonsScreen`: xem lịch theo tuần, tạo buổi lẻ + lịch lặp, điểm danh/note.
- Route pages: `/students`, `/students/[id]`, `/lessons`.
- Sidebar `staffMenuItems` thêm `{ href: '/lessons', label: 'Học viên', Icon: GraduationCap, adminOnly: true }`; MoreScreen `adminLinks` thêm mục "Học viên".

### Unit test (`src/lib/__tests__/`)

- `students-rrule.test.ts` — sinh buổi lặp đúng ngày tuần/giờ VN/horizon.
- `students-package.test.ts` — `remaining`, đếm trùng.
- `students-attendance.test.ts` — use-case `markAttendance` với fake repo: COMPLETED trừ `used` đúng 1 lần/HV, ABSENT không trừ, note lưu, audit append.

## Deliberate simplifications (ponytail)

- `ponytail:` token Google lưu **plaintext** trong `CalendarConnection` — thêm encryption khi cần.
- `ponytail:` **1 recurring event** GCal cho cả series, không sync per-occurrence — sửa buổi lẻ chỉ trong app.
- `ponytail:` RRULE chỉ hỗ trợ **weekly + daysOfWeek** — đủ nhu cầu CLB.
- `ponytail:` GCal sync **best-effort** — fail chỉ warning, không chặn nghiệp vụ.
