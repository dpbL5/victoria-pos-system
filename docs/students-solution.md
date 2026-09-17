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

## Lớp học (LessonClass)

Lớp là **danh tính + sổ học viên**; lịch của lớp là các **khung giờ** (mỗi khung = 1 `LessonSeries`), nên toàn bộ máy sinh buổi / kiểm tra trùng giờ / Google sync / tách chuỗi khi sửa lịch được tái dùng nguyên vẹn.

- Schema: `LessonClass` (name, coachName, note, isActive) + `LessonSeries.classId` (khung giờ) + `Lesson.classId` (buổi lẻ kiểu học bù gắn thẳng lớp). Không có bảng sổ riêng: **sổ của lớp = hợp nhất `LessonSeriesStudent` của mọi khung** (`classRosterIds`).
- Use-case `src/lib/students/use-cases/class-crud.ts`: `createClass`, `updateClass` (đổi tên kéo theo tiêu đề khung + buổi chưa điểm danh), `endClass` (đóng mọi khung từ mốc chọn, huỷ buổi tương lai), `deleteClass` (xoá lớp thêm nhầm — xem mục dưới), `setClassRoster` (áp cho mọi khung + buổi tương lai chưa điểm danh, trả `skippedLocked`), `addClassStudent` / `removeClassStudent`, `createClassSlot`, `updateClassSlot` / `endClassSlot` (uỷ quyền `updateSeries` / `deleteSeries` với buổi neo gần nhất, giữ logic tách chuỗi một chỗ), `listClasses`, `getClassDetail`.
- API admin-only: `GET/POST /api/classes`, `GET/PUT/DELETE /api/classes/[id]`, `PUT /api/classes/[id]/students`, `POST/DELETE /api/classes/[id]/students/[studentId]` (xếp/rút **một** học viên — tránh client đọc-rồi-ghi cả sổ), `POST /api/classes/[id]/slots`, `PATCH/DELETE /api/classes/[id]/slots/[slotId]`, `POST /api/classes/[id]/end`. `GET /api/lessons?classId=` lọc theo lớp (buổi lẻ hoặc buổi sinh từ khung của lớp).
- UI `src/features/classes/`: `classes-screen.tsx` (danh sách + tạo lớp kèm khung đầu + học viên), `class-detail-screen.tsx` (tab Thông tin · Sổ học viên · Lịch của lớp). Tab lịch tái dùng `LessonsCalendar` với props `classId` / `classTitle` / `classRoster` / `basePath`; `LessonEditor` nhận `classId` để buổi hoặc chuỗi tạo từ lịch lớp tự thuộc lớp.
- **Bắt buộc:** `updateSeries` phải kế thừa `classId` sang chuỗi mới khi tách — nếu không, lớp mất khung sau mỗi lần sửa lịch theo phạm vi FOLLOWING.
- Migration dữ liệu cũ: `npm run migrate:lesson-classes` (idempotent) — mỗi `LessonSeries` đang `isActive` thành 1 lớp, lấy luôn `series.id` làm `class.id`. Chuỗi đã kết thúc để `class_id = null` (vẫn hiện trên lịch toàn cục). Chuỗi bị tách do sửa lịch thành nhiều lớp cùng tên → admin tự sửa/kết thúc trong UI.
- Test: `src/lib/__tests__/classes.test.ts` (fake repo): tạo lớp nhiều khung, thêm khung dùng sổ lớp, sổ học viên bỏ qua buổi đã điểm danh, đổi tên kéo theo tiêu đề, tách chuỗi giữ `classId`, xoá cứng kể cả buổi đã điểm danh, chặn học viên thuộc lớp khác (lưu sổ + xếp lẻ + sửa chuỗi của lớp), chuỗi tự do vẫn cho phép.

## Xoá lớp thêm nhầm

`deleteClass` XOÁ CỨNG lớp + mọi khung giờ + mọi buổi của lớp (kể cả buổi đã điểm danh), dùng khi tạo lớp sai. Ba điểm phải nhớ:

