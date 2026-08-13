# API Routes — Reference

> Tài liệu reference — đọc on-demand từ CLAUDE.md (mục "API Routes"). Template route handler mẫu: `docs/code-conventions.md`.

## Danh sách API routes hiện có

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/auth/login` | POST | Đăng nhập |
| `/api/auth/logout` | POST | Đăng xuất |
| `/api/auth/me` | GET | Lấy thông tin user hiện tại |
| `/api/customers` | GET, POST | Danh sách + tạo khách hàng |
| `/api/customers/[id]` | GET, PUT | Chi tiết + cập nhật khách hàng |
| `/api/customers/[id]/history` | GET | Lịch sử đóng phí + giao dịch của hội viên (cho màn chi tiết hội viên) |
| `/api/sessions` | GET, POST | Danh sách + tạo phiên bắn |
| `/api/sessions/[id]` | GET, PUT | Chi tiết + cập nhật phiên |
| `/api/sessions/[id]/checkout` | POST | Checkout phiên bắn (hỗ trợ thu trước: `pricingGroupId`+`playerCount` hoặc `playerIds`, nhiều nhóm qua `groups`) |
| `/api/sessions/[id]/checkout-preview` | GET | Xem trước hoá đơn checkout (thành tiền theo nhóm/từng người, khuyến mãi, phí gửi xe) |
| `/api/sessions/[id]/sell` | POST | Bán kèm sản phẩm/dịch vụ trong lúc chơi (sellItems use-case, trừ kho) |
| `/api/sessions/[id]/pause` | POST | Tạm dừng cả phiên (pausedAt + totalPausedSeconds) |
| `/api/sessions/[id]/resume` | POST | Tiếp tục cả phiên |
| `/api/sessions/[id]/players/[playerId]` | PUT | Sửa tên người chơi (rename-player use-case) |
| `/api/sessions/[id]/players/[playerId]/pause` | POST | Tạm dừng một người chơi |
| `/api/sessions/[id]/players/[playerId]/resume` | POST | Tiếp tục một người chơi |
| `/api/shifts` | GET, POST | Xem ca hiện tại (`current=true`), ca quầy đang mở (`openOperational=true`), danh sách ca + mở/tham gia ca |
| `/api/shifts/[id]/close` | POST | Đóng ca, lưu tiền thực đếm/chênh lệch và log người đóng ca |
| `/api/users` | GET, POST | Danh sách + tạo nhân viên |
| `/api/users/[id]` | PUT, PATCH | Cập nhật + đổi mật khẩu |
| `/api/reports/dashboard` | GET | Stats dashboard, đối soát ca hiện tại, breakdown payment/item |
| `/api/reports/revenue` | GET | Doanh thu theo ngày (from/to params), staff thấy số liệu của mình, admin thấy toàn hệ thống |
| `/api/reports/export` | GET | Admin export CSV doanh thu/phiên |
| `/api/reports/shifts` | GET | Danh sách ca kèm doanh thu/giao dịch |
| `/api/reports/shifts/[id]` | GET | Chi tiết doanh thu một ca |
| `/api/reports/shifts/[id]/export` | GET | Admin export CSV chi tiết ca |
| `/api/reports/trends` | GET | Doanh thu theo giờ/ngày + breakdown payment method/item type + so sánh kỳ trước (from/to params) — cho charts màn Báo cáo |
| `/api/reports/top-products` | GET | Top sản phẩm bán chạy (from/to params): SL bán, doanh thu, lợi nhuận (từ `InvoiceItem.unitCost`) — tab `Kho` màn Báo cáo |
| `/api/seed` | POST | Seed database |
| `/api/membership-plans` | GET, POST | Danh sách + tạo gói hội viên |
| `/api/membership-plans/[id]` | PUT, DELETE | Cập nhật + xoá gói hội viên |
| `/api/memberships` | GET | Lịch sử hội viên (có `customerId`, `current=true` cho membership đang hiệu lực) |
| `/api/memberships/register` | POST | Đăng ký hội viên mới (customer + membership + invoice/payment trong transaction) |
| `/api/memberships/renew` | POST | Gia hạn hội viên (nối kỳ hoặc kỳ mới từ ngày đóng phí) |
| `/api/pricing` | GET, POST | Danh sách + tạo quy tắc giá (admin only, có overlap detection) |
| `/api/pricing/[id]` | PUT, DELETE | Cập nhật + xoá quy tắc giá (admin only, có overlap detection) |
| `/api/pricing/status` | GET | Đếm số quy tắc giá đang hiệu lực (`activeCount`) |
| `/api/pricing/applicable` | GET | Bảng giá đang hiệu lực ở thời điểm hiện tại (kèm `tiers`) |
| `/api/promotions` | GET, POST | Danh sách + tạo khuyến mãi (POST admin only) |
| `/api/promotions/[id]` | PUT, DELETE | Cập nhật + bật/tạm dừng (PUT); xoá hẳn (DELETE, admin only, ghi ActivityLog `PROMOTION_RULE_DELETE`) |
| `/api/promotions/available` | GET | Khuyến mãi đang hiệu lực hiện tại (cho POS chọn khi checkout) |
| `/api/products` | GET, POST | Danh sách + tạo sản phẩm/dịch vụ (POST admin only, tạo StockMovement tồn đầu kỳ) |
| `/api/products/[id]/stock` | POST | Nhập kho / điều chỉnh tồn kho (admin only, ghi StockMovement + ActivityLog) |
| `/api/shifts/[id]/participants` | GET, POST | Danh sách + thêm nhân viên tham gia ca |
| `/api/shifts/[id]/transactions` | GET | Giao dịch (payment) phát sinh trong ca, kèm đối soát |
| `/api/shifts/[id]/tool-counts` | GET, POST | Đếm dụng cụ mở/đóng theo ca (ShiftTool, unique `[shiftId, toolId]`) |
| `/api/cashflows` | GET, POST | Thu/chi ngoài vận hành (admin only) |
| `/api/cashflows/[id]` | PUT, DELETE | Cập nhật/xoá bản ghi thu chi (admin only) |
| `/api/invoices/[id]` | GET | Chi tiết hoá đơn (items, payments, customer, session, shift, staff) |
| `/api/invoices/[id]/edit` | POST | Sửa hoá đơn tại chỗ (giữ invoiceNo): xoá/tạo items + payments, cập nhật totals/notes (ADR-005) |
| `/api/invoices/[id]/void` | POST | Huỷ hoá đơn đã thanh toán: đánh dấu CANCELLED + hoàn kho VOID + ghi INVOICE_VOID. **Không tạo refund payment** — payment gốc giữ nguyên, báo cáo lọc qua `invoice.status` |
| `/api/tools` | GET, POST | Danh sách + tạo dụng cụ (POST admin only) |
| `/api/tools/[id]` | PUT, DELETE | Cập nhật + xoá dụng cụ (admin only) |
| `/api/settings` | GET, PUT | AppSetting key-value (vd `PARKING_FEE_UNIT_PRICE`); PUT admin only, ghi ActivityLog |
| `/api/activity-logs` | GET | Nhật ký hoạt động hệ thống |

## Luật

- **Response format cố định:**
  - Success: `{ success: true, data: T }` (status 200)
  - Created: `{ success: true, data: T }` (status 201)
  - Paginated: thêm `pagination: { page, limit, total, totalPages }`
  - Error: `{ success: false, error: "Mô tả tiếng Việt" }` (status 400/401/404/500)
- **Luôn check auth đầu tiên** — `await requireAuth()` cho GET; mutation (POST/PUT/PATCH/DELETE) dùng `await requireMutationAuth(request)` (JWT + CSRF + rate limit)
- **Luôn validate bằng Zod** trước khi xử lý
- `try/catch` chỉ còn cho `UNAUTHORIZED`/`CSRF_MISMATCH` (từ auth layer) + lỗi 500 thực sự — business errors qua `resultToResponse(result, mapXxxError)`/`apiError()` (không dùng try-catch cho business errors)
- Không cache Response (Next.js 16 mặc định không cache Route Handlers)
- Mutations trên nhiều table **phải dùng `runInTransaction()`** (từ `@/lib/infrastructure/db-helpers`) — không gọi `prisma.$transaction()` trực tiếp
- Dynamic params trong Next.js 16 là `Promise`: `{ params }: { params: Promise<{ id: string }> }`

## API nghiệp vụ đã triển khai

- `POST /api/sessions`: check-in 1 khách; hội viên phải có membership còn hạn; vãng lai **không** snapshot giá lúc check-in (tạo group giá trống `hourlyRate: 0`, resolve lúc checkout); hỗ trợ `playerCount` và `groups` (nhiều nhóm giá trong 1 session — mỗi nhóm tạo `SessionPricingGroup`).
- `POST /api/sessions/[id]/checkout`: checkout tạo `Invoice`, `InvoiceItem(PLAY_TIME)`, `Payment`, cập nhật session/customer; hỗ trợ checkout theo `pricingGroupId` (1 nhóm), `playerIds` (thu trước từng người), `groups` (nhiều nhóm), khuyến mãi (snapshot), phí gửi xe (`SURCHARGE`). Thu trước từng phần → session giữ `ACTIVE`, chỉ `COMPLETED` khi thu hết người.
- `POST /api/sessions/[id]/sell`: bán kèm sản phẩm/dịch vụ giữa phiên qua `sellItems()` — tạo invoice DRAFT, trừ kho, gắn ca.
- `POST /api/invoices/[id]/void`: huỷ hoá đơn qua `voidInvoice()` — đánh dấu CANCELLED, hoàn kho `StockMovement(VOID)` (cả DRAFT đã gộp), ghi `ActivityLog(INVOICE_VOID)`. **Không tạo payment hoàn trả** — payment gốc giữ nguyên, báo cáo lọc qua `invoice.status`. Áp dụng cho cả ca đã đóng (điều chỉnh bản ghi admin).
- `GET/POST /api/membership-plans`: danh sách/tạo gói hội viên.
- `GET /api/memberships`: lịch sử hội viên, có `current` cho membership đang hiệu lực.
- `POST /api/memberships/register`: đăng ký hội viên mới, tạo customer + membership + invoice/payment trong một transaction.
- `POST /api/memberships/renew`: gia hạn hội viên theo rule nối kỳ hoặc bắt đầu từ ngày đóng phí; tạo invoice/payment.
- `GET/POST /api/shifts`: xem ca hiện tại/danh sách ca/ca quầy đang mở (`openOperational=true`), mở ca mới hoặc tham gia ca quầy đang mở.
- `POST /api/shifts/[id]/close`: đóng ca, tính expected cash từ payment CASH và ghi `ActivityLog(SHIFT_CLOSE)` kèm người đóng ca.
- `GET/POST /api/products`: danh sách/tạo sản phẩm hoặc dịch vụ; `POST` chỉ dành cho admin và tạo `StockMovement` tồn đầu kỳ nếu có tồn ban đầu.
- `POST /api/products/[id]/stock`: admin nhập kho hoặc điều chỉnh kho trong transaction; chặn dịch vụ, chặn nhập kho âm, chặn tồn âm, ghi `StockMovement` + `ActivityLog`.

## Chi tiết ca và đơn hàng (đã triển khai)

- `GET /api/reports/shifts/[id]` và `GET /api/shifts/[id]/transactions`: chi tiết ca — tổng hợp payment theo phương thức, tổng doanh thu, số giao dịch, danh sách hoá đơn/đơn hàng từ `Invoice.shiftId` kèm `items`, `payments`, `customer`, `session`, `staff`. `STAFF` chỉ xem ca mình mở hoặc tham gia; `ADMIN` xem mọi ca. (Các endpoint này phục vụ màn quản lý ca `/shifts`; màn Báo cáo `/reports` không còn dùng tab `Theo ca`.)
- `GET /api/shifts` đã hỗ trợ lọc `from`, `to`, `staffId`, `status`; `staffId` chỉ cho `ADMIN`.
