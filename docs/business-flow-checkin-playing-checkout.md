# Luồng nghiệp vụ: Check-in → Chơi → Check-out

> Tài liệu mô tả luồng vận hành chính của POS, kèm model + use-case tương ứng.
> Chi tiết kỹ thuật từng phần: `docs/api-routes.md` (routes), `docs/architecture.md` (ADR), `docs/pricing-solution.md` (pricing engine), `docs/promotions-solution.md` (khuyến mãi).

## 1. Tổng quan

- **1 session = 1 khách** — không group session, không bill chung. Một session có thể có nhiều người chơi (`playerCount`, `SessionPlayer` theo từng nhóm bảng giá).
- **Bắt buộc có ca mở**: mọi nghiệp vụ phát sinh tiền (check-in, bán kèm, checkout, gia hạn) chặn với lỗi `SHIFT_REQUIRED` nếu nhân viên chưa thuộc ca quầy đang mở.
- **Invoice-first**: tiền chỉ ghi qua `Invoice → InvoiceItem → Payment`, không ghi trực tiếp `Session → Payment`. Checkout và bán kèm đều tạo hoá đơn.
- **Snapshot-first**: bảng giá (rule + tiers) snapshot vào `SessionPricingGroup.pricingSnapshot`; khuyến mãi snapshot vào metadata dòng `PLAY_TIME`. Checkout tính từ snapshot, không resolve lại DB.
- Khách vãng lai **không tạo `Customer`** — tên lưu ngay trên `Session.customerName` (tự đặt `Khách #NNN` nếu bỏ trống).

## 2. Flow diagram

```
                    ┌─ Mở ca (LEAD, tiền đầu ca) ─┐
                    │  hoặc Tham gia ca (STAFF)   │
                    └──────────┬──────────────────┘
                               ▼
   ┌─── Check-in ────────────────────────────────┐
   │ WALK_IN: tên + playerCount (không tạo        │
   │   Customer, không snapshot giá — để trống)   │
   │ MEMBER : tìm theo tên/SĐT → membership còn   │
   │   hạn? KHÔNG → GIA HẠN TRƯỚC (Bước 5)        │
   │   → tạo Session ACTIVE + 1 pricing group     │
   │     trống + N SessionPlayer + SESSION_CHECK_IN│
   └──────────┬───────────────────────────────────┘
              ▼
   ┌─ Trong lúc chơi ────────────────────────────┐
   │ ticker realtime (session-timer)             │
   │ pause/resume (cả phiên hoặc từng người)     │
   │ bán kèm: sellItems → Invoice DRAFT + trừ    │
   │   kho ngay (StockMovement SALE)             │
   └──────────┬──────────────────────────────────┘
              ▼
   ┌─ Check-out ─────────────────────────────────┐
   │ chọn bảng giá (session chưa gán) / nhóm giá │
   │ chọn khuyến mãi + phí gửi xe                │
   │ → Invoice PAID: PLAY_TIME (tiered + KM vào  │
   │   discountAmount/metadata) + PRODUCT/SERVICE│
   │   + SURCHARGE(PARKING) → Payment → trừ kho  │
   │ → giảm remainingCount, mark players checked │
   │ → hết người: Session COMPLETED + SESSION_   │
   │   CHECK_OUT + hủy DRAFT đã gộp              │
   └──────────┬──────────────────────────────────┘
              ▼
   ┌─ Gia hạn hội viên (khi cần) ────────────────┐
   │ chọn gói + phương thức → Membership mới (nối│
   │ kỳ hoặc từ ngày đóng phí) + Invoice         │
   │ MEMBERSHIP_FEE + Payment(kind=MEMBERSHIP)   │
   └─────────────────────────────────────────────┘
```

## 3. Bước 1: Mở ca (tiền đề)

- Use-case: `openOrJoinShift({ staffId, openingCash, notes, toolCounts })` — `src/lib/shifts/use-cases/open-or-join.ts`
  - Đã trong ca mở → trả về ca hiện tại.
  - Có ca quầy đang mở → `upsertParticipant` (role `STAFF`), audit `SHIFT_JOIN`.
  - Chưa có ca → `createWithLead` (role `LEAD`, lưu `openingCash`), audit `SHIFT_OPEN`.
  - Dùng `Serializable` isolation + retry (P2002/P2034) chống race tạo ca trùng.
