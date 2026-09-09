# Triển khai Học viên và lịch tương tác

## Cài đặt và dữ liệu

1. Chạy `npm ci` và `npx prisma generate`.
2. Sao lưu database, kiểm tra migration trên bản staging của dữ liệu đang dùng.
3. Repo trước đây dùng schema push và chưa có baseline migration. Với database hiện hữu, áp dụng SQL `prisma/migrations/202609090001_students_calendar/migration.sql` bằng kết nối trực tiếp đúng schema (session pooler). Không chạy `migrate deploy` cho database trống vì migration này chỉ nâng cấp các bảng đã có; database mới khởi tạo từ schema đầy đủ.
4. SQL tự bọc transaction và dừng nếu có buổi trong chuỗi từng được chỉnh sửa mà chưa biết thời điểm gốc. Đối soát audit/Google, điền `original_start_at` vào vị trí được đánh dấu trong SQL rồi chạy lại toàn transaction. Không tự coi giờ đã dời là giờ gốc. Chuỗi cũ có ngày kết thúc sau 12 tuần tiếp tục giữ ngày đó.
5. SQL giữ học viên, buổi học, note, điểm danh và gói; thêm thành viên mặc định chuỗi, mapping từng lịch Google và hàng đợi. Các kết nối cũ được đánh dấu cần kết nối lại. Bản mới mã hoá token khi kết nối và khi sử dụng token cũ lần đầu.
6. Phát hành code sau khi migration thành công. `npm run build` phải thành công trước khi phát hành.

## Google Calendar

Thiết lập Google Cloud project có Calendar API, OAuth client loại Web application, redirect URI chính xác `${NEXT_PUBLIC_APP_URL}/api/google/callback`. Cấu hình `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (64 ký tự hex) và `CALENDAR_CRON_SECRET` (tối thiểu 32 ký tự). Hai secret được sinh độc lập; giữ khoá mã hoá qua các lần deploy để đọc được token đã lưu.

ADMIN mở **Lịch học → Google Calendar → Kết nối** rồi chọn lịch có quyền ghi. Scope là `calendar.events` và `calendar.calendarlist.readonly`. Chọn lịch đích sẽ xếp lịch tương lai vào hàng đợi; có thể chọn khoảng khác để đưa lịch cũ vào hàng đợi. Xác nhận riêng khi đổi lịch, vì event trên lịch cũ được giữ lại. Mapping được lưu theo từng lịch đích để quay lại lịch trước không tạo bản sao.

Ứng dụng là nguồn dữ liệu chính, chỉ đồng bộ app → Google. Ghi chú buổi chỉ được đưa lên Google khi bật chia sẻ; note riêng từng học viên không được gửi. Đồng bộ lại các buổi cũ trong khoảng mong muốn sẽ xoá mô tả đã chia sẻ trước đây nếu tuỳ chọn chia sẻ hiện tắt.

## Scheduler bắt buộc

Hạ tầng cần gọi `POST /api/internal/calendar` mỗi phút với `Authorization: Bearer <CALENDAR_CRON_SECRET>`. Route có xác thực riêng, không cần cookie đăng nhập. Worker sinh tiếp lịch tuần rồi xử lý job; lease trong PostgreSQL ngăn hai worker đồng thời. Mỗi lượt xử lý tối đa 10 job theo thời gian cho phép, chuỗi trước buổi riêng. Job lỗi tạm thời tự retry có backoff; hết số lần thử hoặc lỗi quyền được hiển thị để admin xử lý.

Có thể dùng cron của máy chạy ứng dụng:

```cron
* * * * * cd /duong-dan/qltruongcung && node --env-file=.env scripts/run-calendar-worker.mjs >> /var/log/qltruongcung-calendar.log 2>&1
```

Hoặc scheduler có sẵn của hosting, cùng endpoint/header. Đặt `CALENDAR_WORKER_URL` nếu worker cần gọi URL nội bộ. Giới hạn thời gian thực thi route cần phù hợp với `maxDuration = 90`; xác nhận khả năng này trên hosting đang dùng. Không cài thêm Redis hay dịch vụ hàng đợi.

Sau khi cấu hình, tạo một buổi trên lịch thử, đổi giờ, sửa/xoá ghi chú được chia sẻ, huỷ buổi; thử cả một buổi thuộc chuỗi. Kiểm tra trạng thái không còn chờ/lỗi và kết quả tương ứng trên Google. Việc chưa có scheduler sẽ để job ở trạng thái chờ.

## Kiểm tra và khôi phục

- `npm test -- students-calendar students-attendance students-rrule students-package`
- `npx next typegen && npx tsc --noEmit`
- `npm run build`

Khi phải rollback, dừng scheduler trước, giữ schema mở rộng và dữ liệu/audit/job để đối soát. Không xoá event hàng loạt và không dùng lệnh schema push có cờ chấp nhận mất dữ liệu. Nếu Google lỗi, dữ liệu app đã lưu vẫn giữ nguyên và job có thể thử lại.

Giới hạn có chủ ý: lặp tuần (mỗi 1–12 tuần), tối đa 500 lần nếu kết thúc theo số buổi, mỗi buổi tối đa 24 giờ/100 học viên. Thay quy tắc của chuỗi có ngoại lệ yêu cầu xử lý từng buổi để bảo toàn lịch đã dời; thao tác đổi tên/HLV giữ ngoại lệ. Không thay đổi thời gian/thành viên của buổi đã điểm danh. Lịch sử được giữ nguyên khi sửa hoặc huỷ chuỗi.

## Kết quả kiểm tra mã nguồn (09/09/2026)

- 454 kiểm thử qua, gồm lặp tuần, ngoại lệ, xung đột giờ, điểm danh, hàng đợi, mã hoá token và retry giữ event ID.
- TypeScript, lint các phần thay đổi và production build qua.
- Đã kiểm tra giao diện desktop/mobile bằng API giả lập, lưu ghi chú và giờ Việt Nam khi trình duyệt dùng múi giờ Mỹ. Các sửa cuối của form được kiểm tra TypeScript/lint; lượt browser chạy lại chưa hoàn tất vì workspace có server dev khác.
- SQL migration đã chạy thử trên PostgreSQL nhúng (PGlite) với schema cũ và dữ liệu mẫu. Chưa áp dụng vào database thật.
- Chưa kiểm thử đầu cuối với tài khoản Google thật; thực hiện checklist Google phía trên trên staging sau khi cấu hình OAuth và scheduler.
