# Agent Rules - QL Truong Cung

## Code Style

- TypeScript strict mode.
- Single quotes, no semicolons.
- Use functional patterns where they keep the code simple.
- UI text, validation messages, toast messages, and business comments must be in Vietnamese.
- Use `formatVND()` from `@/lib/utils` for all VND display. Do not redefine money formatters locally.
- Use shared types from `@/types` when available. Do not duplicate core entity interfaces in pages unless the type is an include/projection shape specific to that file.
- Use `lucide-react` icons. Do not use emoji in UI.
- Use `Input`, `Select`, `Label`, `Modal`, `Badge`, `EmptyState`, `Skeleton`, and toast primitives from `src/components/ui/` when applicable.
- All mutations touching multiple tables must use `prisma.$transaction()`.

## Business Invariants

- One check-in session represents exactly one customer. Do not introduce group sessions, participant lists, or shared bills. A single customer session may still track multiple players (`Session.playerCount`) split into pricing groups (`SessionPricingGroup`, each with its own pricing-rule snapshot), and checkout can settle one pricing group at a time (`pricingGroupId`) — but the session always belongs to exactly one customer.
- `WALK_IN` customers pay for play time from check-in to checkout. Price can use pricing rules and promotions.
- `MEMBER` customers do not pay hourly play fees while their membership is active. Do not implement member play time as a fixed percentage discount.
- Membership must be modeled separately from `Customer.type`: use `MembershipPlan`, `Membership`, and `MembershipPayment`.
- If a member is expired at check-in, the UI/API should offer renewal before play. After successful renewal, allow check-in.
- Membership renewal rule:
  - Active member renewing early: new period starts after current `expiresAt`.
  - Expired member renewing later: new period starts on the payment date.
- Checkout uses `Invoice -> InvoiceItem -> Payment`, not direct `Session -> Payment`, so one invoice can include play time, products, services, membership fees, discounts, and payment records.
- Products and services must support inventory rules. `Product.type = PRODUCT` uses stock movements for sales, imports, corrections, and voids; `Product.type = SERVICE` does not track stock.
- Inventory quantity must change only through transactional stock flows (`StockMovement` plus audit), never by directly editing `Product.stockQuantity` from UI code.
- A staff shift is required for real POS operations. A shift is a shared counter shift: one open `Shift` can have multiple staff members through `ShiftParticipant`; each money-taking action must still record the acting `staffId`.
- Do not implement split payment or group bill unless explicitly requested. Current requirement does not need it.

## Target Domain Model

- `Customer`: person profile, `type` is `WALK_IN` or `MEMBER`.
- `Session`: one customer's play session, start/end time, status, staff, `playerCount`, pricing/promotion snapshots, and optional notes.
- `SessionPricingGroup`: pricing group inside one session — `playerCount`/`remainingCount` per pricing rule, with rule + tier snapshot; checkout decrements `remainingCount`.
- `PricingRule`: hourly play pricing for `WALK_IN` customers, keyed by `daysOfWeek`/`dayType`, exclusive `hourTo`, and effective dates.
- `PricingTier`: progressive hourly tiers per rule (`minHours` → `ratePerHour`); play price is computed tier-by-tier.
- `PromotionRule`: optional discounts for walk-in play time or invoice items.
- `MembershipPlan`: monthly membership package and fee.
- `Membership`: a customer's active/expired/cancelled membership period.
- `MembershipPayment`: membership fee payment history.
- `Product`: sellable product or service. `PRODUCT` tracks stock; `SERVICE` does not.
- `StockMovement`: inventory import, sale, adjustment, or void.
- `Invoice`: payable document for a customer/session/shift.
- `InvoiceItem`: line items such as `PLAY_TIME`, `PRODUCT`, `SERVICE`, `MEMBERSHIP_FEE`, `DISCOUNT`.
- `Payment`: payment against an invoice.
- `Shift`: shared counter shift with opening cash, expected cash, actual cash, difference, notes, and the staff member who opened it.
- `ShiftParticipant`: staff member participating in a shared shift, with join/leave timestamps and role.
- `Tool`: equipment item (bows, etc.) with quantity, `isRequired`, display order.
- `ShiftTool`: per-shift tool open/close counts, unique per `[shiftId, toolId]`.
- `AppSetting`: system key-value settings (e.g. `PARKING_FEE_UNIT_PRICE`).
- `ActivityLog`: audit trail for sensitive actions.

## Required Workflows

- Mobile-first staff UI:
  1. The first operational screen is `/sessions` as `Ca hôm nay`.
  2. Keep POS UI in `src/features/pos/`; route pages should stay thin.
  3. Bottom mobile navigation has five staff tabs: Ca, Hội viên, Kho, Báo cáo, Thêm.
  4. Disable check-in/checkout when there is no open shift.
  5. Member check-in must show membership status and require renewal before session creation when expired.
  6. `/customers` is the staff membership screen, not a generic customer CRUD table.
  7. Keep membership UI in `src/features/memberships/`.
  8. New member registration must create customer, membership, invoice, payment, and membership payment in one backend transaction.
  9. `/inventory` is the staff `Kho quầy` screen. Keep it mobile-first and keep UI logic in `src/features/inventory/`.
  10. Staff can view/search/filter inventory; only admin can create products/services or post stock movements.
  11. Inventory UI must distinguish `PRODUCT` stock states (`Hết`, `Sắp hết`, `Đủ`) from `SERVICE` items that do not track stock.
  12. `/reports` is the mobile operational report screen. Keep UI logic in `src/features/reports/`.
  13. Staff reports should show the current staff account/shift scope; admin reports can show all-system scope and CSV export.
  14. `/settings` is the mobile `Thêm` tab, not a plain settings page. Keep UI logic in `src/features/more/`.
  15. The `Thêm` tab should show account, current shift status, admin shortcuts first (các tab ẩn trên mobile: Bảng giá, Khuyến mại, Dụng cụ, Nhân viên, Gói hội viên), then operational shortcuts, theme controls, system status, and logout.
  16. Admin-only shortcuts such as pricing and staff management must be hidden from staff users in the `Thêm` tab.
  17. `/pricing` is the admin pricing-rule screen. Keep UI logic in `src/features/pricing/`.
  18. `/promotions` is the admin promotion-rule screen. Keep UI logic in `src/features/promotions/`. Only admin can create/edit/disable promotions; changes must write `ActivityLog`.
  19. `/tools` is the admin equipment screen. Keep UI logic in `src/features/tools/`. Only admin can create/edit/delete tools; POS reads them for per-shift tool counts.

