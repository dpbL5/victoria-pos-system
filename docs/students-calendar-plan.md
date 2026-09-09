# Kế hoạch nâng cấp Học viên và Lịch học

Ngày: 09/09/2026. Trạng thái: đã triển khai mã nguồn. Hướng dẫn migration, cấu hình Google và các giới hạn thực tế tại [students-calendar-deployment.md](students-calendar-deployment.md). Phần hiện trạng bên dưới ghi nhận trước khi triển khai.

**Đã chốt với người dùng:** đồng bộ một chiều **app → Google Calendar**. App là nơi quản lý chính; dùng một lịch chung của CLB như thiết kế hiện có.

## 1. Mục tiêu và phạm vi

Admin quản lý học viên và toàn bộ lịch học trong một giao diện có cách thao tác quen thuộc như Google Calendar: xem ngày/tuần/tháng, bấm hoặc kéo chọn để tạo buổi, bấm sự kiện để sửa, kéo để đổi giờ, kéo cạnh để đổi thời lượng, quản lý lịch lặp và ghi chú riêng từng buổi. Thay đổi được đẩy lên Google Calendar tự động.

Kế thừa quyền ADMIN hiện có cho toàn bộ module. Học viên tiếp tục là `Student`, độc lập với `Customer`, `Membership` và phiên chơi POS. Một buổi học có thể có nhiều học viên qua `LessonStudent`; đây là nghiệp vụ lớp học đã có trong dự án.

Phạm vi bản hoàn chỉnh trong kế hoạch: CRUD học viên, lịch tương tác, ghi chú buổi học, lịch lặp hằng tuần và đồng bộ một chiều đáng tin cậy. Giữ chức năng gói buổi/điểm danh đang có. Chưa mở rộng thu học phí, tài khoản học viên, Google Meet, khách mời/email mời, lịch phòng/HLV theo tài nguyên, đồng bộ ngược. Lịch lặp ngày/tháng/năm và sự kiện cả ngày là phần mở rộng nếu cần mức tương đồng rộng hơn với Google Calendar.

## 2. Hiện trạng đã đối chiếu mã nguồn

| Hạng mục | Đã có | Việc cần làm |
|---|---|---|
| Hồ sơ học viên | Danh sách, tìm kiếm/lọc, thêm/sửa/xoá mềm, chi tiết | Hoàn thiện đổi trạng thái, xoá giá trị trường, phân trang/tìm kiếm phía server; xử lý học viên còn lịch tương lai |
| Lịch học | Tạo buổi lẻ, lịch lặp tuần, danh sách theo ngày trong tuần | Thay phần danh sách chính bằng lưới lịch, thêm form sửa, bộ lọc và kéo thả |
| Ghi chú | `Lesson.note`, API PATCH; `LessonStudent.note` qua điểm danh | Có trình sửa ghi chú cấp buổi ngay từ sự kiện, lưu độc lập với điểm danh |
| Lịch lặp | `LessonSeries`, sinh sẵn các `Lesson` | Sửa một buổi/các buổi tiếp theo/cả chuỗi, giữ ngoại lệ, sinh tiếp lịch dài hạn |
| Google | OAuth, tạo/sửa/xoá event qua server-side fetch | Chọn lịch đích, đồng bộ dữ liệu đã có, retry, trạng thái từng sự kiện, xử lý từng buổi thuộc chuỗi |

Nguồn: `src/features/students/`, `src/lib/students/`, `src/lib/google/`, `src/lib/infrastructure/adapters/student-adapter.ts`, các route `/api/students`, `/api/lessons`, `/api/series`, `/api/google`, và `prisma/schema.prisma`.

Các điểm hiện tại cần sửa trong phạm vi này:

