<<<<<<< HEAD
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
=======
> **⚠️ ARCHIVED (2026-08-13)** — File ghi chú scratch từ quá trình phát triển, không còn là danh sách việc theo dõi. Giữ lại để tham khảo ý tưởng (SSE, chỉnh sửa hoá đơn, lịch học viên, tách tiền bán nước...). Danh sách việc hiện tại nằm ở git issues / quyết định trong `AGENTS.md` + `docs/`.

SSE- để sau.


Khách vào 

Số khách giờ + Giờ check in

Đồng hồ + tạm dừng

Check out -> phân nhóm tính tiền theo bảng giá áp cuối cùng

Áp ct khuyến mãi

Bán kèm thêm nếu sửa UI 

Cuối cùng.


Nên sắp xếp theo thời gian gần nhất.

Khi ấn chuyển khoản thì Hiện mã QR

Doanh thu


Giờ chơi

Hội viên



\--------

Học viên

Quản lý lịch học của học viên.

Quản lý số buổi của học viên.

Note.



Chỉnh sửa hoá đơn

Chỉnh sửa giờ check in.

Phương thức thanh toán/



Tạm dừng tính giờ chơi cho cá nhân của 1 nhóm.



Doanh thu.



Tách tiền bán nước riêng, hội viên  và giờ chơi ra riêng.

Biểu đồ tròn, biểu đồ cột.



Bao nhiêu khách/ phiên.



~~Quản lý thu chi.~~



Check in -> \[Giờ hiện tại] check in.



Tách check-in với đếm dung cụ đầu cai riêng.



Thêm show giờ chơi cho cá nhân group check out



~~Cho phép chọn khung giờ mặc định~~

Đã xong
---
Show password
Logging 
Kho
Thêm khả năng nhập số khi check in

---

Mr. Tin Ho

Quản lý trường cung POS

1. Phía khách vãng lai.
- Bắn theo giờ
 + Giá dịch vụ tự điều chỉnh theo giờ.
 + Quản lý campaign (sale). 

KM: Tính dựa vào tổng giờ chơi -> ...

Khách vào -> CTKM như học sinh, sinh viên; hội viên lâu năm -> cho phép quản lý các cái chương trình này.
- Menu dịch vụ kèm theo (sting)

2. Phía khách hội viên
- Sẽ giống khách vãng lai nhưng được lưu thông tin để làm hội viên.

3. Phía quản trị viên.
- Xuất báo cáo.
- Quản lý khách hội viên.
- Quản lý lượt bắn


4. Chọn ngày trong tuần. GG Calendar

Hội viên:
- Cơ bản: 800k/tháng
- 6 tháng: gói 6+1 tháng: 4800k
- Gói 12+3: 9600k

Ưu đãi: Không giới hạn số giờ trong tháng, được huấn luyện cơ bản.
>>>>>>> refs/remotes/origin/dev