- Models: `Shift` (openingCash, status OPEN), `ShiftParticipant` (unique `[shiftId, staffId]`, role LEAD/STAFF, joinedAt/leftAt), `ShiftTool` (đếm dụng cụ đầu ca qua `toolCounts`), `ActivityLog`.
- Feature: `open-shift-dialog.tsx`, `tool-count-dialog.tsx` (đếm dụng cụ), orchestrate bởi `today-shift-screen.tsx` (nút `Mở ca`/`Tham gia ca` — `canJoinCurrentShift`).

## 4. Bước 2: Check-in

- Use-case: `checkIn(input)` → `checkInAnonymousWalkIn` (không có `customerId`) hoặc `checkInRegisteredCustomer` — `src/lib/sessions/use-cases/check-in.ts`; thân transaction `runCheckInTx`. Route: `POST /api/sessions`.
- Guard chung: `SHIFT_REQUIRED` (trong tx), khách đã đăng ký còn phiên ACTIVE → `ACTIVE_SESSION_EXISTS`.

### Nhánh vãng lai (WALK_IN)

- Không tạo `Customer` — tên lưu `Session.customerName`; bỏ trống → tự đặt `Khách #NNN` theo số phiên trong ngày (`countCreatedBetween`).
- **Hiện tại không chọn bảng giá lúc check-in**: `hourlyRate: 0`, `pricingRuleId: null`, `pricingRuleSnapshot: null` — bảng giá được chọn/gán khi checkout (xem Bước 4). (Khác với mô tả cũ snapshot-lúc-check-in; xem `resolveCheckoutPricing` trong `check-out.ts`.)
- Luôn tạo 1 `SessionPricingGroup` trống (`Nhóm 1`, `playerCount` = `remainingCount` = số người) + N `SessionPlayer` (`createPlayersForGroup`).
- Audit `SESSION_CHECK_IN`.

### Nhánh hội viên (MEMBER)

- `membership.findActive(customerId, now)` — nếu không còn hạn → `err('MEMBERSHIP_REQUIRED')` ("Vui lòng gia hạn trước khi check-in") → **cổng chặn bắt buộc gia hạn** (Bước 5) trước khi tạo session.
- Còn hạn → gắn `membershipId` vào session; tiền giờ = 0đ (pricing engine trả `isMemberSession: true`).

### Bảng giá & pricing engine (đọc thêm `docs/pricing-solution.md`)

- `src/lib/sessions/pricing-engine.ts`: `calculateSessionPrice`, `calculateSessionPriceFromLoaded`, `calculatePlayerPrice` (tính theo từng người chơi).
- Nguồn giá theo thứ tự ưu tiên: `pendingGroups` (chọn tại checkout) → snapshot của `SessionPricingGroup` (`pricingSnapshot`) → `Session.pricingRuleSnapshot` (session cũ) → fallback resolve DB cho legacy.
- Luỹ tiến theo tier: `calculateTieredSubtotal` (`minHours` → `ratePerHour`); khuyến mãi: `calculatePromotionDiscount` (cả hai từ `@/lib/promotion-calculation`).
- Không có rule phù hợp → `err('PRICING_RULE_NOT_FOUND')`, **không fallback giá mặc định**.
- Hội viên hết hạn **tại thời điểm checkout** → `membershipExpired: true` → chặn thu tiền (`MEMBERSHIP_EXPIRED_DURING_CHECKOUT`).

### Feature components

- `check-in-dialog.tsx` — modal 2 bước: chọn `WALK_IN`/`MEMBER`; nhập tên / tìm hội viên theo tên-SĐT; kiểm tra membership (`membershipActive`); hết hạn → hiển thị hướng dẫn gia hạn; nhập `playerCount` (mặc định 1) + `checkInStartTime`.
- `group-builder.tsx` — chia `playerCount` thành nhiều nhóm bảng giá (mỗi nhóm chọn rule riêng) khi > 1 người.
- `today-shift-screen.tsx` — component chính màn `Ca hôm nay`: load shift + sessions ACTIVE + auth (mỗi giây ticker), giữ state mở các dialog; chặn check-in khi chưa có ca.