- `lesson-crud.ts` gọi Google trước transaction nội bộ. Google thành công nhưng DB thất bại có thể để lại sự kiện không tương ứng; huỷ Google thất bại đang bị bỏ qua.
- Buổi trong chuỗi chưa có mapping Google instance; sửa/huỷ riêng buổi đó chưa được đồng bộ.
- Chuỗi không nhập ngày kết thúc đang được ghi thành kết thúc sau 12 tuần. RRULE gửi sang Google thiếu tiền tố `RRULE:` và chưa mang ngày kết thúc. Cần sửa định dạng và thống nhất giới hạn giữa hai bên, theo [tài liệu recurring events của Google](https://developers.google.com/workspace/calendar/api/guides/recurringevents).
- UI tạo buổi dùng timezone trình duyệt; cùng giờ nhập có thể thành thời điểm khác khi thiết bị đặt múi giờ khác Việt Nam.
- PATCH xoá ghi chú thành rỗng không được gửi thành `description: ''` lên Google, có thể giữ ghi chú cũ ở đó.
- Callback OAuth hiện dùng `requireAuth`; cần kiểm tra lại quyền ADMIN ở callback. Token đang lưu dạng rõ; access token mới sau refresh chưa được ghi lại mặc dù repository đã có `updateToken`.
- API lịch lọc theo thời điểm bắt đầu, chưa lấy buổi bắt đầu trước nhưng còn kéo dài vào khoảng đang xem. Bộ chọn học viên hiện lấy danh sách giới hạn mặc định 100 bản ghi.

Đây là nhận định từ đọc mã nguồn, chưa phải kết quả chạy nghiệm thu hay kiểm tra dữ liệu production. Tài liệu `students-solution.md` ghi lại thiết kế cũ; các phương án giản lược về token và sync trong đó được thay bằng đề xuất dưới đây khi triển khai kế hoạch này.

## 3. Trải nghiệm sản phẩm

### Điều hướng và bố cục

- `/lessons`: màn Lịch học chính. Desktop mặc định Tuần; có Ngày, Tuần, Tháng, Danh sách, Hôm nay, trước/sau và chọn ngày.
- Desktop: thanh công cụ phía trên; cột phụ có lịch tháng nhỏ, tìm kiếm và lọc học viên/HLV/trạng thái; lưới lịch chiếm phần lớn chiều rộng.
- Mobile: mặc định Ngày, chuyển nhanh Danh sách/Tháng/Tuần; bộ lọc trong sheet. Form dùng `Modal` hiện có, có thể mở từ lịch và lưu mà không chuyển trang. Tuần vẫn có thể xem khi cần, không ép bảy cột nhỏ làm chế độ mặc định.
- `/students`: danh sách học viên; `/students/[id]`: hồ sơ, gói buổi, lịch sắp tới/lịch sử và nút mở lịch đã lọc theo học viên.
- Sidebar admin và mục Thêm dẫn đến module; giữ năm tab điều hướng mobile hiện có. Ngày, chế độ xem và bộ lọc nằm trong URL để tải lại/quay lại vẫn giữ ngữ cảnh.
- Dùng ngôn ngữ Việt, icon Lucide, token màu và light/dark của dự án. Trạng thái có nhãn/icon ngoài màu sắc.

### Thao tác trên lịch

| Thao tác | Kết quả mong đợi |
|---|---|
| Bấm ô giờ trống | Mở form tạo, điền sẵn ngày/giờ; mặc định 60 phút, cho sửa |
| Kéo chọn một khoảng giờ | Mở form với giờ bắt đầu và kết thúc đã chọn |
| Bấm ngày ở chế độ Tháng | Mở form chọn giờ cụ thể của ngày đó |
| Bấm buổi học | Mở chi tiết ngay trên lịch: thông tin, học viên, ghi chú, Sửa/Huỷ |
| Kéo sự kiện | Đổi ngày/giờ, giữ thời lượng; bước kéo mặc định 15 phút |
| Kéo cạnh sự kiện | Đổi thời lượng; form vẫn cho nhập phút chính xác |
| Sửa ghi chú | Nhập/sửa/xoá nội dung và bấm Lưu; không yêu cầu điểm danh |
| Sửa buổi thuộc chuỗi | Chọn phạm vi: Buổi này / Buổi này và các buổi sau / Toàn bộ chuỗi |
| API từ chối thay đổi | Trả sự kiện về vị trí cũ, hiển thị lý do tiếng Việt |
| DB đã lưu nhưng Google lỗi | Giữ thay đổi trên lịch app; hiển thị Chờ đồng bộ hoặc Đồng bộ lỗi |

Form tạo/sửa thống nhất: tiêu đề, học viên có ô tìm kiếm, tên HLV, ngày, giờ bắt đầu/kết thúc, lặp lại, ghi chú buổi. Lặp tuần hỗ trợ mỗi N tuần, nhiều ngày trong tuần, kết thúc theo ngày/số buổi/không kết thúc.

Ghi chú buổi (`Lesson.note`) mặc định lưu nội bộ. Nếu admin muốn đưa lên lịch chung, có lựa chọn rõ ràng “Đồng bộ ghi chú lên Google Calendar”. Ghi chú cá nhân của học viên (`LessonStudent.note`) tiếp tục ở nội bộ. Trước khi bật cơ chế mới, xử lý rõ ghi chú từng được đồng bộ theo hành vi cũ.

Trên điện thoại, nhấn giữ để chọn/kéo khi thư viện hỗ trợ phù hợp; mọi thao tác kéo đều có cách tương đương qua form cho cảm ứng và bàn phím. Kiểm tra focus, Esc, nhãn nút, trạng thái đang lưu và cảnh báo khi đóng form có thay đổi chưa lưu.

### Quy tắc dữ liệu và xung đột

- Xoá học viên là xoá mềm, giữ lịch sử. Nếu còn tham gia buổi tương lai hoặc chuỗi đang hoạt động, chặn xoá và dẫn đến danh sách cần xử lý; admin đổi học viên/huỷ lịch trước. Dừng học không tự huỷ các buổi đã xếp, nhưng không được thêm vào lịch mới.
- Buổi học phải có ít nhất một học viên đang hoạt động, ID không trùng, thời điểm hợp lệ có timezone rõ ràng, kết thúc sau bắt đầu. Xác thực ở backend kể cả khi kéo trực tiếp trên lịch.
- Mặc định chặn hai buổi chồng giờ của cùng học viên ở backend. Các buổi có học viên khác nhau vẫn được hiển thị cạnh nhau. Hai buổi tiếp giáp đúng giờ không tính là trùng. Kiểm tra và ghi trong transaction đủ cô lập để tránh hai admin cùng tạo lịch vượt kiểm tra.
- HLV đang là chuỗi tên tự do, nên chỉ cảnh báo trùng tên HLV; chưa coi đây là định danh đủ chắc chắn để chặn cứng.
- Dùng `version` để phát hiện hai admin sửa cùng một bản ghi; bản cũ nhận 409 và yêu cầu tải lại, không âm thầm ghi đè ghi chú.
- Buổi đã huỷ không cho kéo/sửa lịch. Buổi đã điểm danh giữ thời gian, thành viên và dữ liệu gói; vẫn cho ADMIN sửa ghi chú có audit. Sửa hàng loạt hiển thị số buổi sẽ đổi và các buổi lịch sử bị giữ nguyên.
- Lưu timestamp UTC, nhập/hiển thị theo `Asia/Ho_Chi_Minh`; kiểm tra cả thiết bị đặt timezone khác Việt Nam.

## 4. Lựa chọn kỹ thuật

Đề xuất **FullCalendar Standard cho React** làm lưới lịch. Bộ chuẩn có giấy phép MIT; tài liệu React hiện hỗ trợ React 17–19 và có hướng dẫn Next.js. Thực hiện một bản thử nhỏ để chốt phiên bản, package và CSS tương thích Next 16/React 19 của repo trước khi thay màn chính. Nguồn: [React integration](https://fullcalendar.io/docs/react), [giấy phép](https://fullcalendar.io/license).

Chỉ nạp các view Ngày/Tuần/Tháng/Danh sách và tương tác cần dùng; tuỳ biến bằng UI/token sẵn có. Đây là dependency có lý do: repo chưa có lịch tương tác, tự viết lưới thời gian, xử lý sự kiện chồng nhau, cảm ứng và kéo thả sẽ lớn hơn nhiều. “Canvas” ở đây là bề mặt lịch tương tác bằng DOM, không cần tự vẽ HTML canvas. Callback kéo thả có cơ chế hoàn tác để xử lý lỗi lưu: [eventDrop](https://fullcalendar.io/docs/eventDrop).

Frontend nhận các buổi cụ thể từ backend; không tự sinh một bộ lịch lặp độc lập. Google tiếp tục dùng `fetch` phía server, không cần `googleapis` hoặc plugin tài khoản Google trong công cụ phát triển.

Giữ kiến trúc hiện tại:

- UI trong `src/features/students/`, route page mỏng. Tách `lessons-calendar` và form dùng chung khỏi `lessons-screen` khi thực sự cần.
- Nghiệp vụ trong `src/lib/students/use-cases/`, có `deps: Repositories`, `Result<T>`, error mapper; xuất qua barrel.
- Mọi thay đổi lesson, thành viên, chuỗi, audit và yêu cầu đồng bộ đi qua `runInTransaction`; kiểm tra thất bại trong transaction dùng `fail()`.
- Google adapter được gọi qua port phù hợp; sửa chỗ use-case đang import trực tiếp nghiệp vụ domain Google. Không tạo framework tích hợp chung.
- Tái sử dụng SWR/useApi, validation Zod, `apiJson`, CSRF, quyền ADMIN và bộ UI hiện có.

## 5. Dữ liệu, lịch lặp và API

### Bổ sung schema tối thiểu theo nhu cầu

| Đối tượng | Bổ sung dự kiến | Mục đích |
|---|---|---|
| `Lesson` | `version`, `originalStartAt`, `isException`, lựa chọn chia sẻ ghi chú | Chống ghi đè; nhận diện buổi gốc khi đổi giờ; giữ ngoại lệ |
| `LessonSeries` | `version`, `timeZone`, `materializedUntil`; hoàn thiện RRULE và giới hạn kết thúc | Tách ngày kết thúc nghiệp vụ khỏi mốc đã sinh lịch |
| `LessonSeriesStudent` | `seriesId`, `studentId`, unique cặp ID | Lưu thành viên mặc định để sinh các buổi tiếp theo |
| `CalendarConnection` | Token mã hoá, lịch đích rõ ràng, trạng thái cần kết nối lại | Kết nối bền vững và đúng đích |
| `CalendarSyncJob` | Loại thao tác, lesson/series ID, phiên bản, kết nối/lịch đích, trạng thái, số lần thử, hẹn thử, lease, lỗi gần nhất | Hàng đợi bền vững trong PostgreSQL, phục hồi sau lỗi |

Tái sử dụng `googleEventId` trên lesson cho event lẻ hoặc instance, trên series cho recurring master. Thêm unique `(seriesId, originalStartAt)` để không sinh trùng; đặt index cho truy vấn lịch, học viên và job đến hạn. Mapping luôn đi cùng lịch/kết nối đích, không tái sử dụng ID từ lịch cũ sang lịch mới.

### Lịch lặp

1. Một chuỗi có một recurring master trên Google; mỗi buổi trong app có ID riêng, ghi chú/điểm danh riêng.
2. Buổi này: giữ `originalStartAt`, cập nhật `startsAt`, đánh dấu ngoại lệ; Google tìm/cập nhật đúng instance, huỷ thì huỷ instance.
3. Buổi này và các buổi sau: cắt chuỗi cũ trước mốc chọn, tạo chuỗi mới. Giữ ID, ghi chú và điểm danh của các buổi đã tồn tại khi chuyển; đối chiếu các ngoại lệ trước khi đổi quy tắc.
4. Toàn bộ chuỗi: cập nhật các buổi chưa được khoá bởi lịch sử/điểm danh; giữ các ghi chú riêng và ngoại lệ hoặc báo xung đột để admin xử lý. Không xoá rồi tạo lại hàng loạt làm mất lịch sử.
5. Thao tác thay đổi mẫu ngày phải xem trước tác động và kiểm tra xung đột cả phạm vi, không chỉ tuần đang xem. Ngoại lệ không còn khớp chuỗi mới được giữ như buổi lẻ khi admin xác nhận phương án đó.
6. Chuỗi không kết thúc sinh trước khoảng 12 tuần, có tác vụ sinh tiếp. Khi mở khoảng xa hơn, gọi use-case sinh bổ sung có giới hạn trước khi tải lại lịch; không giới hạn ngày kết thúc nghiệp vụ thành 12 tuần. Job chạy lại không sinh trùng và không hồi sinh buổi đã huỷ.

Google hỗ trợ instance và cách tách chuỗi cho thao tác “buổi này và các buổi sau”; adapter phải phản ánh đúng các thao tác này. Nguồn: [Recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents).

### API

- Giữ các endpoint CRUD `/api/students` và `/api/students/[id]`; thêm phân trang, tìm kiếm/lọc phía server và trả thông tin lịch cản trở xoá.
- Mở rộng `GET /api/lessons`: khoảng `[from, to)` bằng ISO có offset, `studentId`, `coachName`, `status`. Lấy mọi buổi giao khoảng xem, giới hạn khoảng truy vấn và chỉ trả projection cần cho lịch.
- Giữ `POST /api/lessons`, `PATCH /api/lessons/[id]`, `DELETE /api/lessons/[id]`; mở rộng PATCH cho danh sách học viên, phiên bản và lựa chọn đồng bộ ghi chú. Huỷ cũng kiểm tra phiên bản.
- Thêm `GET /api/lessons/[id]` cho chi tiết đầy đủ; `PATCH /api/series/[id]` và mở rộng DELETE với phạm vi, mốc occurrence, phiên bản; giữ POST tạo series.
- Giữ route điểm danh hiện có. PATCH ghi chú không thay đổi điểm danh hoặc `LessonPackage.used`.
- Mở rộng `/api/google/status`; thêm API liệt kê/chọn lịch có quyền ghi, xem lỗi và thử đồng bộ lại. Tác vụ xử lý job/sinh lịch được scheduler của môi trường triển khai gọi qua endpoint có xác thực riêng.

## 6. Đồng bộ Google Calendar một chiều

Luồng bắt buộc: **Admin lưu → transaction ghi dữ liệu + audit + sync job → trả thành công cho UI → tác vụ nền gọi Google → cập nhật mapping/trạng thái**. Không giữ transaction DB trong lúc gọi mạng.

- Tạo/sửa/đổi giờ/đổi thời lượng/huỷ đều sinh yêu cầu đồng bộ. Đồng bộ bản đang có khi kết nối lần đầu hoặc kết nối lại, theo khoảng admin chọn; mặc định hôm nay đến hết phạm vi lịch tương lai đã sinh.
- Job có khoá/lease tránh hai tiến trình xử lý đồng thời, thứ tự theo event/chuỗi, phiên bản chống job cũ ghi đè bản mới. Tạo ID Google ổn định hợp lệ cho event/master để retry sau timeout không tạo trùng; đặt metadata riêng liên kết ID nội bộ. Google cho phép client cung cấp event ID để tránh tạo trùng sau lỗi: [Create events](https://developers.google.com/workspace/calendar/api/guides/create-events).
- Job instance phụ thuộc master tồn tại; tác vụ tách chuỗi ghi nhớ bước đã xong để chạy lại an toàn. Huỷ trước khi job tạo chạy phải hội tụ về không có sự kiện hoạt động.
- Retry có backoff cho rate limit/lỗi tạm thời, timeout; lỗi quyền/token chuyển sang Cần kết nối lại; lỗi dữ liệu dừng để sửa. Xoá một event đã không còn tồn tại được coi là hoàn tất sau kiểm tra đúng mapping.
- OAuth dùng quyền tối thiểu cho liệt kê lịch và chỉnh event (`calendar.calendarlist.readonly`, `calendar.events` theo lựa chọn lịch có sẵn); admin chọn lịch có quyền ghi. Kiểm tra lại ADMIN ở cả connect/callback, state một lần có hạn và ràng buộc phiên. Mã hoá token phía server bằng khoá môi trường, không trả token ra UI/log; lưu token mới và giữ refresh token cũ khi phản hồi refresh không cấp lại. Nguồn: [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [OAuth web server](https://developers.google.com/identity/protocols/oauth2/web-server).
- Màn kết nối hiển thị lịch đích, trạng thái kết nối, lần đồng bộ thành công, số việc đang chờ/lỗi; mỗi buổi có trạng thái tương ứng và nút thử lại. Mục tiêu khi dịch vụ bình thường: thay đổi xuất hiện trên Google trong tối đa khoảng 2 phút, cần xác nhận bằng nghiệm thu hạ tầng scheduler.
- Ngắt kết nối dừng xử lý job với kết nối cũ, giữ dữ liệu app và các event đã có trên Google. Kết nối lại cùng lịch tiếp tục mapping; đổi lịch phải là thao tác rõ ràng, tạo mapping mới và nêu cách xử lý event lịch cũ trước khi chạy.
- Vì đồng bộ một chiều, sửa trên Google không nhập lại vào app; UI kết nối giải thích app là nơi chỉnh lịch. Khi job app chạy lại, dữ liệu do app quản lý được ghi lại theo app. Chỉ quản lý event có mapping của ứng dụng.

## 7. Các đợt triển khai và nghiệm thu

Ước lượng sơ bộ cho một lập trình viên quen repo, gồm kiểm thử theo đợt; cần chốt lại sau bản thử thư viện và rà dữ liệu cũ. Chưa gồm thời gian chờ cấu hình/quy trình Google OAuth.

| Đợt | Nội dung | Điều kiện hoàn thành | Ước lượng |
|---|---|---|---|
| 1 | Thử FullCalendar trên Next 16/React 19; rà dữ liệu cũ và kế hoạch migration | Hiển thị/sửa thử trên desktop và mobile; chốt phiên bản, scheduler và mapping cũ | 1–2 ngày |
| 2 | Hoàn thiện CRUD học viên, API buổi học, ghi chú, timezone, quyền và version | Thêm/sửa/xoá mềm đúng; xoá trống trường được; sửa note độc lập; chống ghi đè và trùng lịch | 2–3 ngày |
| 3 | Lưới lịch, form dùng chung, kéo tạo/kéo đổi giờ/resize, lọc | Ngày/Tuần/Tháng/Danh sách; lỗi lưu hoàn tác; sử dụng được bằng cảm ứng và bàn phím | 3–4 ngày |
| 4 | Lịch lặp có ba phạm vi sửa/huỷ, ngoại lệ, sinh tiếp | Sửa một buổi không ảnh hưởng buổi khác; chuỗi không mất ghi chú/điểm danh; không trùng occurrence | 3–5 ngày |
| 5 | OAuth hoàn thiện, sync job, mapping instance, retry và backfill Google | Buổi lẻ/chuỗi/ngoại lệ khớp Google; lỗi mạng chạy lại không nhân đôi; hiển thị tình trạng rõ | 3–5 ngày |
| 6 | Kiểm thử tích hợp, migration staging, UAT, phát hành | Bộ tình huống bên dưới đạt; rollout và cách khôi phục được kiểm chứng | 2–3 ngày |

Tổng sơ bộ: **14–22 ngày công**, khoảng **3–5 tuần làm việc** cho một người. Sau đợt 3 có thể nghiệm thu trải nghiệm lịch nội bộ; bản đủ phạm vi yêu cầu cần hoàn thành cả lịch lặp và đồng bộ. Không coi code Google hiện có là đã đạt tiêu chí đồng bộ mới.

## 8. Kiểm thử và chuyển đổi

Tái sử dụng Vitest hiện có. Bổ sung kiểm tra tập trung cho logic mới, không thêm framework unit test:

- CRUD: tên toàn khoảng trắng, xoá giá trị tuỳ chọn, học viên đã xoá/ngừng học, ID trùng, hơn 100 học viên, xoá khi có lịch tương lai.
- Lịch: buổi qua nửa đêm/giao biên tuần/tháng, giờ Việt Nam trên thiết bị timezone khác, kết thúc đúng thời điểm buổi sau bắt đầu, hai admin cùng sửa hoặc đặt trùng.
- Ghi chú: lưu/xoá note cấp buổi, không thay đổi điểm danh/gói, không bị ghi đè bởi sửa chuỗi; kiểm tra ghi chú chia sẻ bị xoá cũng được xoá trên Google.
- Lịch lặp: N tuần, ngày kết thúc/số buổi, sinh tiếp sau 12 tuần, chạy job lặp không trùng, đổi giờ/huỷ một occurrence, tách chuỗi giữa các ngoại lệ, giữ lịch sử đã điểm danh.
- Đồng bộ: DB rollback không tạo event; Google đã tạo nhưng trả timeout không nhân đôi; retry lỗi tạm thời; token bị thu hồi; job tạo đến sau job huỷ; job cũ không ghi đè bản mới; reconnect và đổi lịch không dùng sai mapping.
- Quyền: STAFF bị từ chối mọi API quản trị gồm OAuth callback và retry; CSRF đúng; token/ghi chú riêng không xuất hiện trong response hoặc event ngoài ý muốn.
- Hồi quy: chạy kiểm tra gói/điểm danh hiện có, typecheck, lint, build và các test liên quan sau khi sửa code. Nghiệm thu thủ công desktop/mobile, light/dark, bàn phím và một Google Calendar thử nghiệm tách biệt.

Chuyển đổi theo hướng thêm cột/bảng → backfill có kiểm tra → bật code mới. Sao lưu trước migration; không dùng `db:push --accept-data-loss` cho rollout tính năng này.

Rà riêng chuỗi cũ: ngày kết thúc đang lưu có thể là mặc định 12 tuần, không tự suy ra là chuỗi vô hạn. `originalStartAt` của buổi đã dời không thể suy ra chắc chắn chỉ từ `startsAt`; đối chiếu RRULE, audit và Google, giữ trường hợp chưa rõ để xử lý trước backfill. Kiểm kê recurring master, instance và các buổi đã huỷ để không sinh bản sao hay hồi sinh lịch cũ.

Chạy đối soát app–Google trên lịch thử trước khi bật worker production. Khi rollback, dừng worker và quay về phiên bản đọc được schema mở rộng; giữ DB/audit/jobs để đối soát tiếp, không xoá bảng hay event hàng loạt. Trước khi phát hành cần có Google Cloud project bật Calendar API, OAuth client/redirect URI, lịch thử/lịch CLB, khoá mã hoá token và scheduler có lịch chạy thực tế.

## 9. Giả định nghiệp vụ để rà soát khi bắt đầu

Đồng bộ một chiều đã được người dùng xác nhận. Các lựa chọn còn lại trong kế hoạch là đề xuất dựa trên code hiện có: ADMIN quản lý toàn bộ module, một lịch chung CLB, chặn trùng giờ của cùng học viên, ghi chú mặc định nội bộ, ba phạm vi sửa chuỗi giữ lịch sử đã điểm danh, và hỗ trợ lặp tuần trong bản đầu. Có thể điều chỉnh các lựa chọn này trước đợt triển khai tương ứng mà không phải thiết kế lại toàn module.
