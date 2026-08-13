# CONTEXT.md — Domain Glossary QLTruongCung POS

## Domain terms

- **Session (Phiên chơi)**: một lần check-in của một khách hàng. Có `playerCount` (số người chơi trong phiên), `status` (ACTIVE/COMPLETED/CANCELLED), `startTime`/`endTime`, snapshot pricing. Luôn thuộc về **một** customer.
- **SessionPricingGroup (Nhóm giá)**: nhóm người chơi trong một session, mỗi nhóm gắn với một PricingRule snapshot riêng (`label`, `playerCount`, `remainingCount`, `hourlyRate`, `pricingSnapshot`). Checkout decrement `remainingCount`; khi về 0 nhóm đã checkout hết.
- **Customer (Khách hàng)**: `WALK_IN` (khách vãng lai, trả tiền theo giờ) hoặc `MEMBER` (hội viên, không trả phí giờ chơi khi membership active). Khách ẩn danh được đặt tên `Khách #NNN`.
- **PricingRule (Bảng giá)**: quy tắc giá theo giờ cho khách vãng lai, keyed bởi `daysOfWeek`/`dayType`, `hourFrom`–`hourTo` (hourTo **exclusive**), effective dates. Có thể có `PricingTier` (bậc giá lũy tiến theo `minHours`).
- **PromotionRule (Khuyến mại)**: giảm giá tùy chọn cho tiền giờ chơi hoặc hóa đơn. Chỉ áp dụng cho khách vãng lai.
- **Membership (Hội viên)**: gói membership của một customer, có `startsAt`/`expiresAt`/`status`. Renewal sớm → kỳ mới bắt đầu sau `expiresAt` cũ; renewal trễ → bắt đầu từ ngày thanh toán.
- **MembershipPlan (Gói hội viên)**: package định kỳ (durationMonths, price).
- **Invoice (Hóa đơn)**: tài liệu thanh toán cho một customer/session/shift, gồm `InvoiceItem` (PLAY_TIME, PRODUCT, SERVICE, MEMBERSHIP_FEE, SURCHARGE) và `Payment`. Mọi dòng tiền đều qua Invoice → InvoiceItem → Payment (ADR-002). DRAFT invoices được merge vào PAID invoice khi checkout toàn bộ. Giảm giá khuyến mãi nằm trong `discountAmount` của dòng PLAY_TIME — không có dòng DISCOUNT riêng.
- **Payment (Giao dịch)**: bản ghi thanh toán với `kind` = `OPERATIONAL` (checkout/bán kèm) hoặc `MEMBERSHIP` (phí hội viên, gộp từ bảng MembershipPayment cũ — ADR-008). Phương thức `CASH`/`TRANSFER`/`CARD`/`MEMBER` (MEMBER là ghi nợ hội viên, không thu tiền mặt).
- **StockMovement (Phiếu kho)**: dòng biến động tồn kho (RESTOCK/ADJUSTMENT/SALE/VOID) — kho chỉ thay đổi qua stock flows, không sửa `stockQuantity` trực tiếp (ADR-004).
- **Shift (Ca làm)**: ca quầy chia sẻ — một `Shift` mở có thể có nhiều nhân viên qua `ShiftParticipant`. Có `openingCash`, `expectedCash`, `actualCash`, `cashDifference`, `status`. Mọi hành động thu tiền phải ghi `staffId` thực hiện.
- **ShiftTool (Dụng cụ ca)**: đếm dụng cụ (bow...) mở/đóng theo ca, unique `[shiftId, toolId]`.
- **Tool (Dụng cụ)**: trang thiết bị với `quantity`, `isRequired`, `displayOrder`.
- **AppSetting (Cài đặt)**: key-value toàn hệ thống, ví dụ `PARKING_FEE_UNIT_PRICE` (phí gửi xe — tính là SURCHARGE âm).
- **ActivityLog (Nhật ký)**: audit trail cho hành động nhạy cảm (check-in/out, void, stock, pricing change...).
- **Cashflow (Dòng tiền)**: quản lý thu/chi ngoài luồng hóa đơn (admin).

## Architecture terms

- **Module (domain)**: một thư mục `src/lib/<domain>/` với `ports.ts`, `use-cases/`, `validations.ts`, `helpers.ts`, `index.ts` (barrel). Business logic nằm ở use-cases, không ở route handlers (ADR-001, ADR-007).
- **Port**: interface repository trong `ports.ts`. Adapter trong `src/lib/infrastructure/adapters/` implement bằng Prisma.
- **Seam**: ranh giới giữa use-case và persistence — một adapter = hypothetical seam, hai (prod + test double) = real.
- **Deep module**: interface nhỏ, implementation lớn — dễ test, dễ navigate.
- **Shallow module**: interface gần bằng implementation (wrapper vô nghĩa).
- **Composition root**: `src/lib/infrastructure/repositories.ts` — singleton `repositories` + `createRepositories(tx)`.
- **Leakage**: business logic hoặc `as never` cast rò rỉ ra ngoài seam (đã dồn về reporting-adapter).
- **Overlap**: logic dùng chung giữa pricing + promotions (day normalization, shared day) nằm ở `src/lib/shared/overlap.ts`.

## ADRs

- **ADR-001**: Modular monolith + use-case pattern.
- **ADR-002**: Invoice-first finance (mọi dòng tiền qua Invoice → Item → Payment).
- **ADR-003**: Snapshot pricing tại checkout — check-in tạo group giá trống (`hourlyRate: 0`), checkout resolve + snapshot rule/tiers vào `SessionPricingGroup.pricingSnapshot`.
- **ADR-004**: Void invoice phải hoàn stock cả DRAFT đã merge; stock chỉ qua StockMovement.
- **ADR-005**: Edit invoice in-place (giữ invoiceNo, xóa/tạo items + payments).
- **ADR-006**: Split large POS components (today-shift-screen 2442 → 409 dòng).
- **ADR-007**: Port/Adapter cho use-cases (`deps: Repositories`, `Result<T>`, `err()`/`fail()`, `import { prisma }` chỉ trong infrastructure).
- **ADR-008**: Gộp `MembershipPayment` vào `Payment(kind=MEMBERSHIP)` — single-table inheritance, một bảng payment duy nhất.