## 5. Bước 3: Trong lúc chơi

- **Ticker realtime**: `today-shift-screen.tsx` (setInterval 1s) + `session-timer.tsx` / `active-session-card.tsx` — hiển thị elapsed (đã trừ pause) cho khách vãng lai; hội viên hiển thị "Hội viên còn hạn", tiền giờ 0đ. Phiên nhiều người: thẻ từng `SessionPlayer` với timer + pause riêng (`player-pause-card.tsx`).
- **Pause/resume**: `pauseSession`/`resumeSession` (cả phiên, `pausedAt` + `totalPausedSeconds`) và `pausePlayer`/`resumePlayer` (theo từng người, phiên nhiều người) — `src/lib/sessions/use-cases/pause-session.ts`; audit `SESSION_PAUSE`/`SESSION_RESUME`/`PLAYER_PAUSE`/`PLAYER_RESUME`.
- **Bán kèm đồ uống/dịch vụ**: `sellItems({ sessionId, staffId, items })` — `src/lib/sessions/use-cases/sell-items.ts`, route `POST /api/sessions/[id]/sell`:
  - Tạo `Invoice` **DRAFT** (`generateInvoiceNo('SEL')`) + dòng `InvoiceItem` (`PRODUCT`/`SERVICE`) — chưa thu tiền.
  - `PRODUCT` **trừ kho ngay** khi thêm vào phiên: `decrementStockIfAvailable` (không cho âm → `INSUFFICIENT_STOCK`) + `StockMovement` kiểu `SALE`.
  - DRAFT này sẽ bị hủy (`CANCELLED`, notes `Đã gộp vào hóa đơn {invoiceNo}`) khi checkout toàn bộ phiên.
  - Audit `SESSION_SELL`. UI: `sell-dialog.tsx` (giỏ hàng) + `sell-pick-dialog.tsx` (chọn sản phẩm).
- **Sửa hàng hoá trong màn thu tiền — KHÔNG gọi API theo từng thao tác**: bấm − / + hoặc thêm món ở `checkout-item-rows.tsx` chỉ ghi vào state của drawer. Phiên chỉ được ghi khi **đóng màn** hoặc khi **bấm Thu tiền** — mỗi lần đúng MỘT request.
  - Drawer giữ hai nguồn trong bộ nhớ rồi dán thành một danh sách: dòng đã bán kèm lúc chơi (`checkout-preview.pendingSellItems`, sửa qua `qtyOverride`) + hàng mới chọn lúc thu (`cart`).
  - Thêm một món đã có dòng bán kèm thì tăng ngay dòng đó, không tạo dòng trùng.
  - Trần tồn ở UI: dòng bán kèm đã trừ kho lúc thêm nên trần là `product.stockQuantity + item.quantity`; dòng giỏ (chưa trừ) thì trần là `product.stockQuantity`.
  - **Đóng màn (X / overlay / Escape)**: chưa sửa gì → đóng luôn, **không request nào** (tăng rồi giảm về đúng số cũ cũng không tính là thay đổi). Có sửa → hỏi lại `"Bạn vừa sửa hoá đơn check-out, tiếp tục thoát?"` (`ConfirmDialog`, nút `Ở lại` / `Thoát`).
  - **Đã xác nhận thoát thì LẠC QUAN**: đóng drawer + cập nhật `Tạm tính` trên card phiên NGAY, không đợi mạng. Lưu lỗi → toast + lùi card về số server trước khi sửa.
  - ⚠️ **Ghi lạc quan và làm mới là HAI việc tách rời, và thứ tự bắt buộc**: `onItemsOptimistic(sessionId, tổng)` chỉ ghi cache SWR (không gọi mạng), `onItemsSaved()` mới refetch — và chỉ được gọi **sau khi PATCH xong** (`.finally`). Gọi refetch ngay lúc bấm Thoát (như bản đầu) thì `GET /api/sessions` đọc DB trước khi PATCH ghi, trả về số cũ và **ghi đè số lạc quan → card mất hẳn "Tạm tính"**. Đây là race thật đã xảy ra, không phải giả định: mạng càng chậm càng lộ rõ.
  - Các lần lưu **xếp hàng** qua `saveQueueRef` trong `checkout-drawer.tsx`: nhân viên mở lại drawer rồi thoát tiếp trong lúc request trước còn bay, hai request về lệch thứ tự thì phiên giữ danh sách cũ.
  - Use-case `syncSessionSellItems` (`src/lib/sessions/use-cases/sell-items.ts`): hoà giải cả ba chiều (thêm / sửa số lượng / bỏ dòng), bù kho theo chênh lệch, audit `SESSION_SELL_SYNC`, **không tạo hoá đơn**.
  - `POST /api/sessions/[id]/sell` **chỉ phục vụ nút Bán kèm ngoài màn Ca hôm nay**.
  - Phép so "danh sách cuối khác gì danh sách đang có" nằm ở `src/lib/sessions/sell-item-diff.ts` — hàm thuần, **dùng chung cho cả `PATCH /sell-items` và `POST /checkout`** (xem Bước 4). Hai đường ghi mà tính chênh lệch khác nhau thì tồn kho phụ thuộc vào đường nào được gọi sau.


