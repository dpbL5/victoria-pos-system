# Kế hoạch hoàn thiện Đào tạo, Lịch học và Học viên

Trạng thái: đã triển khai phần lõi và sửa lỗi trong workspace; SQL sổ lớp đã áp dụng trực tiếp lên schema `app` của database đang cấu hình. Phạm vi chỉ gồm `Student`, `LessonClass`, `LessonSeries`, `Lesson`, `LessonStudent`, `LessonPackage` và các màn liên quan. Không thay đổi POS, `Customer` hoặc Google Calendar ngoài việc giữ cơ chế đồng bộ hiện có khi sửa lịch.

## Mục tiêu

Quản trị viên tạo lớp, xếp học viên, xem buổi học, điểm danh và ghi nhận tiến độ riêng của từng học viên sau buổi. Học viên giữ được lịch sử buổi học và ghi chú dù lớp kết thúc. Số buổi đã dùng phải khớp với điểm danh.

## Quyết định thiết kế

1. **Sổ học viên thuộc lớp.** Thêm bảng nối `LessonClassStudent` với khóa duy nhất `(classId, studentId)`. Đây là nguồn dữ liệu cho sổ lớp; lịch lặp và các buổi được sinh vẫn giữ danh sách học viên riêng để bảo toàn lịch sử. Không thêm ngày vào/rời lớp vì nhu cầu hiện tại chỉ cần lớp đang học và lịch sử từng buổi.
2. **Lớp đã kết thúc không chiếm chỗ của lớp mới.** Giữ sổ lớp cũ để xem lại; quy tắc một học viên chỉ ở một lớp chỉ xét lớp `isActive = true`. Hồ sơ học viên hiển thị lớp hiện tại từ bảng nối; lớp cũ có thể tra qua lịch sử buổi học.
3. **Điểm danh và số buổi gói là một phép chuyển trạng thái.** Chỉ chốt điểm danh khi đã qua giờ kết thúc dự kiến. `SCHEDULED/ABSENT → COMPLETED` trừ tối đa một buổi; `COMPLETED → ABSENT/SCHEDULED` hoàn đúng buổi vào chính gói đã trừ và bỏ liên kết `packageId`. Sửa lại `COMPLETED → COMPLETED` không trừ thêm. Ghi chú có thể được soạn trước buổi nhưng cần nhãn rõ là ghi chú chuẩn bị, không được hiểu là ghi nhận sau buổi.
4. **Không xoá lịch sử có hoạt động.** `deleteClass` chỉ nhận lớp thêm nhầm nếu tất cả buổi còn `SCHEDULED`, chưa có ghi chú buổi/học viên, chưa điểm danh và chưa gắn `packageId`. Trường hợp khác trả 409 và hướng tới “Kết thúc lớp”. Kết thúc lớp giữ nguyên lịch sử và ghi chú.
5. **Chống ghi đè bằng `Lesson.version` đã có.** API điểm danh và ghi chú học viên nhận phiên bản buổi, so sánh trong transaction và tăng phiên bản khi lưu. Giao diện chỉ gửi các ghi chú đã đổi; khi gặp 409, giữ nội dung đang soạn, tải dữ liệu mới và báo rõ xung đột. Không thêm bảng/version mới cho từng ghi chú.

## Thứ tự triển khai

### 1. Khóa các đường gây mất hoặc sai dữ liệu

- Thêm kiểm tra trước `deleteClass` trong use-case, không chỉ ở nút UI. Thay xác nhận xoá lớp bằng thông điệp phân biệt “lớp mới thêm nhầm” và “lớp đã vận hành”; với lớp đã có hoạt động, hiện hành động “Kết thúc lớp”. Giữ audit cho cả xoá và kết thúc.
- Sửa `markAttendance` để xử lý đủ các chuyển trạng thái trên trong **một** `runInTransaction()`, kiểm tra buổi chưa huỷ và đã kết thúc theo lịch. Điều chỉnh `LessonPackage.used` bằng thao tác có điều kiện để không âm hoặc vượt `total`; trả lỗi rõ bằng tiếng Việt khi không thể hoàn/trừ.
- Kiểm tra dữ liệu hiện có bằng báo cáo chỉ đọc: `used` của từng gói so với số liên kết `LessonStudent.packageId` còn `COMPLETED`, các liên kết còn lại ở trạng thái khác `COMPLETED`, và các lớp đã bị xoá cứng nếu còn dấu vết audit. Không tự ghi đè `used` theo số đếm vì lịch sử xoá cũ có thể đã mất; lập danh sách cần đối soát rồi sửa có audit.