- Check-in:
  1. Staff should have an open shift; current backend attaches it when present, and the UI should make opening shift mandatory before POS operations.
  2. Select or create one customer.
  3. Optionally set `playerCount` (multiple players under one customer). If players pay different rates, split them into `groups` (each `{ playerCount, pricingRuleId }`) — every group becomes a `SessionPricingGroup` with its own rule + tier snapshot.
  4. If customer is `WALK_IN`, require an applicable active `PricingRule` and snapshot the rule + tiers into the session (no default-rate fallback).
  5. If customer is `MEMBER`, verify active membership.
  6. If membership is expired, require renewal flow before session creation unless the user explicitly changes the business rule.

- Checkout:
  1. Validate the session is active and end time is not before start time.
  2. Build an invoice.
  3. For `WALK_IN`, add `PLAY_TIME` item from elapsed hours, tiered pricing, and the selected promotion (all from snapshots; discount goes into the item's `discountAmount`/metadata — no separate `DISCOUNT` line). Checkout can settle one pricing group via `pricingGroupId`, decrementing its `remainingCount`.
  4. For active `MEMBER`, play time item should be `0đ` or omitted, but products/services still apply.
  5. Optionally add a parking fee as a `SURCHARGE` line (`metadata.surchargeType: 'PARKING'`) priced from `AppSetting(PARKING_FEE_UNIT_PRICE)` — it reduces the invoice total.
  6. Deduct inventory for stock-tracked products through `StockMovement`.
  7. Record payment, close session, update customer totals, and write audit logs in one transaction.

- Inventory:
  1. `GET /api/products` is available to authenticated staff for the mobile inventory and checkout flows.
  2. `POST /api/products` is admin-only. Creating a `PRODUCT` with initial stock must create a starting `StockMovement`.
  3. `POST /api/products/[id]/stock` is admin-only and must block services, negative stock, and non-positive restock.
  4. `RESTOCK` quantities are positive; `ADJUSTMENT` quantities can be positive or negative but cannot make stock negative.
  5. Stock movement APIs should write `ActivityLog` for traceability.

- Pricing:
  1. Pricing changes are admin-only and must write `ActivityLog`.
  2. Do not use a default hourly rate when no active pricing rule matches. Walk-in check-in should fail with a clear Vietnamese message.
  3. `hourTo` is exclusive: a `17-21` rule applies from 17:00 up to before 21:00.
  4. Validate `hourTo > hourFrom`, `ratePerHour > 0`, and `effectiveTo >= effectiveFrom`.
  5. `/api/pricing/status` should expose `activeCount`; POS readiness should use this, not just total pricing-rule count.
  6. Rules may define `PricingTier`s (`minHours` → `ratePerHour`); play price is computed progressively per tier (`calculateTieredSubtotal`).
  7. Snapshot rule + tiers at check-in and recompute from the snapshot at checkout; do not silently re-resolve pricing when recording payment.

- Reports:
  1. Revenue reports must be based on `Payment` and `InvoiceItem`, not only `Session.totalAmount`.
  2. Use `Shift` data for current-shift reconciliation: opening cash, cash payments, expected cash, active sessions, completed sessions.
  3. Show payment method breakdown for `CASH`, `TRANSFER`, and `CARD`.
  4. Show item type breakdown for `PLAY_TIME`, `MEMBERSHIP_FEE`, `PRODUCT`, and `SERVICE`.
  5. Use the UI label `giao dịch` for payment counts because membership fees can be payments without a play session.
  6. CSV export is admin-only.

- More/settings:
  1. `/settings` should render `MoreScreen`; do not put large client state directly in the route page.
  2. The screen may read lightweight status from existing APIs (`auth/me`, current shift, pricing status, products).
  3. It must not mutate financial or inventory records directly.
  4. Logout must call `/api/auth/logout` and return the user to `/login`.

- Membership renewal:
  1. Select plan and payment method.
  2. Determine period start/end using the renewal rule above.
  3. Create membership payment, update membership, create invoice/payment records, and attach to current shift.

- Shift close:
  1. Summarize payments by method.
  2. Compare expected cash with actual cash.
  3. Store difference and notes.
  4. Mark open shift participants as left when the shift is closed.
  5. Prevent edits to closed shift financial records unless there is a deliberate admin correction flow with audit log.

## Architecture Guidance

- Keep this as a modular monolith. Do not split into microservices.
- Prefer use-case style functions for business flows such as check-in, checkout, membership renewal, stock adjustment, and shift close.
- Avoid putting business rules directly in React pages or route handlers. Route handlers should validate, authorize, call use-case logic, and return API responses.
- Financial records must be append-friendly and auditable. Prefer void/correction flows over destructive edits: invoice voids go through the `voidInvoice` use-case (mark `CANCELLED`, negative refund `Payment`, `VOID` stock movements, `INVOICE_VOID` activity log) — never hard-delete a paid invoice.
- Report dates must use Vietnam business timezone semantics, not accidental UTC grouping.