- **Phí gửi xe (SURCHARGE)**: không bán kèm — nhập `parkingVehicleCount` tại checkout, giá từ `AppSetting(PARKING_FEE_UNIT_PRICE)` (xem Bước 4).

## 6. Bước 4: Check-out

- Use-case: `checkOut(input)` — `src/lib/sessions/use-cases/check-out.ts`; thân transaction `runCheckOutTx`; route `POST /api/sessions/[id]/checkout` (preview: `GET /api/sessions/[id]/checkout-preview`).
- Guard trước transaction: `SESSION_NOT_FOUND`, session phải `ACTIVE`, `END_TIME_BEFORE_START`.
- **Gán bảng giá khi cần — điều kiện theo TỪNG NHÓM, không phải cả phiên** (`isUnpricedGroup(g)` = `!g.pricingSnapshot && hourlyRate === 0`):
  - **Nhóm đã có snapshot** = giá đã chốt ở lần thu trước → **khoá**, không tính lại, không gửi bảng giá cho nó.
  - **Nhóm chưa có snapshot** (phiên mới, hoặc **nhóm còn chơi sau khi nhóm khác đã thu xong**) → vẫn phải chọn được bảng giá riêng, chốt ngay tại lần thu đó.
  - **Thu trước KHÔNG chốt bảng giá cho cả nhóm** (`preserveCounts`): nhóm còn người chưa thu thì tx không `updatePricingGroup` — bảng giá chỉ áp cho người được thu lần này; phần người còn lại chọn lại bảng giá theo giờ thu ở lần sau, không bị khoá theo lần thu trước. Chỉ lần thu hết người của nhóm mới ghi snapshot + counts vào nhóm.
  - ⚠️ **Không dùng điều kiện session-wide** (`every(...)`) ở đây. Bản cũ dùng `session.pricingGroups.every(...)`: nhóm đầu thu xong là `every` sai → cả phiên rơi vào nhánh "đã gán giá" → nhóm còn chơi bị **khoá cứng** (UI ẩn ô chọn bảng giá) và server trả `PRICING_RULE_NOT_FOUND`. Lỗi này nằm ở cả 3 tầng: `checkout-drawer.tsx` (`needsPricing`/`locked`), `check-out.ts` (`isFreshPricing` vs `hasUnpricedGroups`) và `checkout-preview/route.ts`.
  - Payload thu trước: `playerIds` (chọn người) + `groupPricingRuleIds` (bảng giá cho từng nhóm CHƯA có giá, key = groupId). Nhóm đã có snapshot không gửi.
  - `resolveRulesForUnpricedGroups` (check-out.ts): ưu tiên bảng giá riêng của nhóm → `pricingRuleId` của request → auto-resolve rule hiệu lực tại giờ thu. `getVN...` dùng chung `toPricingSnapshot`/`isRuleEffectiveAt` với `resolveCheckoutPricing`.
  - `resolveCheckoutPricing` (nhánh `groups`, chia nhóm tại checkout) **chỉ chạy cho phiên MỚI hoàn toàn** (`isFreshPricing`), giữ nguyên hành vi cũ.
  - Lỗi: `PRICING_RULE_NOT_FOUND` / `PRICING_RULE_NOT_EFFECTIVE` / `GROUP_PLAYER_COUNT_MISMATCH`.
