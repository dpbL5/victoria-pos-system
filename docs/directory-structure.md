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
│   │   ├── sessions/           # Ca hôm nay: mở ca, check-in, checkout, bán kèm
│   │   ├── shifts/             # Quản lý ca làm, lịch sử ca, chi tiết đơn hàng theo ca
│   │   ├── customers/          # Hội viên: tìm, trạng thái, đăng ký, gia hạn
│   │   ├── inventory/          # Tồn kho quầy: sản phẩm/dịch vụ đang bán
│   │   ├── staff/              # Quản lý nhân viên (admin only)
│   │   ├── reports/            # Báo cáo doanh thu + export
│   │   ├── settings/           # Tab Thêm: lối tắt, theme, trạng thái hệ thống, đăng xuất
│   │   ├── membership-plans/   # Quản lý gói hội viên (admin only)
│   │   ├── promotions/         # Quản lý khuyến mãi giờ chơi (admin only)
│   │   ├── tools/              # Quản lý dụng cụ (admin only)
│   │   └── invoices/[id]/      # Chi tiết hoá đơn + huỷ hoá đơn (void)
│   ├── api/                    # REST API (Route Handlers)
│   │   ├── auth/               # login, logout, me
│   │   ├── customers/          # CRUD khách hàng
│   │   ├── sessions/           # CRUD phiên bắn + checkout, sell, checkout-preview
│   │   ├── invoices/           # Chi tiết hoá đơn + huỷ hoá đơn (void)
│   │   ├── users/              # CRUD nhân viên
│   │   ├── reports/            # dashboard, revenue, export + báo cáo ca (reports/shifts)
│   │   ├── pricing/            # Bảng giá giờ chơi + applicable (bảng giá đang hiệu lực)
│   │   ├── promotions/         # Khuyến mãi giờ chơi + available
│   │   ├── membership-plans/   # Gói hội viên
│   │   ├── memberships/        # Lịch sử/gia hạn hội viên
│   │   ├── shifts/             # Mở/đóng/quản lý ca, participants, transactions
│   │   ├── products/           # Sản phẩm/dịch vụ và tồn kho
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
│   │   └── notice-card.tsx     # NoticeCard (4 tones: info/success/warning/danger)
│   └── layout/
│       ├── sidebar.tsx         # Desktop sidebar (collapsible, 256px/72px)
│       ├── bottom-nav.tsx      # Mobile bottom tab bar (5 tabs)
│       ├── header.tsx          # Mobile sticky top bar
│       └── theme-provider.tsx  # ThemeProvider (light/dark/system)
├── lib/                        # Business logic (server-side)
│   ├── prisma.ts               # Prisma client singleton
│   ├── auth.ts                 # JWT auth (jose) + requireAuth/requireMutationAuth (CSRF + rate limit)
│   ├── csrf.ts                 # CSRF double-submit cookie: `qltrungcung_csrf` + header `X-CSRF-Token`
│   ├── api.ts / api-client.ts  # Client fetch wrappers (apiJson / api) tự đính CSRF header cho mutation
│   ├── constants.ts            # CSRF_COOKIE, CSRF_HEADER + hằng số dùng chung
│   ├── pricing.ts              # Pricing engine: tiered price, snapshot rule+tiers, promotion discount
│   ├── promotion-calculation.ts# calculateTieredSubtotal, calculatePromotionDiscount, snapshot helpers
│   ├── rate-limit.ts           # In-memory rate limiter (30 req/phút/IP, sliding window)
│   ├── db-retry.ts             # Retry exponential backoff cho transient DB errors
│   ├── business/               # Use-case helpers: memberships, shifts, invoices, audit, promotions, settings
│   ├── utils.ts                # Helpers (formatVND, formatHours, calcHours, today, getDayType, getVnHour, getVnDay)
│   └── validations/            # Zod schemas
│       ├── auth.ts
│       ├── customer.ts
│       ├── session.ts
│       ├── pricing.ts
│       ├── membership.ts
│       ├── product.ts
│       ├── promotion.ts
│       ├── tool.ts
│       └── shift.ts
│   ├── __tests__/               # Unit tests (vitest)
│       ├── memberships.test.ts
│       ├── pricing.test.ts
│       ├── promotion.test.ts
│       ├── shift-validations.test.ts
│       ├── tool-validations.test.ts
│       ├── utils.test.ts
│       └── validations.test.ts
├── hooks/
│   └── use-theme.ts            # Theme hook (light | dark | system)
├── features/
│   ├── inventory/              # Mobile-first kho quầy: InventoryScreen, create/stock movement dialogs
│   ├── memberships/            # Mobile-first hội viên: MemberScreen, register/renew dialogs
│   ├── more/                   # Mobile-first tab Thêm: MoreScreen, shortcuts, preferences, logout
│   ├── pos/                    # Mobile-first POS: TodayShiftScreen, checkout drawer, helpers
│   ├── pricing/                # Mobile-first quản trị bảng giá: PricingScreen, rule guards
│   ├── promotions/             # Mobile-first quản trị khuyến mãi: PromotionScreen
│   ├── tools/                  # Mobile-first quản trị dụng cụ: ToolsScreen
│   ├── reports/                # Mobile-first báo cáo: ReportsScreen, ReportsShifts, shift detail, overview
│   ├── shifts/                 # Mobile-first quản lý ca: danh sách ca, chi tiết ca, đơn hàng phát sinh
│   └── membership-plans/       # Mobile-first quản trị gói hội viên: MembershipPlansScreen
└── types/
    └── index.ts                # Shared TypeScript types + enums
docs/                           # Tài liệu thiết kế quyết định (pricing-solution, promotions-solution, refactor-plan)
prisma/
└── schema.prisma               # Database schema
src/generated/
└── prisma/                     # Generated Prisma client (Prisma 7, imported từ src/lib/infrastructure/prisma.ts)

> **Cập nhật (2026-08-07, ADR-007):** `src/lib/` đã refactor theo port/adapter + domain modules:
> `shared/` (cross-cutting) ← `infrastructure/` (prisma, db-helpers, api-helpers, adapters, repositories) ←
> `domain/` (`sessions/`, `invoicing/`, `memberships/`, `shifts/`, `pricing/`, `promotions/`, `settings/`, `audit/`)
> ← `app/` + `features/`. Mỗi domain có `ports.ts`, `use-cases/`, `validations.ts`, `helpers.ts`, `index.ts` (barrel).
> Use-cases return `Result<T>` (`@/lib/shared/result`), validation trong transaction dùng `fail()` (rollback).
> Chi tiết: `docs/architecture-refactor-plan.md`.
```

**Chú thích:**

- `src/app/(dashboard)/page.tsx` redirect về `/sessions` — màn đầu sau đăng nhập là `Ca hôm nay`.
- `proxy.ts` — auth route protection (Next.js 16 middleware, xem CLAUDE.md §12 Auth).
- Route pages phải mỏng: chỉ render screen tương ứng từ `src/features/*/`.
