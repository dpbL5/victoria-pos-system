# Architecture Decision Records — QLTruongCung POS

## ADR-001: Modular Monolith với Use-case Pattern

**Status:** Accepted (2025)

**Context:** Single-tenant POS cho 1 trường bắn cung, 1 team nhỏ. Không cần microservices, nhưng cần tách business logic khỏi UI và API handlers.

**Decision:** Business logic nằm trong `src/lib/<domain>/use-cases/`. Mỗi use-case là function nhận input + `deps` → trả `Result<T>` (ok/err, `fail()` trong transaction). Route handler chỉ validate + authorize + delegate. UI component chỉ render và gọi API.

**Consequences:**
- ✅ Use-case test được độc lập (mock input/output)
- ✅ Logic tái sử dụng giữa các route
- ❌ Thiếu interface port cho Prisma → khó mock DB trong test

---

## ADR-002: Invoice-First Finance

**Status:** Accepted (2025)

**Context:** Mọi giao dịch thu tiền (checkout, bán hàng, membership fee) đều liên quan đến tiền. Cần audit trail rõ ràng và khả năng void.

**Decision:** Mọi dòng tiền đều qua Invoice → InvoiceItem → Payment. Không có shortcut Session → Payment.

**Consequences:**
- ✅ Void từng phần dễ dàng
- ✅ Báo cáo doanh thu nhất quán (join Payment với Invoice status)
- ❌ Nhiều bảng hơn → query phức tạp hơn

---

## ADR-003: Snapshot Pricing tại Checkout (cập nhật 2026-08)

**Status:** Accepted (đã đổi thời điểm snapshot từ check-in → checkout)

**Context:** Admin có thể sửa bảng giá bất kỳ lúc nào. Bảng giá ban đầu được chọn lúc check-in; sau đó đổi thành resolve tại checkout để nhân viên chọn nhóm giá/phân nhóm người chơi linh hoạt hơn.

**Decision (hiện tại):** Check-in tạo session/group với `hourlyRate: 0`, `pricingRuleId/snapshot: null`. Lúc checkout, `resolveCheckoutPricing()` resolve rule (theo `input.groups`, `input.pricingRuleId`, hoặc auto-resolve rule hiệu lực tại giờ checkout) rồi snapshot rule + tiers vào `SessionPricingGroup.pricingSnapshot`. Checkout tính từ snapshot — không re-resolve khi ghi payment.

**Consequences:**
- ✅ Nhân viên gán bảng giá/nhóm giá tại thời điểm thu tiền, đúng giá đang hiệu lực
- ✅ Snapshot giữ giá cố định khi ghi payment (chống race khi admin sửa giá giữa chừng)
- ✅ Audit rõ ràng: giá nào được áp dụng cho nhóm nào
- ❌ Session chưa gán giá tại check-in — nếu không có rule hiệu lực lúc checkout thì chặn thu tiền (không fallback giá mặc định)

---

## ADR-004: Void Invoice Stock Reversal (cập nhật 2026-08-07)

**Status:** Accepted

**Context:** Khi checkout toàn bộ, `checkOut` merge DRAFT invoices vào PAID invoice. Stock bị trừ bởi DRAFT items (SALE movements trong `sellItems`). `voidInvoice` ban đầu chỉ hoàn stock của PAID invoice → **stock leak** nếu DRAFT đã merge vào PAID invoice.

**Decision:** `voidInvoice` phải hoàn stock của cả DRAFT invoices đã merge (status CANCELLED, notes chứa `Đã gộp vào hóa đơn {invoiceNo}`). Pattern giống hệt `editInvoice` D4.

**Consequences:**
- ✅ Stock không bị leak khi void invoice đã merge DRAFT
- ✅ `voidInvoice` và `editInvoice` nhất quán về stock reversal
- ❌ Query thêm 1 lần `findMany` merged drafts trong transaction

---

## ADR-005: In-place Edit cho Invoice

**Status:** Accepted (2026-08-06)

**Context:** Cần sửa invoice (thêm/xoá item, đổi payment method, sửa notes) nhưng giữ nguyên invoiceNo và không tạo invoice mới.

**Decision:** Sửa trực tiếp trên cùng invoice record: xoá items/payment cũ → tạo items/payment mới → cập nhật totals/notes. Cùng ID, cùng invoiceNo, status vẫn PAID.

**Consequences:**
- ✅ UX đơn giản — không redirect, không invoice thứ 2
- ✅ Audit trail giữ nguyên invoiceNo
- ❌ Không cross-reference giữa các lần sửa (chỉ có ActivityLog + notes)

---

## ADR-006: POS Component File Splitting (2026-08-07)

**Status:** Accepted

**Context:** `today-shift-screen.tsx` từng là monolithic file 2442 dòng chứa 16 functions/components. Khó maintain, merge conflict cao.

**Decision:** Tách mỗi component thành file riêng trong `src/features/pos/`. Quy tắc:
- Component pure presentational → file riêng ngay
- Component có state/hooks → tách dần, không refactor logic khi tách
- Sub-component chỉ dùng bởi 1 component → cùng file với component cha
- Shared types giữ trong `today-shift-screen.tsx` nếu chỉ 2 component dùng

**Consequences:**
- ✅ File chính giảm từ 2442 → ~2260 dòng (bước 1: 7 component nhỏ)
- ✅ Mỗi component có imports rõ ràng, độc lập
- ❌ Các dialog lớn (CheckInDialog, CheckoutDrawer) vẫn trong file chính — cần tách tiếp