- **Khuyến mãi**: chỉ cho tiền giờ vãng lai — chọn `promotionRuleId`, `findAvailableById`; hội viên chọn KM → `PROMOTION_NOT_APPLICABLE`; hết hạn → `PROMOTION_UNAVAILABLE`.
- **Pause**: tổng giây paused tính theo từng player được thu (`playerPausedSeconds`, mốc `min(endTime, checkoutAt)`).

### Transaction `runCheckOutTx` (một `runInTransaction`, lỗi trong tx → `fail()` → rollback)

1. `SHIFT_REQUIRED` (TOCTOU guard) → lấy `shiftId`.
2. Persist bảng giá: `updatePricingGroup`/`createPricingGroup` (snapshot rule + tiers vào `pricingSnapshot`), `movePlayersToGroup` nếu chia nhóm.
3. Re-validate membership trong tx (TOCTOU) → `MEMBERSHIP_EXPIRED_DURING_CHECKOUT`.
4. Tính tiền per-player: `calculatePlayerPrice` (elapsed − pause, tiered + KM riêng từng người) → tổng; legacy không có player rows → tính 1 người × `checkoutCount`.
5. `createPaidInvoice` (`generateInvoiceNo()`) + dòng `PLAY_TIME`:
   - `quantity` = tổng played hours, `discountAmount` = tiền KM, `total` = đã trừ KM — **không có dòng `DISCOUNT` riêng**; metadata chứa `promotion` snapshot (`toPromotionMetadata`), `pricingGroupId`, `groupLabel`, `pausedSeconds`, `playerPricing`, `checkedOutPlayers`.
   - Thu trước (thu số người < tổng người chưa thu): metadata thêm `earlyCollection.sequence` (số lần thu trước = `countPaidBySession + 1`) + notes `Thu trước lần N — M người`.
   - Hội viên: `subtotal 0`, description `Giờ chơi hội viên × N người`.
6. Phí gửi xe: `parkingVehicleCount > 0` → dòng `SURCHARGE` (metadata `surchargeType: 'PARKING'`), giá từ `AppSetting(PARKING_FEE_UNIT_PRICE)`, **trừ vào tổng**; `updateInvoiceTotals`.
7. Dòng sản phẩm:
   - **`items` là DANH SÁCH CUỐI CÙNG của phiếu**, gồm cả dòng đã bán kèm lúc chơi lẫn hàng mới chọn lúc thu. Phép hoà giải dùng chung với `PATCH /sell-items`: `diffSellItems()` trong `src/lib/sessions/sell-item-diff.ts`.
     - dòng bán kèm có trong danh sách → chỉnh về số lượng đó; chênh lệch > 0 thì `decrementStockIfAvailable` (không âm → `INSUFFICIENT_STOCK`) + `StockMovement` SALE, chênh lệch < 0 thì `reverseStock` (`StockMovement` VOID). **Giá giữ nguyên `unitPrice` đã chốt lúc bán kèm.**
     - dòng bán kèm không có trong danh sách → bỏ khỏi phiếu, hoàn kho đúng số lượng đã bán.
     - sản phẩm trong danh sách mà chưa từng bán kèm → dòng mới, trừ kho toàn bộ ở giá hiện tại.
   - Nhiều dòng cùng một sản phẩm (dữ liệu cũ) được **gộp còn một dòng**: `desired` là số lượng cho cả sản phẩm, áp cho từng dòng sẽ nhân tổng lên và trừ thừa kho.
   - **`items` KHÔNG gửi (`undefined`) = hành vi cũ**: giữ nguyên mọi dòng bán kèm, chỉ cộng thêm hàng mới. Phân biệt `undefined` với `[]` là cố ý trong `session-validations.ts` — `[]` nghĩa là phiếu không còn dòng hàng nào.
