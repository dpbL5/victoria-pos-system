# Sequence Diagram — Luồng Bán kèm + Checkout + Bán lẻ

> Được sinh từ codebase `qltruongcung` (Next.js + Prisma). Actor: Nhân viên POS.
> - Use-case bán kèm: `src/lib/sessions/use-cases/sell-items.ts`
> - Use-case checkout: `src/lib/sessions/use-cases/check-out.ts` (`runCheckOutTx`)
> - Use-case bán lẻ: `src/lib/invoicing/use-cases/retail-sale.ts`
>
> **Ghi chú kiến trúc:** bán kèm KHÔNG tạo hóa đơn SEL/DRAFT nữa — ghi dòng tạm vào bảng `SessionSellItem` (`session_sell_items`); khi checkout tạo **1 invoice `INV-` duy nhất** chứa `PLAY_TIME` + các dòng bán kèm.

---

## Luồng 1 — Bán kèm (thêm hàng vào phiên đang chơi)

Ghi dòng bán kèm tạm `SessionSellItem`, trừ kho ngay nhưng **chưa tạo hóa đơn, chưa thu tiền**.

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Nhân viên (POS UI)
    participant API as POST /api/sessions/[id]/sell
    participant UC as sellItems (use-case)
    participant DB as Prisma (runInTransaction)

    Staff->>API: sessionId, staffId, items[{productId, quantity}]
    API->>UC: sellItems(input)

    Note over UC: ── Guard trước transaction ──
    UC->>DB: session.findByIdWithCustomer(sessionId)
    DB-->>UC: session
    alt phiên không tồn tại / đã kết thúc / đã hủy
        UC-->>API: err(SESSION_NOT_FOUND | SESSION_COMPLETED | SESSION_CANCELLED)
    end
    UC->>DB: product.findManyByIds(productIds)
    DB-->>UC: products (tính lines theo giá hiện tại)

    UC->>DB: runInTransaction(tx)
    Note over DB: ═══ TRANSACTION BEGIN ═══
    DB->>DB: shift.findOpenForStaff(staffId)
    alt không có ca mở
        DB--xDB: fail(SHIFT_REQUIRED) → rollback
    end

    loop từng line sản phẩm
        DB->>DB: product.findByIdForSale(productId)
        alt sản phẩm ngừng bán
            DB--xDB: fail(PRODUCT_UNAVAILABLE) → rollback
        end
        DB->>DB: session.addSellItem(sessionId, productId, qty, unitPrice, unitCost)
        opt type = PRODUCT
            DB->>DB: product.decrementStockIfAvailable(qty)
            alt hết tồn kho
                DB--xDB: fail(INSUFFICIENT_STOCK) → rollback
            end
            DB->>DB: product.recordSaleMovement(invoiceItemId: null, reason 'Bán kèm phiên {sessionId}')
        end
    end

    DB->>DB: audit.append(SESSION_SELL, note 'Thêm dòng bán kèm vào phiên (chưa thanh toán)')
    Note over DB: ═══ TRANSACTION COMMIT ═══
    UC-->>Staff: itemCount, grandTotal (hàng chờ thu gắn phiên)