**Trạng thái hiện tại (2026-08-07):**

| Component | File | Trạng thái |
|-----------|------|------------|
| MiniStat | `mini-stat.tsx` | ✅ Đã tách |
| InvoiceRow | `invoice-row.tsx` | ✅ Đã tách |
| formatPromotionOption | `promotion-option.ts` | ✅ Đã tách |
| ToolCountFields | `tool-count-fields.tsx` | ✅ Đã tách |
| TodayShiftSkeleton | `today-shift-skeleton.tsx` | ✅ Đã tách |
| QuickActions | `quick-actions.tsx` | ✅ Đã tách |
| SellPickDialog | `sell-pick-dialog.tsx` | ✅ Đã tách |
| ShiftRail | `shift-rail.tsx` | ✅ Đã tách |
| ActiveSessionCard | `active-session-card.tsx` | ✅ Đã tách |
| OpenShiftDialog | `open-shift-dialog.tsx` | ✅ Đã tách |
| CloseShiftDialog | `close-shift-dialog.tsx` | ✅ Đã tách |
| GroupBuilder | `group-builder.tsx` | ✅ Đã tách |
| SellDialog | `sell-dialog.tsx` | ✅ Đã tách |
| CheckInDialog | `check-in-dialog.tsx` | ✅ Đã tách |
| CheckoutDrawer | `checkout-drawer.tsx` | ✅ Đã tách |
| TodayShiftScreen | `today-shift-screen.tsx` | Chỉ còn component chính (~409 dòng) |

---

## ADR-007: Port/Adapter Pattern cho Use-cases

**Status:** Accepted (2026-08-07)

**Context:**
Use-cases hiện tại import `prisma` trực tiếp — không thể unit test nếu không có database thật,
logic nghiệp vụ bị trộn với persistence. Helper functions đã có pattern inject `db: Pick<Prisma.TransactionClient, ...>`
nhưng use-case thì chưa. ADR-001 đã nhận ra điều này: *"Thiếu interface port cho Prisma → khó mock DB trong test"*.

**Decision:**
1. Mỗi domain module định nghĩa `ports.ts` với repository interface. Adapter implement interface bằng Prisma
   dùng store types `Pick<Prisma.TransactionClient, ...>` — kế thừa pattern đã có từ helpers.
2. Use-case nhận `deps: Repositories` làm tham số (default = composition root singleton).
3. Use-case return `Result<T>` thay vì throw error string. Validation trước transaction → `err()`.
   Validation trong transaction → `fail()` (throw `RollbackSignal` để trigger rollback).
4. Route handler inject `repositories` vào use-case, dùng `resultToResponse()` để convert sang HTTP response.
5. Tổ chức code theo domain: `src/lib/<domain>/` với `ports.ts`, `use-cases/`, `validations.ts`, `helpers.ts`, `index.ts`.
6. `import { prisma }` chỉ được dùng trong 3 file: `infrastructure/prisma.ts`, `infrastructure/repositories.ts`, `infrastructure/db-helpers.ts`.

**Consequences:**
- ✅ Use-case test được với mock repositories — không cần database thật
- ✅ Ranh giới rõ giữa business logic và persistence
- ✅ Import path ngắn gọn qua barrel exports
- ✅ Transaction semantics giữ nguyên qua `fail()`/`RollbackSignal`
- ❌ Phải migrate từng domain — có period tạm thời 2 pattern cùng tồn tại
- ❌ `Pick<Prisma.TransactionClient, ...>` vẫn coupling vào Prisma type system (chấp nhận được — Prisma là ORM chính, và chỉ type-level)

**Implementation plan:** `docs/architecture-refactor-plan.md`

**Supersedes:** ADR-001 (phần "Thiếu interface port cho Prisma → khó mock DB trong test")

---

## ADR-008: Gộp MembershipPayment vào Payment (Single-Table Inheritance)

**Status:** Accepted (2026-08)

**Context:**
Trước đây phí hội viên ghi ở bảng `MembershipPayment` riêng, song song với `Payment` — 2 bảng cùng kiểu giao dịch tiền, gây trùng lặp ở màn Giao dịch, báo cáo ca, `getShiftTransactions` (phải join 2 nguồn), và `editInvoice`/`countLinkedTransactions` (phải xử lý 2 loại payment).

**Decision:**
Bỏ model `MembershipPayment`, gộp vào `Payment` với trường `kind` (`PaymentKind` enum):
- `OPERATIONAL` — checkout/bán kèm (có `sessionId`/`invoiceId` vận hành).
- `MEMBERSHIP` — phí hội viên (đính `customerId`/`membershipId`/`planId`, `subtotal = grandTotal = amount` phí).
- `Invoice.membershipPayments` relation thay bằng `payments`. Adapter `createMembershipPayment()` giờ ghi `store.payment.create({ kind: 'MEMBERSHIP', ... })` (giữ tên method cho use-case không đổi).

**Consequences:**
- ✅ Một bảng payment duy nhất — màn Giao dịch (`getShiftTransactions`), báo cáo ca, export, đối soát đọc 1 nguồn
- ✅ `countLinkedTransactions`/`deletePayments` đơn giản hơn (lọc theo `kind`)
- ✅ API contract của use-case không đổi (`createMembershipPayment` giữ tên)
- ❌ Phải migrate dữ liệu `membership_payments` cũ sang `payments` (thủ công / script)
- ❌ `Payment` giờ mang thêm field nullable dành riêng cho membership (`customerId`, `membershipId`, `planId`)