**Kiểm chứng:** thử `COMPLETED → ABSENT → COMPLETED`, lưu lặp hai lần, hai quản trị viên chốt cùng lúc, điểm danh buổi tương lai, xoá lớp đã có ghi chú/điểm danh. Mọi trường hợp lỗi phải giữ nguyên điểm danh và gói.

### 2. Làm sổ học viên độc lập với lịch lặp

- Migration **mở rộng trước**: tạo `LessonClassStudent`, chép hợp nhất `LessonSeriesStudent` của từng lớp vào bảng mới, bỏ trùng bằng khóa duy nhất. Chỉ backfill từ dữ liệu thực có; lớp chưa có khung mà từng được chọn học viên không thể khôi phục bằng suy đoán.
- Đổi `createClass`, `setClassRoster`, `addClassStudent`, `removeClassStudent`, `createClassSlot`, danh sách/chi tiết lớp và `classesOfStudents` để đọc/ghi sổ lớp mới. Các thao tác thay sổ đồng bộ học viên vào khung và buổi **tương lai chưa điểm danh** trong cùng transaction; buổi đã điểm danh giữ nguyên.
- Với chuỗi gắn lớp, không cho sửa danh sách học viên của chuỗi tách khỏi sổ lớp qua API lịch; thay đổi thành viên phải đi qua use-case sửa sổ lớp. Buổi lẻ/học bù vẫn cho chọn học viên riêng và không tự đưa họ vào sổ lớp.
- Chặn thêm khung mới cho lớp đã kết thúc. Cập nhật bộ chọn học viên và hồ sơ để lớp đã kết thúc không cản xếp vào lớp đang hoạt động khác.

**Kiểm chứng:** tạo lớp có học viên nhưng chưa có lịch, tải lại vẫn thấy đúng sổ; thêm khung sau đó nhận đúng học viên; sửa sổ không thay buổi đã điểm danh; kết thúc lớp rồi xếp học viên vào lớp mới; không thể thêm vào hai lớp đang hoạt động.

### 3. Bảo vệ ghi chú khi sửa từ nhiều màn

- Cập nhật `/api/lessons/[id]/notes` và `/api/lessons/[id]/attendance` để dùng phiên bản buổi; trả 409 cho dữ liệu cũ. Đảm bảo cả hai đường ghi đều tăng cùng `Lesson.version` trong transaction.
- `LessonStudentNotes` chỉ gửi những học viên có nội dung thay đổi. `AttendanceDialog` không gửi lại ghi chú cũ nếu người dùng chỉ đổi điểm danh; cả hai màn xử lý 409 mà không xoá bản nháp.
- Sau khi lưu ghi chú trong modal chi tiết buổi, cập nhật phiên bản/dữ liệu modal để nút “Lưu” kế tiếp không gửi bản cũ. Hồ sơ học viên cũng tải lại dòng buổi vừa sửa.

**Kiểm chứng:** hai cửa sổ cùng mở một buổi; cửa sổ thứ hai không được ghi đè ghi chú hoặc điểm danh mới hơn. Sửa note của học viên A không ghi lại note không đổi của học viên B.

### 4. Nối lại đường đi trên giao diện

- Trong chi tiết lớp, thêm lối tắt rõ “Xem lịch của lớp” tới `/lessons?classId=...`; hiển thị lớp và số học viên trong ngữ cảnh lịch. Dùng lịch hiện có, không nhúng thêm một lịch thứ hai.
- Từ buổi học, cho mở hồ sơ từng học viên. Trong vùng ghi chú riêng, hiển thị ghi chú gần nhất trước buổi ngay cạnh ô soạn, dùng API `previous-notes` hiện có; giữ note cũ và ngày của buổi nguồn.
- Phân biệt “Sắp học”, “Đã qua, chưa điểm danh”, “Đã điểm danh” trên lịch/hồ sơ. Nút điểm danh chỉ hoạt động sau giờ kết thúc; trước đó có thể ghi chú chuẩn bị. Trong chi tiết lớp, có lối tắt tới lịch lọc các buổi đã qua còn chờ điểm danh.
- Hồ sơ học viên hiện chỉ trả tối đa 20 buổi mỗi nhóm; thêm “Xem thêm” cho lịch sử để ghi chú cũ vẫn tra được mà không tải toàn bộ ngay lúc mở trang.

