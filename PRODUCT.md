# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Nhân viên quầy (STAFF)** — người trực tiếp đứng quầy, thao tác chủ yếu trên **điện thoại cá nhân** (mobile-first). Công việc: mở ca / tham gia ca, check-in khách vãng lai & hội viên, bán đồ uống/dịch vụ, checkout thu tiền, gia hạn hội viên, đối soát khi đóng ca. Bắt buộc thuộc ca quầy đang mở mới được thao tác tiền.
- **Chủ câu lạc bộ (ADMIN)** — cùng vận hành ở quầy, thêm quyền quản trị: bảng giá, khuyến mãi, dụng cụ, gói hội viên, nhân viên, tạo sản phẩm/nhập kho, báo cáo doanh thu, thu/chi ngoài luồng, export CSV, sửa hoá đơn.

## Product Purpose

POS fullstack vận hành hằng ngày cho **Victoria Archery Club** — quản lý ca quầy, check-in/check-out phiên chơi, hội viên, bảng giá giờ chơi, khuyến mãi, tồn kho và báo cáo doanh thu. Thành công = mọi nghiệp vụ thu tiền được ghi chính xác qua `Invoice → InvoiceItem → Payment`, truy vết theo nhân viên và ca, đối soát được khi đóng ca, tài chính có audit (`ActivityLog`) và chỉ void chứ không xoá.

## Positioning

POS được thiết kế quanh vận hành của một câu lạc bộ bắn cung cụ thể, không phải POS tổng quát:

- **Ca quầy dùng chung** (`Shift` + `ShiftParticipant`): một ca mở có nhiều nhân viên, mọi giao dịch ghi `staffId` người thao tác.
- **1 phiên = 1 khách**, nhưng 1 khách có thể có nhiều người chơi / nhiều nhóm giá (`SessionPricingGroup`) — chia bảng giá theo nhóm, thu trước từng phần.
- **Bảng giá theo giờ có tier lũy tiến**, resolve + snapshot ngay tại checkout (không fallback giá mặc định).
- **Hội viên còn hạn không tính tiền giờ chơi**; phí hội viên là dòng `MEMBERSHIP_FEE` riêng (`Payment kind = MEMBERSHIP`).

## Operating Context

- **Thiết bị:** điện thoại cá nhân của nhân viên (màn hình 375px+ là chủ yếu); desktop/tablet dùng sidebar. Mobile-first.
- **Môi trường:** tại quầy, khách đang chờ, thao tác nhanh, tiền bạc phải chính xác. Nhiều nhân viên có thể dùng chung một ca trong ngày.
- **Vòng đời ca:** Mở ca (nhập tiền đầu ca) → check-in → trong khi chơi có thể bán kèm → checkout (có thể thu trước từng nhóm/người) → đóng ca đối soát (tiền kỳ vọng vs thực đếm).
- **Bắt buộc:** nhân viên phải thuộc ca quầy đang mở mới thao tác tiền; mọi hành động thu tiền gắn `shiftId` + `staffId`.
- **Real-time:** đồng hồ + thành tiền cập nhật mỗi giây (`setInterval` ticker), không WebSocket.
- **Yêu cầu mạng** — không có offline mode.
- **Tiền tệ:** VND, lưu dạng Decimal, hiển thị qua `formatVND()`.
- Hệ thống đang **vận hành thật** với dữ liệu tài chính thật — thay đổi phải bảo toàn dữ liệu hiện có.

## Capabilities and Constraints

Nghiệp vụ đã chốt (nguồn: `AGENTS.md` Business Invariants + `docs/`):

