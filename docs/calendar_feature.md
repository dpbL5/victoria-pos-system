tôi muốn bạn kiểm tra verify lại chức năng module Lịch Học, Học viên và Lớp Học.

Flow như sau:

- Admin có thể Tạo lớp học bao gồm:
  - Tên lớp học
  - Lịch học
  - Danh sách học viên (thêm học viên vào lớp học)

Trong module Lịch học:

- Tạo lịch học cho lớp học bằng các tạo lịch lặp theo tuần. (Tận dụng lại module hiện có.)
- Có thể thêm các buổi học lẻ cho lịch học đó.
- Hiển thị lịch học trên giao diện lịch (Calendar).

Trong module Học viên:

- Admin có thể thêm, sửa và xóa học viên.
- Admin có thể xem lịch học của chỉ học viên đó, lớp nào học viên đó đang học.

Trong module Lớp học:

- Admin có thể xem lịch học theo danh sách
- Mỗi buổi học sẽ có bảng danh sách học viên và có thể điểm danh và note lại của từng học viên đó.

Ngoài ra, admin có thể:

- Xem lại note của buổi học trước của từng học viên.
- Xem lớp học gần nhất sắp tới.
- Đồng bộ dữ liệu lịch học với Google Calendar bằng nút "Đồng bộ với Google Calendar". (Không dùng worker)