```

**Điểm mấu chốt:** bán kèm chỉ ghi **dòng chờ thu** (`SessionSellItem`) + trừ kho ngay, **không tạo hóa đơn** nào. Xoá dòng chưa checkout (DELETE `/api/sessions/[id]/sell-items`) sẽ hoàn kho.

---

## Luồng 2 — Checkout (thu tiền + đóng phiên + gộp bán kèm vào invoice INV duy nhất)

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Nhân viên (Checkout Drawer)
    participant API as POST /api/sessions/[id]/checkout
    participant UC as checkOut (use-case)
    participant PE as Pricing Engine
    participant DB as Prisma (runCheckOutTx)

    Staff->>API: paymentMethod, items?, pricingRuleId/groups/playerIds?, parkingVehicleCount?
    API->>UC: checkOut(input)

    Note over UC: ── Pha 1: Guard + tính tiền (ngoài transaction) ──
    UC->>DB: session.findByIdWithPlayers(sessionId)
    UC->>UC: guard ACTIVE, endTime ≥ startTime
    alt session chưa gán giá (khách vãng lai)
        UC->>PE: resolveCheckoutPricing(pricingRuleId | groups | auto-resolve)
        PE->>DB: pricing.findByIdWithTiers(ruleId) / findApplicableRule(giờ VN, dayType)
        PE-->>UC: PendingAssignment[] (snapshot rule + tiers)
    end
    UC->>DB: promotions.findAvailableById(promotionRuleId)
    UC->>PE: calculateSessionPrice / calculateSessionPriceFromLoaded
    PE-->>UC: PricingResult (tiered, trừ pause, hội viên = 0đ giờ chơi)
    UC->>DB: session.findSellItems(sessionId)
    Note over UC: Gom TOÀN BỘ dòng bán kèm chờ thu (SessionSellItem)<br/>→ KHÔNG trừ kho lại (đã trừ lúc bán kèm)
    UC->>DB: product.findManyByIds(items mới trong request)

    UC->>DB: runInTransaction(runCheckOutTx)
    Note over DB: ═══ TRANSACTION BEGIN ═══
    DB->>DB: shift.findOpenForStaff(staffId) → fail(SHIFT_REQUIRED)?

    opt pendingAssignments (gán giá lúc checkout)
        DB->>DB: session.updatePricingGroup / createPricingGroup (persist snapshot)
        DB->>DB: session.movePlayersToGroup(playerIds)
    end

    opt hội viên — re-validate TOCTOU
        DB->>DB: membership.findActive(customerId) → fail(MEMBERSHIP_EXPIRED_DURING_CHECKOUT)?
    end
    DB->>DB: promotions.findAvailableById (re-check)

    Note over DB: Tính tiền per-player (played time − pause riêng từng người)
    DB->>DB: billing.countPaidBySession → earlyCollectionSequence ('Thu trước lần N')

    DB->>DB: billing.createPaidInvoice(notes 'Thu trước lần N — M người')
    DB->>DB: billing.createInvoiceItem PLAY_TIME<br/>(metadata: playerPricing, pause, khuyến mại)

    loop dòng bán kèm chờ thu (sellItemLines — đã chốt giá vốn lúc bán kèm)
        DB->>DB: billing.createInvoiceItem(type, unitPrice/unitCost snapshot)<br/>(KHÔNG trừ kho lại)
    end

    opt phí gửi xe > 0
        DB->>DB: settings.getNumeric(PARKING_FEE_UNIT_PRICE)
        DB->>DB: createInvoiceItem SURCHARGE (số Âm, metadata surchargeType PARKING)
        DB->>DB: updateInvoiceTotals (grandTotal − phí gửi xe, max 0)
    end

    loop line sản phẩm thêm mới trong request checkout
        DB->>DB: product.findByIdForSale → createInvoiceItem
        opt type = PRODUCT
            DB->>DB: decrementStockIfAvailable + recordSaleMovement
        end
    end

    DB->>DB: billing.createPayment(kind OPERATIONAL, method, paidAt)
    DB->>DB: session.decrementGroupRemaining / sumRemainingPlayers
    DB->>DB: session.markPlayersCheckedOut(playersToBill, checkoutAt)
    alt còn người (partial checkout)
        DB->>DB: giữ session ACTIVE (legacy: giảm playerCount)
    else thu hết người cuối
        DB->>DB: session.update(status COMPLETED, endTime, totals, promotion)
    end
    opt khách hội viên (có Customer)
        DB->>DB: customer.recordPlay(hours, spent)
    end
    DB->>DB: session.removeSellItems(mergedSellItemIds)
    DB->>DB: audit.append(SESSION_CHECK_OUT, mergedSellItemCount...)
    Note over DB: ═══ TRANSACTION COMMIT ═══
    UC-->>Staff: invoiceNo, grandTotal, remainingPlayers, sessionClosed?
```

**Điểm mấu chốt của checkout:** mỗi dòng bán kèm chờ thu được **gộp vào invoice INV duy nhất đúng 1 lần** (tạo InvoiceItem từ snapshot giá, sau đó xoá dòng ngay trong cùng transaction) — tránh double-billing khi "thu trước" nhiều lần; kho chỉ trừ thêm cho hàng gửi kèm request checkout, không trừ lại hàng đã trừ lúc bán kèm.

---

## Luồng 3 — Bán lẻ (nước/dịch vụ không gắn phiên, thu tiền ngay)

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Nhân viên (POS — RetailDialog)
    participant API as POST /api/retail-sales
    participant UC as retailSale (use-case)
    participant DB as Prisma (runInTransaction)

    Staff->>API: items[{productId, quantity}], paymentMethod, customerId?
    API->>UC: retailSale(input)

    Note over UC: ── Guard trước transaction ──
    UC->>DB: product.findManyByIds(productIds)
    DB-->>UC: products (tính lines theo giá hiện tại)

    UC->>DB: runInTransaction(tx)
    Note over DB: ═══ TRANSACTION BEGIN ═══
    DB->>DB: shift.findOpenForStaff(staffId)
    alt không có ca mở
        DB--xDB: fail(SHIFT_REQUIRED) → rollback
    end
    DB->>DB: billing.createPaidInvoice(invoiceNo 'INV...', sessionId: null, PAID)
    loop từng line sản phẩm
        DB->>DB: product.findByIdForSale → billing.createInvoiceItem
        opt type = PRODUCT
            DB->>DB: decrementStockIfAvailable(qty) → fail(INSUFFICIENT_STOCK)?
            DB->>DB: recordSaleMovement(reason 'Bán lẻ không phiên')
        end
    end
    DB->>DB: billing.createPayment(kind OPERATIONAL, sessionId: null, method, paidAt)
    opt có customerId
        DB->>DB: customer.addSpend(grandTotal) — tích luỹ chi tiêu
    end
    DB->>DB: audit.append(RETAIL_SALE)
    Note over DB: ═══ TRANSACTION COMMIT ═══
    UC-->>Staff: invoiceId, invoiceNo, grandTotal, paymentId
```

**Điểm mấu chốt:** bán lẻ tạo **invoice PAID + payment ngay** (không gắn phiên), trừ kho 1 lần khi bán, tích luỹ chi tiêu nếu chọn khách hội viên/vãng lai đã lưu.