- **Invoice-first:** mọi dòng tiền qua `Invoice → InvoiceItem → Payment`; không ghi `Session → Payment` trực tiếp.
- **1 session = 1 customer;** không group session/bill chung. Vẫn hỗ trợ `playerCount`, `SessionPlayer`, `SessionPricingGroup`.
- Khách vãng lai trả tiền giờ; **hội viên còn hạn không trả tiền giờ** (không phải % discount). Hết hạn → bắt buộc gia hạn trước khi check-in. Gia hạn sớm → nối kỳ sau `expiresAt`; gia hạn trễ → kỳ mới bắt đầu từ ngày đóng phí.
- **Pricing resolve tại checkout**, snapshot rule + tiers vào `SessionPricingGroup.pricingSnapshot`; check-in tạo group giá trống (`hourlyRate: 0`). Không fallback giá mặc định — hết rule hiệu lực thì chặn thanh toán tiền giờ.
- Khuyến mãi chỉ áp dụng cho tiền giờ vãng lai, snapshot vào metadata dòng `PLAY_TIME`; chiết khấu nằm trong `discountAmount`, không có dòng `DISCOUNT` riêng.
- Phí gửi xe là dòng `SURCHARGE` âm (`metadata.surchargeType: 'PARKING'`), giá từ `AppSetting(PARKING_FEE_UNIT_PRICE)`.
- **Tồn kho chỉ thay đổi qua `StockMovement`** (RESTOCK/ADJUSTMENT/SALE/VOID) + `ActivityLog`; `PRODUCT` không âm, `SERVICE` không quản lý tồn. Bán sản phẩm có tồn phải trừ kho.
- **Void hoá đơn:** đánh `CANCELLED`, hoàn stock cả các DRAFT đã gộp, giữ nguyên `Payment` gốc, không tạo refund payment, không hard-delete.
- **Ca đã đóng chỉ xem lịch sử** — không sửa hoá đơn/thanh toán ca đã đóng (trừ flow điều chỉnh admin có audit).
- **Vai trò:** STAFF thao tác; ADMIN quản trị (bảng giá, khuyến mãi, dụng cụ, gói hội viên, nhân viên, kho, thu/chi, export CSV, sửa hoá đơn).
- **UI tiếng Việt;** hỗ trợ light + dark; mobile-first, bottom nav 5 tab (Ca, Hội viên, Kho, Báo cáo, Thêm).
- **Single-tenant** — một trường bắn cung duy nhất.
- `Payment kind` = `OPERATIONAL` (checkout/bán kèm) hoặc `MEMBERSHIP` (phí hội viên); phương thức `CASH` / `TRANSFER` / `CARD` / `MEMBER` (`MEMBER` = ghi nợ hội viên, không thu tiền mặt).

## Brand Commitments

- Tên: **Victoria Archery Club**.
- Logo: `public/logo.jpg` (chữ V + mũi tên, đen + vàng đồng).
- Wordmark: `VICTORIA` (chữ in hoa, tracking rộng) + tagline `ARCHERY CLUB` (chữ in hoa, màu vàng đồng).
- Bảng màu: brand chính `#2563eb` (light) / charcoal `#1a1a1a` (dark); gold accent `#d4b572` (light) / `#b69854` (dark). Token đầy đủ trong `src/app/globals.css`.
- **Code name nội bộ bắt buộc giữ nguyên:** `qltruongcung` (package name, các localStorage/theme key như `qltrungcung_session`) — không đổi để không vỡ dữ liệu người dùng thật đang vận hành.

## Evidence on Hand

- Hệ thống **đang vận hành thật** với dữ liệu tài chính thật.
- Docs nghiệp vụ đã kiểm chứng với code: `docs/business-flow-checkin-playing-checkout.md`, `docs/pricing-solution.md`, `docs/promotions-solution.md`, `docs/api-routes.md`, `docs/architecture.md` (ADRs), `docs/ui-patterns.md`.
- Domain glossary + danh sách ADR: `CONTEXT.md`.
- Logo: `public/logo.jpg`.
- Chưa có `DESIGN.md` — visual system chưa được ghi thành tài liệu chính thức (gap ghi chép, không phải gap sản phẩm).
- Không có marketing copy, testimonial, case study, press — không bịa thêm.

## Product Principles

1. **Tiền bạc phải truy vết được từ đầu đến cuối** — invoice-first, `ActivityLog`, void thay vì xoá, snapshot giá/kho tại thời điểm ghi nhận.
2. **Vận hành ở quầy, trên điện thoại, có khách đang chờ** — tốc độ, đọc nhanh, ít thao tác, chính xác tiền bạc.
3. **Bảo toàn dữ liệu thật** — không phá vỡ key/code name/records hiện có; thay đổi luôn xét tới dữ liệu đang chạy.
4. **Quy tắc giá/hội viên được resolve & snapshot tại thời điểm thu tiền** — không resolve lại lặng lẽ, không fallback gây sai tiền.
5. **Phân quyền rõ: nhân viên thao tác, chủ CLB quản trị** — quyền quản trị giấu khỏi màn STAFF; mọi thay đổi nhạy cảm có audit.

## Accessibility & Inclusion

- Mobile-first từ 375px+, touch targets lớn, hỗ trợ light + dark mode.
- Chưa xác lập chuẩn truy cập (accessibility) đặc thù ngoài mobile-first.