- **Không có ngoại lệ**: bất kể buổi nào đã điểm danh cũng đều bị xoá. Muốn giữ lịch sử thì dùng "Kết thúc lớp". Xoá cứng buổi có `packageId` làm mất luôn dấu vết trừ gói — chỉ hợp lý với lớp thật sự thêm nhầm, chưa vận hành.
- **Dọn Google Calendar trước khi xoá DB**: worker đồng bộ chỉ xoá event khi còn đọc được row (`if (series)` / `if (lesson)`), nên `deleteClassEvents` gọi `googleCalendar.deleteEvent` cho event của khung và của buổi *trước* transaction (best-effort, lỗi từng event bỏ qua; chưa kết nối Google thì bỏ qua bước này). Thứ tự trong transaction: xoá buổi → xoá khung → xoá lớp (FK `classId`/`seriesId` là `SetNull` nên phải xoá tường minh, không dựa vào cascade).
- UI: nút "Xoá lớp" ở danh sách lớp (mọi dòng) và ở đầu trang chi tiết, kèm ConfirmDialog nói rõ sẽ mất gì; xoá xong quay về `/classes`.

## Ràng buộc: một học viên chỉ thuộc một lớp

- Guard dùng chung `assertStudentsInSingleClass` (`use-cases/class-guards.ts`) gọi trong transaction ở `createClass`, `setClassRoster`, `addClassStudent` và `updateSeries` **khi chuỗi thuộc lớp**. Vi phạm → `fail('CLASS_STUDENT_TAKEN', "Tên HV (Lớp X)")` → `mapLessonError` trả 409 với message nêu đúng tên HV + lớp.
- Guard chỉ xét **học viên mới thêm** (không tính thành viên đang có), nên dữ liệu cũ vi phạm vẫn lưu sổ/lịch bình thường; chỉ chặn việc tạo vi phạm mới.
- Ô chọn học viên của lớp (`StudentPicker` + `classId=` xuống `GET /api/students`) chỉ hiện HV chưa có lớp hoặc đang ở đúng lớp đó.
- Học viên của **buổi lẻ** không bị ràng buộc này — buổi học bù được phép mời HV lớp khác dự (điểm danh buổi ≠ thành viên lớp).

## Liên kết với Lịch học và Học viên

- Payload buổi học mang theo lớp: `LessonSeries.class` và `Lesson.class` (`lessonInclude` trong adapter) → lịch hiển thị tooltip/`aria-label` có "Lớp: …"; panel bộ lọc `/lessons` có thêm mục "Lớp" (chỉ hiện ngoài ngữ cảnh lớp).
- Tạo buổi lẻ từ `/lessons` (`LessonEditor`) có ô "Lớp (tuỳ chọn)": chọn lớp thì tự điền tiêu đề + sổ học viên của lớp và gửi kèm `classId` — dùng cho chuyển lịch/học bù. Buổi đó nằm trong "Lịch của lớp" và trong `/lessons` khi lọc theo lớp.
- `/students` có cột "Lớp"; trang chi tiết học viên có thẻ "Lớp học" để xếp vào lớp hoặc rời lớp (gọi 2 route ở trên). Học viên chỉ thuộc một lớp nên thẻ này chỉ hiển thị một lớp.

## Kiểm tra dữ liệu cũ (một lần)

```bash
npx tsx -e "import 'dotenv/config'; import { prisma } from '@/lib/infrastructure/prisma'; ..."
```
Kết quả 2026-09-17 (sau backfill): 4 lớp, 2 học viên thuộc ≥1 lớp, **2 học viên thuộc nhiều lớp** — đều là dữ liệu test ("HV Test 1", "HV Test 2" trong các lớp Testtt/Cơ bản/Test/Thiếu nhi). Không sửa tự động; admin bỏ các em khỏi lớp trùng trong UI. Guard mới không ảnh hưởng các bản ghi này.

## Deliberate simplifications (ponytail)

- `ponytail:` token Google lưu **plaintext** trong `CalendarConnection` — thêm encryption khi cần.
- `ponytail:` **1 recurring event** GCal cho cả series, không sync per-occurrence — sửa buổi lẻ chỉ trong app.
- `ponytail:` RRULE chỉ hỗ trợ **weekly + daysOfWeek** — đủ nhu cầu CLB.
- `ponytail:` GCal sync **best-effort** — fail chỉ warning, không chặn nghiệp vụ.
- `ponytail:` sổ học viên của lớp **không có ngày hiệu lực** vào/ra lớp — thêm `ClassEnrollment` khi cần thống kê theo giai đoạn.
- `ponytail:` sửa cấu trúc khung giờ (thứ/giờ) đổi lịch cả chuỗi tương lai như `updateSeries`; chưa hỗ trợ nhiều quy tắc lặp trong một khung.
- `ponytail:` lớp chưa gắn học phí/gói buổi — gói vẫn theo từng học viên (`LessonPackage`).
