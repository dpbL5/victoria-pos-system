# TODO - Quản lý trường cung POS

## ✅ Đã xong

- Đăng nhập: show/hide password, logging (ActivityLog)
- Kho: tạo sản phẩm/dịch vụ (PRODUCT/SERVICE), nhập/điều chỉnh tồn kho, xuất kho tự động khi bán
- Check-in: nhập số khách (playerCount), giờ check-in mặc định = giờ hiện tại
- Đồng hồ đếm giờ chơi live trên session (cả khách vãng lai & hội viên)
- Tạm dừng tính giờ cho cá nhân từng người trong nhóm, hiển thị giờ chơi cá nhân khi check out
- Checkout: phân nhóm theo bảng giá (mỗi nhóm 1 pricing rule, chọn thủ công từng người), thu tất cả 1 lần trong 1 hóa đơn
- Áp chương trình khuyến mãi khi checkout
- Bán kèm sản phẩm/dịch vụ khi checkout
- Phương thức thanh toán CASH / TRANSFER / CARD
- Ca hôm nay sắp xếp theo thời gian gần nhất
- Đếm dụng cụ tách riêng: nhập số đầu ca / đóng ca, đối soát
- Quản lý ca: mở/đóng ca, tổng kết theo phương thức thanh toán, so sánh tiền dự kiến/thực tế, ShiftParticipant
- Hội viên: đăng ký mới (1 transaction), gia hạn theo đúng rule (còn hạn → nối sau expiresAt; hết hạn → từ ngày thanh toán), gói hội viên
- Báo cáo doanh thu dựa trên Payment + InvoiceItem, tách riêng: giờ chơi / hội viên / nước & dịch vụ
- Chỉnh sửa hóa đơn đã tạo
- Export CSV báo cáo (admin)
- Quản lý thu chi (CashflowEntry)
- Trang Thêm: tài khoản, trạng thái ca, shortcut admin (Bảng giá, Khuyến mại, Dụng cụ, Nhân viên, Gói hội viên, Thu chi)

## ⏳ Chưa làm / còn thiếu

- Hiển thị mã QR khi thanh toán chuyển khoản (TRANSFER)
- Sửa giờ check-in của session đã tạo
- Báo cáo: biểu đồ tròn, biểu đồ cột
- Báo cáo: tổng số giờ chơi theo kỳ
- Báo cáo: hội viên theo thời gian (hội viên mới/tháng, doanh thu hội viên theo kỳ)
- Báo cáo: số khách/phiên theo khoảng ngày (hiện mới có số khách "hôm nay")
- Học viên: quản lý lịch học, số buổi đã dùng/còn lại, note
- Khuyến mãi theo nhóm khách (học sinh, sinh viên, hội viên lâu năm) — hiện chỉ áp dụng cho giờ chơi vãng lai
- Tích hợp Google Calendar / chọn ngày trong tuần để lên lịch
- Gói hội viên theo kỳ hạn dài: 6+1 tháng (4800k), 12+3 tháng (9600k), ưu đãi không giới hạn giờ + huấn luyện cơ bản
- SSE — để sau

## Ghi chú

- Menu dịch vụ kèm theo (sting) — nhu cầu từ Mr. Tin Ho, chưa rõ phạm vi
