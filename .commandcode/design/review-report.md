# Design Review: Checkout Drawer

**Target:** `src/features/pos/checkout-drawer.tsx`
**Register:** Product (Operate surface)
**Date:** 2026-08-13
**Score:** 27 / 50

---

## Overall Verdict

The checkout drawer is functionally complete — it handles walk-in pricing, member checkout, group sessions, partial checkout, promotions, parking, and products. As a working POS surface it does the job. As a design, it's a gray form with emerald selection states and no domain personality. Staff using this 50+ times per shift will find it functional but fatiguing: every section looks the same, the CTA label is a logic puzzle, and interactive targets are undersized for mobile hands.

---

## Heuristic Scores

| # | Heuristic | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | First impression | 6 / 10 | Clear title and customer metadata, but flat zinc-gray canvas with no visual anchor or domain signal |
| 2 | Hierarchy | 5 / 10 | All body sections compete at the same level; CTA label is a 7-deep ternary; footer summary is overloaded |
| 3 | Color voice | 5 / 10 | Zinc-gray base, emerald selects, amber/red warnings — competent but unchosen. Could be any admin panel |
| 4 | Type voice | 6 / 10 | Tabular nums correct, system fonts fine for product. Hierarchy contrast too flat — everything is text-sm |
| 5 | Interaction feel | 5 / 10 | Touch targets below 44px minimum, loading prop unused on CTA, no spinner on quote fetch |

---

## Cognitive Load

**Level: High**

- `PASS` Invoice rows with label/value are scannable and consistent
- `PASS` Tabular-nums on all financial figures prevent layout shift
- `PASS` Amber "Thu trước" warnings correctly signal partial state
- `PASS` Escape key closes modal, body scroll locked
- `WATCH` SectionCard collapsible pattern is repeated 6+ times with identical visual treatment — visual monotony
- `WATCH` "Nâng cao" section nested SectionCards (borders-in-borders) add visual noise without meaning
- `FAIL` Stepper buttons are 36px (h-9 w-9) and product buttons are 32px (h-8 w-8) — both below 44px touch target
- `FAIL` CTA label has 7 conditional branches in a ternary chain — staff cannot predict the button text
- `FAIL` "Thông tin hoá đơn" section is 145 lines of conditional JSX with no progressive disclosure

**Next modes:** `/interaction`, `/relayout`, `/recolor`

---

## What's Working

**Clear customer context in header**
The modal description line (`Hội viên · 02:15:34 · 3 người`) gives staff instant context. This is the right metadata at the right density.

**Correct financial presentation**
Discounts show in emerald, parking deductions show in red with explicit `-` prefix, and subtotal/total use tabular-nums. Follows taste guidance for negative financial values.

**Good state coverage for pricing**
The drawer correctly handles: no pricing rules (blocked), fresh session needing assignment, group sessions, partial checkout by player selection, and pre-assigned sessions. The state machine is thorough even if the visual presentation doesn't reflect the priority differences.

**Reasonable empty/error states**
Products empty state has a message. Quote loading has a text indicator. Quote errors show red text. Promotion errors show inline. These are present even if underdesigned.

---

## Priority Issues

### P0 — Touch targets below minimum for mobile-first POS

**Severity:** Functional blocker

The Minus/Plus stepper buttons are `h-9 w-9` (36px) and product quantity buttons are `h-8 w-8` (32px). For a mobile-first staff interface used on phones during service, these fall below the 44px minimum. Staff with larger hands or in a rush will mis-tap.

Lines 842-845 (stepper minus), 857-859 (stepper plus), 1110-1113 (product minus), 1119-1122 (product plus).

**FIX:** Increase stepper controls to `h-11 w-11` (44px) minimum. Product increment buttons to `h-10 w-10` (40px) minimum. The visual element can stay small; expand the hit area with padding or `::before`.

**Mode:** `/interaction`

---

### P1 — CTA button label is a 7-level ternary chain

**Severity:** Cognitive overload

Lines 675-697: the button text resolves through `isPartialByPlayers → groupMode → assignedCount → needsPricing → selectedGroupId → effectiveCheckoutCount → pricingGroups.length`. Staff scanning for the action need to predict what the button will say. At 7 branches, they can't.

```
submitting ? "Đang thu tiền..."
  : isPartialByPlayers ? `Thu trước ${n} người`
    : groupMode
      ? assignedCount < sessionPlayerCount ? ... : ...
      : needsPricing ? ...
        : selectedGroupId && ... ? ...
          : selectedGroupId && ... ? ...
            : isGroupSession && ... ? ... : "Thu tiền & kết thúc"
```