**Kiểm chứng UX:** trên điện thoại và desktop, thực hiện trọn luồng từ lớp → buổi → điểm danh và note từng học viên → hồ sơ học viên → xem lại note cũ; kiểm tra trạng thái trống, lỗi, xung đột và quyền ADMIN.

## Triển khai và hoàn tất

- Các bước 1–3 đã được cài vào code: bảo vệ xoá lớp có hoạt động, chuyển trạng thái điểm danh/gói trong transaction, sổ lớp riêng có backfill migration, khóa ghi đè bằng `Lesson.version`, và cập nhật UI ghi chú/lớp.
- Đã kiểm chứng sau đợt sửa lỗi: 102/102 test trong 16 file thuộc học viên/lớp học đạt; TypeScript và ESLint các file sửa đạt. `npm run build` (Turbopack) và `npx next build --webpack` đều thành công khi chạy ngoài sandbox. Lỗi build thiếu log trước đó không tái hiện ngoài sandbox.
- Ngày 25/09/2026, SQL `202609250001_lesson_class_students` đã được áp dụng trực tiếp bằng `prisma db execute` trong transaction với `search_path = app`: database có 1 lớp, 1 khung và 3 quan hệ lớp–học viên được backfill. Truy vấn Prisma qua `DATABASE_URL` và use-case danh sách lớp đều trả 1 lớp với 3 học viên. Lịch sử `_prisma_migrations` vẫn chưa có vì database hiện hữu chưa được baseline; `prisma migrate deploy` vẫn cần bước đối soát/baseline riêng trước khi dùng về sau.
- Chưa hoàn tất phần lọc lịch “đã qua, chưa điểm danh” và phân trang “Xem thêm” lịch sử hồ sơ. Bước đối soát/baseline lịch sử Prisma migration và phát hành code ứng dụng vẫn cần thực hiện riêng.

**Tiêu chí hoàn thành:** một lớp chưa có lịch vẫn giữ được học viên; mọi buổi hoàn thành có ghi chú riêng tra lại được; sửa điểm danh không làm sai gói; lớp đã vận hành không thể bị xoá mất lịch sử; hai người sửa cùng buổi không âm thầm ghi đè nhau.

## Sửa lỗi sau triển khai code

- Ghi chú giữ phiên bản lúc bắt đầu soạn; tải lại dữ liệu nền không tự nâng phiên bản để ghi đè bản mới. Sau khi lưu, cập nhật baseline/phiên bản và báo dữ liệu mới cho modal. Khi xung đột, có thao tác tải bản mới và giữ bản nháp để người dùng đối chiếu trước khi lưu lại.
- Hộp điểm danh lưu ghi chú chuẩn bị qua API notes trước giờ kết thúc; nút điểm danh mở khi đến giờ. Điểm danh không gửi lại note chưa thay đổi.
- Đổi sổ lớp tăng phiên bản chuỗi/buổi đã thay đổi và giữ buổi có ghi chú của học viên bị rút. Repository chặn mọi đường loại học viên đã có ghi chú, điểm danh hoặc gói khỏi buổi.
- Dữ liệu cũ còn liên kết gói khi trạng thái không phải COMPLETED không bị trừ lần hai; xung đột transaction trả lỗi 409 để UI giữ bản nháp.
- Xoá event Google chỉ thực hiện sau khi transaction xoá lớp thành công, sử dụng snapshot của chính transaction.
- API chuỗi gắn lớp báo lỗi rõ nếu payload thay sổ học viên; buổi lẻ/học bù vẫn chọn học viên riêng. Script chuyển chuỗi thành lớp cũng tạo sổ học viên chính thức.
