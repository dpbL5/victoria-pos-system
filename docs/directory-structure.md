# Cấu trúc thư mục

> Tài liệu reference — đọc on-demand từ CLAUDE.md (mục "Cấu trúc thư mục").

```
src/
├── app/                        # App Router — routes + layouts
│   ├── (auth)/                 # Route group: public
│   │   └── login/              # Trang đăng nhập
│   ├── (dashboard)/            # Route group: protected (cần login)
│   │   ├── layout.tsx          # Sidebar (desktop) + Header (mobile) + BottomNav (mobile) + ToastProvider
│   │   ├── page.tsx            # Redirect về /sessions để nhân viên vào thẳng ca hôm nay
│   │   ├── sessions/           # Ca hôm nay: mở ca, check-in, checkout (gồm thu trước), bán kèm
│   │   ├── shifts/             # Quản lý ca làm, lịch sử ca, chi tiết đơn hàng theo ca
│   │   ├── customers/          # Hội viên: tìm, trạng thái, đăng ký, gia hạn, chi tiết + lịch sử
│   │   ├── inventory/          # Tồn kho quầy: sản phẩm/dịch vụ đang bán
│   │   ├── staff/              # Quản lý nhân viên (admin only)
│   │   ├── reports/            # Báo cáo doanh thu (tab Tổng quan + Kho) + export
│   │   ├── settings/           # Tab Thêm: lối tắt, theme, trạng thái hệ thống, đăng xuất
│   │   ├── membership-plans/   # Quản lý gói hội viên (admin only)
│   │   ├── promotions/         # Quản lý khuyến mãi giờ chơi (admin only)
│   │   ├── pricing/            # Quản lý bảng giá (admin only)
│   │   ├── tools/              # Quản lý dụng cụ (admin only)
│   │   ├── cashflow/           # Thu chi ngoài vận hành (admin only)
│   │   ├── transactions/       # Màn giao dịch (payment theo ca)
│   │   ├── invoices/[id]/      # Chi tiết hoá đơn + huỷ hoá đơn (void) + sửa hoá đơn (edit)
│   │   └── testing/            # Trang testing (dev, không trong nav chính)
│   ├── api/                    # REST API (Route Handlers)
│   │   ├── auth/               # login, logout, me
│   │   ├── customers/          # CRUD khách hàng + lịch sử hội viên (customers/[id]/history)
│   │   ├── sessions/           # CRUD phiên bắn + checkout, checkout-preview, sell, pause/resume, players
│   │   ├── invoices/           # Chi tiết hoá đơn + edit + void
│   │   ├── users/              # CRUD nhân viên
│   │   ├── reports/            # dashboard, revenue, export, trends, top-products + báo cáo ca (reports/shifts)
│   │   ├── pricing/            # Bảng giá giờ chơi + applicable + status
│   │   ├── promotions/         # Khuyến mãi giờ chơi + available
│   │   ├── membership-plans/   # Gói hội viên
│   │   ├── memberships/        # Lịch sử/gia hạn hội viên
│   │   ├── shifts/             # Mở/đóng/quản lý ca, participants, transactions, tool-counts
│   │   ├── products/           # Sản phẩm/dịch vụ và tồn kho
│   │   ├── cashflows/          # Thu/chi ngoài vận hành (admin only)
│   │   ├── tools/              # Dụng cụ (admin only)
│   │   ├── settings/           # AppSetting key-value (PUT admin only)
│   │   ├── activity-logs/      # Nhật ký hoạt động
│   │   └── seed/               # Seed database
│   └── layout.tsx              # Root layout (html, body)
├── proxy.ts                    # Auth route protection cho dashboard routes (Next.js 16)
├── components/                 # Shared UI components
│   ├── ui/                     # Primitives
│   │   ├── badge.tsx           # Badge (7 variants, 2 sizes)
│   │   ├── stat-card.tsx       # Card thống kê (icon, trend indicator)
│   │   ├── empty-state.tsx     # Empty list/table placeholder
│   │   ├── loading-dots.tsx    # Full-page spinner + dots animation
│   │   ├── skeleton.tsx        # Skeleton, TableSkeleton, StatCardsSkeleton, CardSkeleton
│   │   ├── toast.tsx           # ToastProvider + useToast hook
│   │   ├── modal.tsx           # Modal (responsive: bottom sheet mobile, overlay desktop)
│   │   ├── confirm-dialog.tsx  # ConfirmDialog — dialog xác nhận hành động nguy hiểm
│   │   ├── input.tsx           # Input, Select, Label, Textarea (style thống nhất)
│   │   ├── password-input.tsx  # PasswordInput — input mật khẩu có toggle hiện/ẩn
│   │   ├── button.tsx          # Button (6 variants, 4 sizes, icon, loading, fullWidth)
│   │   ├── filter-button.tsx   # FilterButton toggle (active/onClick)
│   │   ├── notice-card.tsx     # NoticeCard (4 tones: info/success/warning/danger)
│   │   ├── sortable-card-list.tsx  # SortableCardList — danh sách card kéo thả
│   │   └── sortable-table.tsx      # SortableTable — bảng kéo thả (dụng cụ)
│   └── layout/
│       ├── sidebar.tsx         # Desktop sidebar (collapsible, 256px/72px)
│       ├── bottom-nav.tsx      # Mobile bottom tab bar (5 tabs)
│       ├── header.tsx          # Mobile sticky top bar
│       └── theme-provider.tsx  # ThemeProvider (light/dark/system)
├── lib/                        # Business logic (server-side, Port/Adapter + domain modules — ADR-007)
│   ├── shared/                 # Cross-cutting (không import từ domain khác)
│   │   ├── auth.ts             # JWT (jose) + requireAuth/requireMutationAuth (CSRF + rate limit) + requireAdmin
│   │   ├── csrf.ts             # CSRF double-submit cookie: `qltrungcung_csrf` + header `X-CSRF-Token`
│   │   ├── constants.ts        # CSRF_COOKIE, CSRF_HEADER + hằng số dùng chung
│   │   ├── result.ts           # Result<T> = ok/err, DomainError
│   │   ├── utils.ts            # formatVND, calcHours, today, getDayType, getVnHour, getVnDay, parseStartOfDay...
│   │   ├── csv.ts              # CSV serialize (cho export báo cáo)
│   │   ├── overlap.ts          # Logic dùng chung pricing + promotions (day normalization, shared day)
│   │   ├── rate-limit.ts       # In-memory rate limiter (30 req/phút/IP, sliding window)
│   │   └── index.ts            # Barrel export
│   ├── infrastructure/         # Technical concerns — không chứa business logic
│   │   ├── prisma.ts           # Prisma client singleton (Prisma 7)
│   │   ├── db-helpers.ts       # runInTransaction + fail() (RollbackSignal)
│   │   ├── db-retry.ts         # Retry exponential backoff cho transient DB errors
│   │   ├── api-helpers.ts      # apiSuccess/apiError/resultToResponse/ERR_* constants
│   │   ├── store-types.ts      # Pick<Prisma.TransactionClient, ...> store types
│   │   ├── repositories.ts     # Composition root: repositories singleton + createRepositories(tx)
│   │   └── adapters/           # 13 file: session, invoice, membership, shift, product, pricing, promotion,
│   │                           #   audit, reporting, cashflow, settings, tool, user
│   ├── sessions/               # Domain: Session + SessionPlayer + SessionPricingGroup (ports, use-cases,
│   │   │                       #   pricing-engine.ts, session-validations.ts, product-validations.ts)
│   │   └── use-cases/          # check-in, check-out (gồm thu trước), sell-items, pause-session, rename-player,
│   │                           #   update-session, product-crud
│   ├── invoicing/              # Domain: Invoice + InvoiceItem + Payment (kind) — void-invoice, edit-invoice
│   ├── memberships/            # Domain: Customer + Membership + MembershipPlan — register/renew member
│   ├── shifts/                 # Domain: Shift + ShiftParticipant — open-or-join, close-shift
│   ├── pricing/                # Domain: PricingRule + PricingTier (read-side)
│   ├── promotions/             # Domain: PromotionRule (read-side)
│   ├── reports/                # Reporting read-side (ports + index — dashboard, revenue, trends, top-products)
│   ├── cashflow/               # Domain: CashFlow (admin thu/chi ngoài vận hành)
│   ├── settings/               # Domain: AppSetting key-value (cache TTL 60s)
│   ├── tools/                  # Domain: Tool + ShiftTool
│   ├── users/                  # Domain: User CRUD
│   ├── audit/                  # Domain: ActivityLog
│   ├── api.ts                  # Client fetch wrapper apiJson() tự đính CSRF header cho mutation
│   ├── swr-fetcher.ts          # swrFetcher() — wrap apiJson cho useSWR
│   ├── promotion-calculation.ts# calculateTieredSubtotal, calculatePromotionDiscount, snapshot helpers
│   └── __tests__/              # Unit tests (vitest) — 27 test files
│       ├── check-in.test.ts / check-out.test.ts
│       ├── pause-player.test.ts / rename-player.test.ts
│       ├── close-shift.test.ts / shifts.test.ts
│       ├── void-invoice.test.ts / register-member.test.ts / renew-membership.test.ts / delete-member.test.ts
│       ├── pricing.test.ts / pricing-engine.test.ts / promotion.test.ts
│       ├── top-products.test.ts / cashflow.test.ts / product-crud.test.ts / update-setting.test.ts
│       ├── memberships.test.ts / validations.test.ts / api-helpers.test.ts / result.test.ts / utils.test.ts
│       └── ...
├── hooks/
│   └── use-theme.ts            # Theme hook (light | dark | system)
├── features/
│   ├── pos/                    # Mobile-first POS: TodayShiftScreen, checkout drawer (gồm thu trước), dialogs, helpers
│   ├── shifts/                 # Mobile-first quản lý ca: ShiftManagementScreen, danh sách ca, chi tiết ca
│   ├── inventory/              # Mobile-first kho quầy: InventoryScreen, create/stock movement dialogs
│   ├── memberships/            # Mobile-first hội viên: MemberScreen, register/renew dialogs, CustomerDetailScreen
│   ├── reports/                # Mobile-first báo cáo: ReportsScreen (2 tab), ReportsOverview, ReportsInventory,
│   │                           #   ReportsCharts (SVG charts), (ReportsShifts/ReportsShiftDetail — orphaned)
│   ├── more/                   # Mobile-first tab Thêm: MoreScreen, shortcuts, preferences, logout
│   ├── pricing/                # Mobile-first quản trị bảng giá: PricingScreen, rule guards
│   ├── promotions/             # Mobile-first quản trị khuyến mãi: PromotionScreen
│   ├── tools/                  # Mobile-first quản trị dụng cụ: ToolsScreen
│   ├── cashflow/               # Mobile-first quản trị thu chi: CashflowScreen
│   ├── membership-plans/       # Mobile-first quản trị gói hội viên: MembershipPlansScreen
│   └── transactions/           # Mobile-first màn giao dịch: ShiftTransactionsScreen
└── types/
    └── index.ts                # Shared TypeScript types + enums
docs/                           # Tài liệu thiết kế quyết định (pricing-solution, promotions-solution) + refactor ADR
prisma/
└── schema.prisma               # Database schema
src/generated/
└── prisma/                     # Generated Prisma client (Prisma 7, imported từ src/lib/infrastructure/prisma.ts)

> **Cập nhật (2026-08-07, ADR-007):** `src/lib/` đã refactor theo port/adapter + domain modules:
> `shared/` (cross-cutting) ← `infrastructure/` (prisma, db-helpers, api-helpers, adapters, repositories) ←
> `domain/` (`sessions/`, `invoicing/`, `memberships/`, `shifts/`, `pricing/`, `promotions/`, `reports/`,
> `cashflow/`, `settings/`, `tools/`, `users/`, `audit/`)
> ← `app/` + `features/`. Mỗi domain có `ports.ts`, `use-cases/`, `validations.ts`, `helpers.ts`, `index.ts` (barrel).
> Use-cases return `Result<T>` (`@/lib/shared/result`), validation trong transaction dùng `fail()` (rollback).
> Chi tiết: `docs/architecture-refactor-plan.md`.
```

**Chú thích:**

- `src/app/(dashboard)/page.tsx` redirect về `/sessions` — màn đầu sau đăng nhập là `Ca hôm nay`.
- `proxy.ts` — auth route protection (Next.js 16 middleware, xem CLAUDE.md §12 Auth).
- Route pages phải mỏng: chỉ render screen tương ứng từ `src/features/*/`.