8. `createPayment` (sessionId, invoiceId, shiftId, staffId, `paymentMethod` CASH/TRANSFER/CARD, grandTotal).
9. Thanh toán theo nhóm: `decrementGroupRemaining(pricingGroupId, checkoutCount)` + `markPlayersCheckedOut(playerIds)` (`checkedOutAt`) — cho checkout từng phần 1 nhóm người (`remainingCount`). Nếu `playerIds` chọn người từ nhiều nhóm, decrement từng nhóm theo số người đã thu (`playersToBillByGroup`).
10. Checkout hết người (`totalRemaining <= 0`): `Session` → `COMPLETED` (endTime, status, totalHours, subtotal, discountAmount, totalAmount, promotion fields) + `customer.recordPlay(hours, spent)` + hủy các DRAFT còn lại (`cancelDraftInvoices`). Checkout một phần (`thu trước`): session vẫn `ACTIVE`, `playerCount` = số người còn lại.
11. Audit `SESSION_CHECK_OUT` (kèm invoiceId, paymentId, mergedDraftInvoices, assignedPricingRuleIds...).

- Models: `Invoice`, `InvoiceItem` (PLAY_TIME/PRODUCT/SERVICE/SURCHARGE), `Payment`, `Session`, `SessionPricingGroup`, `SessionPlayer`, `Product`, `StockMovement`, `AppSetting`, `ActivityLog`.
- Feature: `checkout-drawer.tsx` — gọi `checkout-preview` (groups/pricingGroupId/playerCount hoặc `playerIds` + `groupPricingRuleIds`, `promotionRuleId`, `parkingVehicleCount`), hiển thị quote + breakdown giá từng người chơi (`playerPricing`) rồi POST checkout. UI hỗ trợ thu trước: chọn nhóm giá (hiện `remainingCount`/`playerCount`), stepper số người thu, hoặc checkbox chọn từng người chơi (bỏ chọn 1 người → thu trước phần còn lại). **Nhóm đã chốt giá thì khoá (chỉ hiện tên bảng giá); nhóm còn chơi chưa có giá vẫn hiện ô chọn bảng giá** — xem mục "Gán bảng giá khi cần" ở Bước 4; `active-session-card.tsx` (nút mở drawer), `invoice-detail-content.tsx` (xem hoá đơn đã tạo). Hoá đơn đã thanh toán chỉ hủy qua `voidInvoice` (`src/lib/invoicing/use-cases/void-invoice.ts`, ADR-004) — không xoá cứng.

## 7. Bước 5: Gia hạn hội viên (khi cần)

- Use-case: `renewMembership({ staffId, customerId, planId, paymentMethod, paidAt, notes })` — `src/lib/memberships/use-cases/renew-membership.ts`, route `POST /api/memberships/renew`; hội viên mới: `registerMember` (`POST /api/memberships/register`) — cùng transaction tạo customer + membership + invoice/payment.
- Guard: `CUSTOMER_NOT_FOUND`, `SHIFT_REQUIRED`, `PLAN_NOT_FOUND` (gói phải active).
- Kỳ hạn (`calculateRenewalPeriod` — `src/lib/memberships/helpers.ts`):
  - Còn hạn (`expiresAt > paidAt`) → `startsAt = expiresAt` cũ, **nối kỳ**.
  - Hết hạn → `startsAt = paidAt`, **kỳ mới từ ngày đóng phí**.
  - `expiresAt = addMonthsKeepingDay(startsAt, durationMonths)` (giữ nguyên ngày, clamp cuối tháng).
- Transaction: tạo `Membership` ACTIVE → `createPaidInvoice` (prefix `MEM`, dòng `MEMBERSHIP_FEE`, metadata membershipId/planId/startsAt/expiresAt) → `createPayment(kind=MEMBERSHIP)` (gộp từ `MembershipPayment` cũ — STI) → `customer.addSpend(price, true)` (đổi khách thành MEMBER) → audit `MEMBERSHIP_RENEW`.
- Models: `MembershipPlan`, `Membership`, `Invoice`, `InvoiceItem` (MEMBERSHIP_FEE), `Payment` (kind=MEMBERSHIP), `Shift`, `ActivityLog`.
- Feature: `member-screen.tsx` (màn `Hội viên`), `check-in-dialog.tsx` hiển thị hướng dẫn gia hạn khi hết hạn; sau khi gia hạn mới cho check-in.