**FIX:** Extract a `getCtaLabel()` function with named conditions and early returns. Or simplify to 2-3 states: "Thu tiền", "Thu trước N người", "Đang thu tiền...". The branch on `pricingGroups.label` in the fallback case adds unnecessary variability.

**Mode:** `/interaction`

---

### P2 — All sections look identical — no visual priority

**Severity:** Hierarchy failure

Six SectionCards in the body ("Bảng giá", "Nâng cao", "Khuyến mại giờ chơi", "Phí gửi xe", "Đồ uống / dịch vụ", plus payment method) all use the same `rounded-xl border border-zinc-200` container. A staff member doing their 50th checkout cannot instantly distinguish primary (pricing/group setup) from optional (products, parking, promotions).

**FIX:** Give the pricing section visual weight — it's a prerequisite. Make optional sections (products, parking) visually secondary. Consider: pricing as a non-collapsible highlighted block, products/promotions as lighter collapsible sections.

**Mode:** `/relayout`

---

### P3 — Invoice summary is 145 lines of conditional rendering

**Severity:** Maintenance and comprehension risk

The "Thông tin hoá đơn" section (lines 506-651) handles quote loading, quote error, group/single distinction, per-player pricing breakdown, play time display, pause time, promotion discount, pending sell items, cart items, and parking fees — all inline with nested ternaries and IIFEs.

**FIX:** Extract sub-components: `PlayTimeSection`, `PlayerBreakdown`, `PendingItems`, `ProductLines`, `ParkingDeduction`. Each handles its own conditional rendering. The parent composes them.

**Mode:** `/refine`

---

### P4 — Nested SectionCards create border-within-border visual noise

**Severity:** Visual clutter

The "Nâng cao" SectionCard contains "Nhóm giá", "Số người thu", and "Người chơi sẽ thu" — each in their own SectionCard. The result is double-border nesting that adds no structural clarity.

Lines 751-984: parent SectionCard → inner SectionCards with identical styling.

**FIX:** Flatten inner sections. Use dividers (`border-t`) or spacing to separate subsections within the parent. Reserve SectionCard for top-level sections only.

**Mode:** `/relayout`

---

### P5 — Button loading prop exists but isn't used

**Severity:** Missed affordance

The `Button` component has a `loading` prop that shows a spinner and disables the button. The checkout button shows "Đang thu tiền..." as text but doesn't pass `loading={submitting}`. This means staff see text change but get no spinner animation, and the disabled state logic is duplicated between the prop and the text.

Lines 660-698.

**FIX:** Pass `loading={submitting}` to the Button and keep only the static label ("Thu tiền", "Thu trước N người"). The Button component handles the rest.

**Mode:** `/interaction`

---

### P6 — No domain personality in color

**Severity:** Brand absence

The entire drawer is zinc-gray + emerald selects + amber warnings + red errors. For a billiards hall, there's nothing that says "this is a billiard hall POS, not a generic admin panel." The color palette is the Tailwind default with no tint toward a brand hue.

**FIX:** Tint the neutral surfaces slightly toward a brand hue (billiards halls often associate with deep green, warm wood, or brass). Even a subtle shift — zinc with a hint of warm green in light mode, zinc with cool teal in dark — would make the surface feel authored.

**Mode:** `/recolor`

---

## Smell Detection

**Admin gray template:** The zinc/white/dark pattern with emerald accents is the most common Shadcn/Tailwind admin UI. It works but it's unchosen. A billiards hall POS should not look identical to a SaaS dashboard.

**Nested-card pattern:** SectionCards inside SectionCards with identical styling is a form-builder template. Real product UI flattens nested controls.

**Stepper widget copy:** The Minus/[number]/Plus control is a direct copy of standard counter patterns with no adaptation to the domain. No keyboard increment, no direct-input option, no batch operation.

---

## Recommendations (ordered by impact)

1. **Fix touch targets** → `/interaction` — Increase stepper and product button sizes to 44px minimum
2. **Simplify CTA label** → `/interaction` — Extract getCtaLabel(), reduce to 2-3 states
3. **Establish section priority** → `/relayout` — Give pricing visual weight, make optional sections lighter
4. **Add domain color** → `/recolor` — Tint neutrals toward brand hue, add warmth
5. **Flatten nested cards** → `/relayout` — Remove SectionCard nesting, use dividers
6. **Use Button loading** → `/interaction` — Pass loading prop, remove text-based loading state
7. **Extract invoice sub-components** → `/refine` — Break the 145-line conditional block