## 8. Bảng tóm tắt models + use-cases theo bước

| Bước | Models chính | Use-case / function | Feature component |
|------|--------------|--------------------|-------------------|
| Mở ca | `Shift`, `ShiftParticipant` (LEAD/STAFF), `ShiftTool`, `ActivityLog` | `openOrJoinShift` — `src/lib/shifts/use-cases/open-or-join.ts` | `open-shift-dialog.tsx`, `tool-count-dialog.tsx` |
| Check-in | `Session`, `SessionPricingGroup`, `SessionPlayer`, `Membership` (đọc), `ActivityLog` | `checkIn` / `runCheckInTx` — `src/lib/sessions/use-cases/check-in.ts` | `check-in-dialog.tsx`, `group-builder.tsx` |
| Chơi (ticker/pause) | `Session` (pausedAt, totalPausedSeconds), `SessionPlayer`, `ActivityLog` | `pauseSession`/`resumeSession`, `pausePlayer`/`resumePlayer` — `src/lib/sessions/use-cases/pause-session.ts` | `session-timer.tsx`, `active-session-card.tsx`, `player-pause-card.tsx` |
| Bán kèm | `Invoice` (DRAFT), `InvoiceItem`, `Product`, `StockMovement` (SALE), `ActivityLog` | `sellItems` — `src/lib/sessions/use-cases/sell-items.ts` | `sell-dialog.tsx`, `sell-pick-dialog.tsx` |
| Check-out | `Invoice` (PAID), `InvoiceItem` (PLAY_TIME/SURCHARGE/PRODUCT/SERVICE), `Payment`, `Session`, `SessionPricingGroup`, `SessionPlayer`, `Product`, `StockMovement`, `AppSetting`, `ActivityLog` | `checkOut` / `runCheckOutTx` — `src/lib/sessions/use-cases/check-out.ts`; `calculateSessionPrice`/`calculatePlayerPrice` — `src/lib/sessions/pricing-engine.ts` | `checkout-drawer.tsx` (preview → POST) |
| Gia hạn / đăng ký | `MembershipPlan`, `Membership`, `Invoice`, `InvoiceItem` (MEMBERSHIP_FEE), `Payment` (kind=MEMBERSHIP), `Shift`, `ActivityLog` | `renewMembership` — `src/lib/memberships/use-cases/renew-membership.ts`; `registerMember` — `register-member.ts`; `calculateRenewalPeriod` — `src/lib/memberships/helpers.ts` | `member-screen.tsx` |
| Đóng ca (cuối luồng) | `Shift` (expectedCash/closingCash/cashDifference), `ShiftParticipant` (leftAt), `ShiftTool`, `ActivityLog` | `closeShift` — `src/lib/shifts/use-cases/close-shift.ts` | `close-shift-dialog.tsx` |

## Ghi chú kiến trúc

- Toàn bộ mutation nhiều bảng qua `runInTransaction()` (`src/lib/infrastructure/db-helpers.ts`); use-case trả `Result<T>` (`ok`/`err`/`fail`), map lỗi qua `mapCheckInError`/`mapCheckoutError`/`mapSellItemsError`/`mapOpenOrJoinShiftError`/`mapRenewMembershipError`.
- Route handlers chỉ: validate (Zod) → gọi use-case → `resultToResponse`/`apiSuccess` — xem `docs/api-routes.md`.
- Hoá đơn DRAFT bán kèm chỉ bị hủy (CANCELLED, đánh dấu `Đã gộp vào hóa đơn ...`) khi checkout toàn bộ phiên; hoá đơn PAID chỉ hủy qua `voidInvoice` (hoàn kho VOID, không tạo refund payment — payment gốc giữ nguyên, báo cáo lọc qua `invoice.status`) — `src/lib/invoicing/use-cases/void-invoice.ts`.
