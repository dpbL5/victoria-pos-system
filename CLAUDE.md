@AGENTS.md

<!--
  Phân tầng tài liệu:
  - AGENTS.md: business invariants + architecture guidance (nguồn sự thật nghiệp vụ).
  - CLAUDE.md (file này): core rules + index — brand, tech stack, quy ước code, nghiệp vụ cốt lõi.
  - docs/*.md: reference chi tiết, đọc on-demand (directory-structure, api-routes, code-conventions, ui-patterns).
  Khi sửa business rule: sửa AGENTS.md trước, rồi cập nhật CLAUDE.md/docs nếu cần.
  Claude Code đọc CLAUDE.md (kèm @AGENTS.md); các coding agent khác (Copilot, etc.) có thể chỉ đọc AGENTS.md.
-->

# Victoria Archery Club — POS System

## Brand

- **Tên thương hiệu:** Victoria Archery Club
- **Logo file:** `public/logo.jpg` (V + mũi tên, đen + vàng đồng)
- **Wordmark:** `VICTORIA` (chữ in hoa, tracking rộng) + tagline `ARCHERY CLUB` (chữ in hoa, tracking dãn, màu vàng đồng)
- **Bảng màu:**
  - Brand (chính): `#2563eb` (light) / charcoal `#1a1a1a` (dark)
  - Gold accent: `#d4b572` (light) / `#b69854` (dark) — dùng cho tagline, hover nhấn, viền nhấn (chỉ định nghĩa trong dark mode, tham khảo `globals.css`)
  - Surface & text: theo bảng token trong `src/app/globals.css`
- **Code name nội bộ (giữ nguyên):** `qltruongcung` (tên package, localStorage key, theme key) — không đổi để tránh vỡ dữ liệu người dùng hiện tại.

## Tổng quan dự án

Hệ thống **POS (Point of Sale)** fullstack dùng Next.js 16, phục vụ vận hành **Victoria Archery Club** — quản lý ca quầy, hội viên, bảng giá giờ chơi, tồn kho và báo cáo doanh thu.

### 3 nhóm người dùng chính:

| Nhóm | Mô tả |
|------|-------|
| **Khách vãng lai** | Check-in từng người, chơi tính tiền theo giờ, có thể áp khuyến mãi, gọi đồ uống/dịch vụ |
| **Khách hội viên** | Đóng phí hội viên theo tháng, còn hạn thì check-in/out không tính tiền giờ, vẫn có thể mua đồ uống/dịch vụ |
| **Quản trị viên** | Quản lý hội viên, bảng giá, tồn kho, ca làm, báo cáo doanh thu, nhân viên |

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.10 |
| UI | React | 19.2.4 |
| Styling | Tailwind CSS | v4 |
| Icons | lucide-react | 1.x |
| Language | TypeScript (strict) | 5.x |
| ORM | Prisma | 7.8 |
| Database | PostgreSQL | 16+ |
| Auth | Custom JWT (jose) | 6.x |
| Validation | Zod | 4.4 |
| Testing | Vitest | 4.x |
| Package Manager | npm | — |

## Quyết định nghiệp vụ đã chốt

Nguồn sự thật: **`AGENTS.md` → Business Invariants** (1 khách 1 session, hội viên không tính tiền giờ, gia hạn nối kỳ, invoice-first, tồn kho bắt buộc, ca quầy chung + participants, không group bill, khuyến mãi chỉ cho tiền giờ vãng lai + snapshot, tiered pricing + snapshot, void hoá đơn, phí gửi xe SURCHARGE). Thiết kế chi tiết từng đợt: `docs/pricing-solution.md`, `docs/promotions-solution.md`, `docs/refactor-plan.md`.

## Cấu trúc thư mục

Cây thư mục đầy đủ: **`docs/directory-structure.md`**. Vị trí chính:

- `src/app/` — App Router: `(auth)/login`, `(dashboard)/` (sessions, shifts, customers, inventory, reports, settings, pricing, promotions, tools, cashflow, membership-plans, invoices/[id]), `api/` (Route Handlers)
- `src/components/` — `ui/` (primitives: badge, button, input, modal, toast, skeleton...), `layout/` (sidebar, bottom-nav, header, theme-provider)
- `src/lib/<domain>/` — business logic theo Port/Adapter pattern (xem §14): mỗi domain có `ports.ts`, `use-cases/`, `helpers.ts`, `validations.ts`, `index.ts`. Các domain: `sessions`, `invoicing`, `memberships`, `shifts`, `pricing`, `promotions`, `inventory`, `audit`, `cashflow`, `settings`. Shared cross-cutting: `src/lib/shared/`; infrastructure: `src/lib/infrastructure/`.
- `src/features/` — UI mobile-first theo từng màn (pos, shifts, inventory, memberships, reports, more, pricing, promotions, tools, cashflow, membership-plans)
  - `src/features/pos/` — Đã tách hết dialog: `today-shift-screen.tsx` (~409 dòng, component chính), `check-in-dialog.tsx`, `checkout-drawer.tsx`, `active-session-card.tsx`, còn lại `sell-dialog.tsx`, `group-builder.tsx`, `open-shift-dialog.tsx`, `close-shift-dialog.tsx`, `shift-rail.tsx`, `sell-pick-dialog.tsx`, `invoice-detail-content.tsx`, `invoice-edit-dialog.tsx`, `transaction-detail-screen.tsx`, helpers (`format.ts`, `types.ts`, `api.ts`). Xem `docs/architecture.md` ADR-006.
- `src/types/index.ts` — shared types + enums; `prisma/schema.prisma` — database schema

## Quy ước code

### 1. Tổ chức file

| Quy tắc | Mô tả |
|---------|-------|
| File name | `kebab-case.ts` cho lib/utils/types; `page.tsx` / `layout.tsx` / `route.ts` cho App Router |
| Component mới | Đặt trong `src/components/ui/` nếu là primitive (Button, Badge, Modal...); đặt trong `src/components/layout/` nếu là layout (Sidebar, Header...) |
| Hook mới | Đặt trong `src/hooks/`, tên file `use<Name>.ts` |
| Type shared | Đặt trong `src/types/index.ts` — KHÔNG định nghĩa lại type/interface cục bộ ở mỗi page |
| Validation | Shared schemas trong `src/lib/validations/`; domain-specific schemas trong `src/lib/<domain>/validations.ts`. Export cả schema + type inferred |
| Comment code | Dùng `// ── Section ──` cho section header dài. Comment nghiệp vụ bằng tiếng Việt |

### 2. Imports

**Thứ tự import:** React/Next → thư viện ngoài → `@/lib/*` → `@/types` → `@/components/*` → relative imports.

**Luật cứng:**
- **Luôn import `formatVND` từ `@/lib/utils`** — không tự định nghĩa lại function `formatVND` trong page
- **Luôn import shared types từ `@/types`** — không khai báo lại interface `Customer`, `Session`... ở từng page
- **Luôn import icons từ `lucide-react`** — không dùng emoji
- Dùng `import type { ... }` cho type-only imports

```tsx
// ✅ ĐÚNG
import { formatVND } from "@/lib/utils";
import type { Customer } from "@/types";
import { User, Plus, CheckCircle } from "lucide-react";

// ❌ SAI — định nghĩa lại util/types cục bộ
function formatVND(n: number) { return n.toLocaleString("vi-VN") + "đ"; }
interface Customer { id: string; fullName: string; ... }
```

### 3. Components

**Server vs Client:**
- **Server Components mặc định** — chỉ thêm `"use client"` khi cần `useState`, `useEffect`, `onClick`, event handlers...
- Fetch data trực tiếp trong Server Component bằng `async/await` + Prisma
- Dùng `<Suspense>` cho streaming các phần chưa sẵn sàng
- **Không import Server Component vào Client Component** — truyền qua `children` prop

**Shared components bắt buộc (đã extract — dùng lại, không viết lại), import từ `@/components/ui/*`:** `Badge`, `StatCard`, `EmptyState`, `LoadingDots`, `Skeleton`/`TableSkeleton`/`StatCardsSkeleton`/`CardSkeleton`, `Modal`, `ToastProvider` + `useToast`, `Input`/`Select`/`Label`/`Textarea`, `Button`, `FilterButton`, `NoticeCard`.

Catalog đầy đủ (kèm "Dùng khi" + ví dụ code): **`docs/ui-patterns.md`**. Template Client Component: **`docs/code-conventions.md`**.

### 4. Icons

- **Dùng `lucide-react` cho tất cả icons** — không dùng emoji trong UI
- Kích thước: `size={16}` cho inline, `size={20}` cho heading, `size={24}` cho icon lớn
- Bảng icon mapping chuẩn (Timer, Users, CreditCard, LogIn/LogOut, Ticket...): **`docs/ui-patterns.md`**

### 5. Data Fetching (Client Component)

- Luôn có `loading` state — render skeleton khi đang fetch
- Luôn có `error` state — bắt cả `d.success === false` và `catch` network error
- Dùng `useCallback` wrap function fetch, `useEffect` gọi nó — tránh React 19 `set-state-in-effect` lint error (suppress bằng `// eslint-disable-next-line react-hooks/set-state-in-effect`)
- KHÔNG dùng `.then().catch()` chains — dùng `async/await` + `try/catch`
- Template chuẩn: **`docs/code-conventions.md`**

### 6. Forms

- Luôn có `submitting` state → disable nút submit để chống double-submit
- Dùng **Toast notification** (`useToast()`) cho feedback sau submit — không dùng inline `feedback` state
- Sau submit thành công: reset form + refresh data (`load()`)
- Input fields: Dùng `<Input>`, `<Select>`, `<Label>` từ `@/components/ui/input` để style thống nhất
- Form validation errors (inline): hiển thị text đỏ nhỏ dưới field, không dùng toast
- Template chuẩn: **`docs/code-conventions.md`**

### 7. State Management

- **Không dùng state management library** (Redux, Zustand...)
- State cục bộ với `useState` cho từng page
- Data fetching từ API qua `useEffect` + `useCallback`
- **Client-side caching với SWR** (`useSWR` + `swrFetcher` từ `@/lib/swr-fetcher`) cho dữ liệu đọc nhiều/ghi ít (dashboard stats, pricing status). Mutation data (sessions, shift) vẫn fetch fresh mỗi lần vào page.
- Không truyền state qua route — dùng URL params nếu cần (query string, path params)

### 8. Styling

**Design token system** — nguồn sự thật: `src/app/globals.css` (CSS custom properties trong `:root` light + `.dark`). Bảng token light/dark: **`docs/ui-patterns.md`**.

**Quy ước:**
- **Light + Dark mode** — TẤT CẢ pages/components phải hỗ trợ cả 2 theme. Dùng `dark:` prefix. Không hardcode dark-only styles.
- Input fields: Dùng component `<Input>`, `<Select>`, `<Label>` từ `@/components/ui/input`.
- Card: `rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5`
- Table wrapper: `rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden`; rows: `divide-y divide-zinc-100 dark:divide-zinc-800/50`; header: `text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider`
- Nút primary/success/danger: classes chuẩn trong `docs/ui-patterns.md` (§ Design tokens)
- Responsive grid: `grid grid-cols-1 gap-3 md:gap-4 md:grid-cols-2 lg:grid-cols-4`
- **Mobile-first**: Tất cả page phải hoạt động tốt ở phone (375px+). Test cả 2 theme.
- **Animations**: `animate-fade-in`, `animate-slide-up`, `animate-slide-down`, `animate-scale-in` từ globals.css
- **Tabular numbers**: `tabular-nums` cho số đếm (đồng hồ, tiền) tránh layout shift
- **Font mono cho số liệu**: `font-mono` cho elapsed time, tiền tệ trong bảng

### 9. TypeScript

- **`interface` cho object types** (props, API responses, entities)
- **`type` cho unions/enum-like** (đã định nghĩa trong `@/types`)
- **Không dùng `any`** — nếu cần escape hatch, dùng `unknown` + type guard
- **Không export default types** — dùng named export
- Type inferred từ Zod schema luôn được export: `export type CreateInput = z.infer<typeof schema>;`

**Entity types:** dùng từ `@/types` (`import type { DashboardStats, SessionPayload } from "@/types"`) — không tự khai báo lại. Khi cần type mở rộng (include relations), khai báo interface cục bộ trong chính file đó (vd `SessionRow` kèm `customer`, `staff`).

### 10. API Routes

**Template chuẩn:** `docs/code-conventions.md` (§ API Route template). **Danh sách routes + nghiệp vụ đã triển khai:** `docs/api-routes.md`.

**Luật:**
- **Response format cố định:**
  - Success: `{ success: true, data: T }` (status 200); Created: `{ success: true, data: T }` (status 201)
  - Paginated: thêm `pagination: { page, limit, total, totalPages }`
  - Error: `{ success: false, error: "Mô tả tiếng Việt" }` (status 400/401/404/500)
- **Luôn check auth đầu tiên** — `await requireAuth()` cho GET; mutation (POST/PUT/PATCH/DELETE) dùng `await requireMutationAuth(request)` (JWT + CSRF + rate limit từ `src/lib/shared/auth.ts`)
- **Luôn validate bằng Zod** trước khi xử lý
- Không cache Response (Next.js 16 mặc định không cache Route Handlers)
- Mutations trên nhiều table **phải dùng `runInTransaction()`** (từ `@/lib/infrastructure/db-helpers`) — không gọi `prisma.$transaction()` trực tiếp
- Dynamic params trong Next.js 16 là `Promise`: `{ params }: { params: Promise<{ id: string }> }`
- **Route handler pattern (Port/Adapter):**
  - Read-only route: validate → query qua `repositories` singleton → `apiSuccess()` / `apiError(data, mapXxxError)`
  - Mutation route: validate → gọi use-case (use-case tự gọi `runInTransaction`) → `resultToResponse(result, mapXxxError)`
  - `try/catch` chỉ còn cho `UNAUTHORIZED`/`CSRF_MISMATCH` (từ auth layer) + lỗi 500 thực sự

### 10b. Use-case Architecture (Port/Adapter + Domain Modules)

Nghiệp vụ phức tạp được extract vào `src/lib/<domain>/use-cases/`. Kiến trúc hiện tại theo ADR-007 (Port/Adapter):

**3 lớp chính:**
- **Port:** Mỗi domain có `ports.ts` định nghĩa repository interface (vd `SessionRepository`, `BillingRepository`)
- **Adapter:** Implement port bằng Prisma trong `src/lib/infrastructure/adapters/` — nhận `Pick<Prisma.TransactionClient, ...>` store, dùng được với cả singleton `prisma` và transaction client `tx`
- **Composition root:** `src/lib/infrastructure/repositories.ts` kết nối tất cả adapters vào object `repositories` singleton (read-only) hoặc `createRepositories(tx)` (trong transaction)

**Domain modules hiện có:** `sessions`, `invoicing`, `memberships`, `shifts`, `pricing`, `promotions`, `settings`, `audit`, `cashflow`

**Pattern mỗi use-case:**
1. **Input interface** — params rõ ràng, có `now?: Date` để test được
2. **Result type** — return `Result<T>` = `{ ok: true, value: T }` | `{ ok: false, error: DomainError }`
3. **Main function** nhận `deps: Repositories` (default = `repositories` singleton)
4. **Validation logic:**
   - Trước transaction: `return err(code)` — không cần rollback
   - Trong transaction (cần rollback): `fail(code, detail)` — throw `RollbackSignal` để Prisma rollback
   - KHÔNG dùng `throw new Error('CODE')` trong use-case — reserved cho programmer errors
5. **`mapXxxError(error: DomainError): HttpErrorInfo`** — mapping từ error code sang HTTP response `{ code, message, status }`

**Transaction:** Dùng `runInTransaction(callback)` từ `@/lib/infrastructure/db-helpers` — tự động inject `createRepositories(tx)` và catch `RollbackSignal` → `err()`.

**Luật:**
- **Không đặt business logic trong route handler** — route handler chỉ validate, authorize, gọi use-case, trả response
- **Không đặt business logic trong React component** — component chỉ render UI và gọi API
- `import { prisma }` CHỈ được dùng trong 3 file: `infrastructure/prisma.ts`, `infrastructure/repositories.ts`, `infrastructure/db-helpers.ts`
- Mọi mutation tài chính phải ghi `ActivityLog` qua `audit` repository port
- Domain được `import type` từ ports của domain khác; không import adapter/use-case của domain khác
- Export public API qua `index.ts` barrel; code ngoài domain import từ barrel

### 11. Validation (Zod)

**Pattern:**
```ts
import { z } from "zod";

export const createThingSchema = z.object({
  name: z.string().min(1, "Tên không được để trống").max(100),
  price: z.number().positive("Giá phải > 0"),
  type: z.enum(["A", "B", "C"]).default("A"),
});

export type CreateThingInput = z.infer<typeof createThingSchema>;
```

**Luật:**
- Message lỗi bằng **tiếng Việt**, dễ hiểu với người dùng cuối
- Dùng `.safeParse()` (không `.parse()`) — tự trả lỗi 400, không throw
- Lấy message đầu tiên: `parsed.error.issues[0].message`
- Mỗi domain một file validation: `customer.ts`, `session.ts`, `auth.ts`

### 12. Auth

3 lớp bảo vệ (`src/lib/shared/auth.ts`, re-export qua `src/lib/auth.ts`):

1. **Middleware (`src/proxy.ts`)** — verify JWT từ httpOnly cookie `qltrungcung_session` (jose), chặn request vào dashboard routes; public: `/login` + static assets. Token không hợp lệ/hết hạn → redirect `/login` kèm `callbackUrl` (chỉ chấp nhận internal path chống open redirect). Production: throw ngay nếu `SESSION_SECRET` thiếu hoặc < 32 ký tự.
2. **API route (`src/lib/shared/auth.ts`)** — `requireAuth()` ném `"UNAUTHORIZED"` nếu chưa login, trả `{ userId, role }`; admin-only routes check `role !== "ADMIN"` → ném `"FORBIDDEN"`.
3. **Mutation protection (`requireMutationAuth(request)`)** — tự động: JWT + CSRF (double-submit cookie `qltrungcung_csrf` + header `X-CSRF-Token`) + rate limit 30 req/phút/IP (in-memory, `src/lib/shared/rate-limit.ts`).

- Client mutation phải dùng `api()` từ `@/lib/api-client` hoặc `apiJson()` từ `@/lib/api` — cả hai tự đọc cookie và đính `X-CSRF-Token`.
- Các lỗi DB tạm thời (pool exhausted, connection reset...) được retry tự động qua `src/lib/infrastructure/db-retry.ts`.
- Session: stateless JWT (HS256) trong httpOnly cookie `qltrungcung_session`; client check auth: `GET /api/auth/me` → nếu `!d.success` thì `router.push("/login")`.

### 13. Error Handling

**API (Route Handler):**
- Read-only routes: auth → query → `apiSuccess(data)` hoặc `apiError(data, mapXxxError)`
- Mutation routes: auth → validate → use-case (returns `Result<T>`) → `resultToResponse(result, mapXxxError)`
- `try/catch` chỉ còn bắt `UNAUTHORIZED`/`CSRF_MISMATCH` (từ auth layer) + lỗi 500 thực sự — không dùng try-catch cho business errors

**Error code convention:** `UPPER_SNAKE_CASE` string (vd: `SHIFT_REQUIRED`, `SESSION_NOT_FOUND`, `INSUFFICIENT_STOCK`). Không throw error string trong use-case — dùng `err()`/`fail()` từ `@/lib/shared/result`.

**Client:** Bắt cả `d.success === false` (hiển thị `d.error` từ server) và `catch` network error (`"Lỗi kết nối máy chủ"`). Template: `docs/code-conventions.md`.

### 14. UI Patterns

**Layout Architecture:**
- **Desktop (≥768px)**: Fixed sidebar bên trái (`src/components/layout/sidebar.tsx`), collapse (256px / 72px), state localStorage `qltrungcung_sidebar_collapsed`.
- **Mobile (<768px)**: Bottom tab navigation (`src/components/layout/bottom-nav.tsx`) đúng 5 tabs: `Ca`, `Hội viên`, `Kho`, `Báo cáo`, `Thêm`. Drawer sidebar dùng chung `staffMenuItems` với desktop sidebar để không lệch menu.
- **Main content**: Phải có `pb-16 md:pb-0` để bù cho bottom nav trên mobile.
- **ToastProvider**: Wrap toàn bộ dashboard layout trong `layout.tsx`.

**Mobile-first POS screen:**
- `/` redirect về `/sessions`; page chỉ render `TodayShiftScreen` (trong `src/features/pos/`).
- Chưa có ca mở → disable check-in/checkout + hiển thị hành động `Mở ca`.
- Check-in hội viên hiển thị trạng thái membership; hết hạn hoặc hội viên mới → gia hạn trước rồi mới tạo session.
- Checkout dùng drawer hoá đơn: `PLAY_TIME` + sản phẩm/dịch vụ + phương thức thanh toán. `PRODUCT` tôn trọng tồn kho, không cho chọn vượt tồn.

**Mobile-first shift management screen:**
- `/shifts` là quản lý ca + lịch sử (không thay thế `/sessions`); page chỉ render `ShiftManagementScreen` (trong `src/features/shifts/`).
- `STAFF` chỉ thấy ca mình mở/tham gia; `ADMIN` xem toàn bộ, lọc theo nhân viên, status `OPEN`/`CLOSED`, ngày mở ca.
- Danh sách ca hiển thị: nhân viên, mở/đóng, trạng thái, tiền đầu ca, tiền mặt dự kiến, thực đếm, chênh lệch, tổng doanh thu, số `giao dịch`.
- Chi tiết ca có tab `Đơn hàng` (lấy từ `Invoice.shiftId`): mã hoá đơn, thời điểm thanh toán, khách/phiên, nhân viên, tổng tiền, trạng thái, phương thức, tóm tắt dòng hàng `PLAY_TIME`/`MEMBERSHIP_FEE`/`PRODUCT`/`SERVICE`. UI gọi là `đơn hàng` nhưng KHÔNG tạo thêm `Order` model.
- Ca đã đóng chỉ xem lịch sử + đối soát — không sửa hoá đơn/thanh toán ca đã đóng.

**Mobile-first inventory screen:**
- `/inventory` là màn `Kho quầy`; page chỉ render `InventoryScreen` (trong `src/features/inventory/`).
- `STAFF` xem/tìm/lọc `Sắp hết`/`Hàng hóa`/`Dịch vụ`; chỉ `ADMIN` tạo hàng hoá/dịch vụ + nhập/điều chỉnh tồn kho.
- `PRODUCT` hiển thị tồn hiện tại, tồn tối thiểu, trạng thái `Hết`/`Sắp hết`/`Đủ`; `SERVICE` hiển thị rõ không quản lý tồn kho.
- `RESTOCK` dương; `ADJUSTMENT` không làm tồn âm. Mọi thay đổi tồn kho qua `POST /api/products/[id]/stock` → `StockMovement` + `ActivityLog`; không sửa trực tiếp `Product.stockQuantity` từ UI.

**Mobile-first membership screen:**
- `/customers` là màn `Hội viên`; page chỉ render `MemberScreen` (trong `src/features/memberships/`).
- Trạng thái hội viên từ server: `ACTIVE` / `EXPIRED` / `NONE`.
- Đăng ký mới dùng `POST /api/memberships/register` (transaction customer + membership + invoice/payment); gia hạn dùng `POST /api/memberships/renew` (yêu cầu `Shift` đang mở vì là giao dịch thu tiền).
- UI không tạo hồ sơ `MEMBER` trống nếu chưa thu phí.

**Mobile-first reports screen:**
- `/reports` là màn `Báo cáo`; page chỉ render `ReportsScreen` (trong `src/features/reports/`).
- `STAFF` xem số liệu của mình/ca mình; `ADMIN` xem toàn hệ thống + export CSV.
- Doanh thu lấy từ `Payment`/`InvoiceItem`, không cộng trực tiếp từ `Session.totalAmount`. Hiển thị ca hiện tại nếu có: tiền đầu ca, tiền mặt thu, dự kiến, số giao dịch, đang chơi, đã checkout.
- Breakdown tách item `PLAY_TIME`/`MEMBERSHIP_FEE`/`PRODUCT`/`SERVICE` và payment `CASH`/`TRANSFER`/`CARD`. Nhãn UI dùng `giao dịch` cho payment count.

**Mobile-first more/settings screen:**
- `/settings` là tab `Thêm`; page chỉ render `MoreScreen` (trong `src/features/more/`).
- Hiển thị tài khoản, trạng thái ca, tiền đầu ca, cảnh báo bảng giá/kho, lối tắt vận hành. `STAFF` thấy lối tắt vận hành + trạng thái hệ thống; `ADMIN` thấy thêm khu vực quản trị: `Bảng giá`, `Khuyến mại`, `Dụng cụ`, `Gói hội viên`, `Nhân viên`, `Thu chi`.
- Theme switching + đăng xuất nằm ở tab này. Màn chỉ đọc trạng thái nhẹ từ API hiện có; không mutate dữ liệu tài chính trực tiếp.

**Mobile-first pricing screen:**
- `/pricing` là màn admin quản trị bảng giá; page chỉ render `PricingScreen` (trong `src/features/pricing/`).
- `STAFF` không sửa bảng giá; `ADMIN` tạo/sửa/xoá quy tắc (ghi `ActivityLog` vì ảnh hưởng doanh thu).
- Validate: `hourTo > hourFrom`, `ratePerHour > 0`, `effectiveTo >= effectiveFrom` nếu có ngày hết hiệu lực.
- `GET /api/pricing/status` trả `activeCount`; POS và tab `Thêm` dùng để cảnh báo khả năng check-in vãng lai. Check-in vãng lai cần rule đang hiệu lực đúng `daysOfWeek`/`dayType`, khung giờ, thời điểm; không fallback giá mặc định.

Ví dụ code UI (Toast, Modal, Skeleton, Badge, StatCard, EmptyState, Loading, ticker): **`docs/ui-patterns.md`**.

## Cách chạy

```bash
npm run dev              # Dev server (localhost:3000)
npm run build            # Production build
npm run start            # Chạy production
npm run lint             # ESLint
npm test                 # Chạy test (vitest)
npm run test:watch       # Chạy test watch mode
npx vitest run path/to/file  # Chạy 1 file test (vd: npx vitest run src/lib/__tests__/pricing.test.ts)
npm run db:push          # Sync schema → database
npm run db:reset         # Sync schema + reset toàn bộ dữ liệu (--force-reset)
npm run seed:admin       # Seed tài khoản admin mặc định
npm run seed:expired     # Seed khách hàng hết hạn để test
npm run check:db         # Kiểm tra kết nối database
npx prisma generate      # Generate Prisma client (tự động chạy qua postinstall)
npx prisma studio        # Prisma Studio (DB GUI)
```

## Testing

- **Test runner**: Vitest với `globals: true`, `environment: 'node'`.
- **Vị trí test**: `src/lib/__tests__/` — test cho business logic (use-cases, pricing engine, validations, helpers). Không tạo thư mục `__tests__` ở root.
- **Path alias**: Vitest config có alias `@` → `./src` giống như Next.js.
- **Không test UI components** ở giai đoạn này — tập trung test business logic và validation.
- **Pattern viết test**: Dùng `describe`/`it` blocks, import trực tiếp function từ `@/lib/...`.
  - Use-case test: fake repository với `vi.fn()` — không cần mock `@/lib/prisma`.
  - Pure function test (pricing engine, validation schemas, membership math): test trực tiếp, không cần mock.
- **Test hiện có:** 15+ test files cho checkout, close-shift, void-invoice, register-member, pricing, promotion, memberships, shifts, validations, utils, api-helpers, result.

```bash
npm test                                          # Chạy tất cả test
npm run test:watch                                # Watch mode
npx vitest run src/lib/__tests__/pricing.test.ts  # Chạy 1 file
```

## Ràng buộc quan trọng

1. **Tiếng Việt**: UI hiển thị tiếng Việt. Tên biến/hàm/file dùng tiếng Anh. Comment nghiệp vụ dùng tiếng Việt.
2. **Mobile-first**: Giao diện nhân viên được tối ưu cho **điện thoại**. Mobile dùng bottom tab navigation (5 tabs) + sticky header. Desktop/tablet dùng sidebar bên trái (có thể collapse). Modals hiển thị dạng bottom sheet trên mobile, centered overlay trên desktop.
3. **Tiền tệ**: VND (Việt Nam Đồng). Format: `1.000.000đ`. Dùng `formatVND()` từ `@/lib/utils`. Lưu trong DB dạng Decimal (không phải Float).
4. **Single-tenant**: Một trường bắn cung, không cần multi-tenant.
5. **Real-time**: Đồng hồ + thành tiền cập nhật mỗi giây qua `setInterval` ticker (không cần WebSocket). Các data khác dùng manual refresh.
6. **Không offline mode**: Yêu cầu kết nối mạng.
7. **Next.js 16**: Dynamic params là `Promise`: `{ params }: { params: Promise<{ id: string }> }`. Route Handlers không cache mặc định.
8. **Light + Dark mode**: Hỗ trợ cả 2 theme. Mặc định theo system preference. Dùng `dark:` prefix trong Tailwind. Test cả 2 theme trước khi commit.
9. **Không tự định nghĩa lại utils/types**: Luôn import `formatVND` từ `@/lib/utils` và types từ `@/types`. Không copy-paste function/interface giữa các file.
10. **Error message tiếng Việt**: Tất cả message hiển thị cho người dùng cuối phải bằng tiếng Việt.

## Domain Knowledge

### Luồng chính của POS

```
Mở ca (nhập tiền mặt đầu ca)
→ Check-in 1 khách duy nhất
    - Vãng lai: tạo session ACTIVE + snapshot bảng giá (rule + tiers)
    - Hội viên: kiểm tra membership còn hạn; hết hạn → gia hạn trước; session tiền giờ = 0đ
→ Trong lúc chơi: đồng hồ realtime (vãng lai), có thể gọi đồ uống/dịch vụ
→ Checkout: tạo invoice (vãng lai: PLAY_TIME + items; hội viên: items, tiền giờ 0đ),
  trừ kho sản phẩm có tồn, thu tiền + ghi payment, đóng session
→ Cuối ca: đối soát theo Shift; vào chi tiết ca xem hoá đơn/đơn hàng phát sinh
```

### Luồng quản lý ca làm

1. Mở ca từ `Ca hôm nay`: lưu `openingCash`, `openedAt`, `staffId` (người mở) + tạo `ShiftParticipant(role=LEAD)`.
2. Đã có ca quầy mở → nhân viên khác bấm `Tham gia ca` (thêm `ShiftParticipant(role=STAFF)`), không nhập lại tiền đầu ca.
3. Mọi nghiệp vụ phát sinh tiền (checkout, bán hàng, đăng ký/gia hạn hội viên) tạo `Invoice` + `Payment` gắn `shiftId` ca đang mở; `staffId` là người thao tác để truy vết trách nhiệm.
4. Đóng ca: tổng hợp payment theo phương thức, tính tiền mặt kỳ vọng, lưu thực đếm/chênh lệch; đánh dấu participants rời ca; ghi `ActivityLog(SHIFT_CLOSE)` kèm người đóng ca. Sau khi đóng chỉ xem lịch sử, trừ khi có flow điều chỉnh admin có audit.

### Check-in flow (2-step modal)

**Step 1 — Chọn loại khách:** Vãng lai: nhập tên → Tiếp tục. Hội viên: tìm theo tên/SĐT → kiểm tra membership còn hạn; hết hạn → hiển thị lựa chọn "Gia hạn hội viên" trước khi check-in.

**Step 1b — Số người chơi (tuỳ chọn, khách vãng lai):** nhập `playerCount` (mặc định 1); nếu > 1 có thể chia thành nhiều nhóm (`SessionPricingGroup`), mỗi nhóm chọn bảng giá riêng — dùng cho nhóm người chơi chung 1 khách, mỗi người/nhóm có bảng giá khác nhau.

**Step 2 — Xác nhận:** hiển thị summary (tên, loại KH, số người chơi, trạng thái hội viên, trạng thái ca làm) → "Xác nhận Check-in" tạo session trong transaction/use-case. Bắt buộc nhân viên đang tham gia ca mở; session phải gắn `shiftId` của ca đó. Không tạo session hội viên nếu membership hết hạn mà chưa gia hạn.

### Cách tính giá (Pricing Engine)

1. **Chỉ khách vãng lai tính tiền giờ**: `PLAY_TIME = elapsedHours × hourlyRate`; nếu rule có `PricingTier`, dùng `calculateTieredSubtotal()` — tính luỹ tiến theo từng phân khúc giờ (mỗi mức `minHours` áp giá riêng).
2. **Hội viên còn hạn không tính tiền giờ**: không dùng `MEMBER_DISCOUNT_PERCENT`; tiền chơi của hội viên là `0đ`.
3. **Hội viên hết hạn**: phải gia hạn trước khi check-in như hội viên. Nếu sản phẩm sau này cho phép chuyển sang vãng lai, cần yêu cầu nghiệp vụ rõ.
4. **Membership fee là doanh thu riêng**: phí tháng được ghi bằng invoice item `MEMBERSHIP_FEE`, không trộn với tiền giờ.
5. **Đồ uống/dịch vụ là invoice item riêng**: `PRODUCT`/`SERVICE`; sản phẩm có tồn kho phải trừ kho qua `StockMovement`.
6. **Checkout tạo invoice**: tổng tiền = tiền chơi vãng lai (đã trừ khuyến mãi) + sản phẩm/dịch vụ + phí hội viên nếu có - phí gửi xe (SURCHARGE).
7. **Thành tiền realtime**: chỉ hiển thị tiền giờ realtime cho khách vãng lai. Với hội viên, hiển thị trạng thái "Hội viên còn hạn" và tiền giờ `0đ`.
8. **Snapshot-first**: lúc check-in snapshot `PricingRule` + `PricingTier` vào `Session.pricingRuleSnapshot`; lúc checkout `calculateSessionPrice()` tính từ snapshot, chỉ fallback resolve lại DB cho session cũ. Khuyến mãi cũng được snapshot (id, tên, loại, giá trị) vào session + metadata dòng PLAY_TIME.
9. **Rule matching**: `PricingRule.daysOfWeek` (ưu tiên) hoặc `dayType` fallback; `hourFrom ≤ giờ < hourTo` (hourTo độc quyền); `effectiveFrom ≤ now ≤ effectiveTo`; tiebreaker `effectiveFrom desc, createdAt desc`. Không có rule phù hợp → chặn check-in vãng lai (không fallback giá mặc định).

### Luồng gia hạn hội viên

1. Chọn hội viên và gói hội viên.
2. Nếu membership còn hạn: `periodStart = current.expiresAt`, `periodEnd = periodStart + durationMonths`.
3. Nếu membership đã hết hạn: `periodStart = paidAt`, `periodEnd = paidAt + durationMonths`.
4. Tạo `MembershipPayment`, tạo kỳ `Membership` mới, tạo `Invoice`/`Payment`, gắn với `Shift` đang mở nếu có.
5. Sau khi gia hạn thành công, cho phép check-in hội viên.

### Database Schema

Models đầy đủ (User, Customer, Session, SessionPricingGroup, PricingRule, PricingTier, PromotionRule, MembershipPlan, Membership, MembershipPayment, Invoice, InvoiceItem, Payment, Shift, ShiftParticipant, Product, StockMovement, Tool, ShiftTool, AppSetting, ActivityLog): **`prisma/schema.prisma`** là nguồn sự thật; mô tả ngắn từng model: **`AGENTS.md` → Target Domain Model**. Chi tiết field trạng thái, snapshot, quan hệ: **`src/generated/prisma`** hoặc schema. Các API nghiệp vụ đã triển khai: **`docs/api-routes.md`**.

### Ràng buộc giữa các Data Model

Một số model phụ thuộc vào sự tồn tại của model khác. Khi thiếu dữ liệu tiên quyết, các chức năng liên quan phải bị chặn hoặc yêu cầu xử lý trước.

| Model | Phụ thuộc vào | Cơ chế |
|-------|--------------|--------|
| **Session** | **Customer** | Mỗi session phải có đúng 1 `customerId`. Không tạo participant list hoặc group session. |
| **Session** | **Shift** | Session/Payment gắn `shiftId` khi nhân viên đang tham gia ca mở. UI và API phải chặn check-in/checkout nếu tài khoản chưa ở trong ca quầy đang mở. |
| **Session (WALK_IN)** | **PricingRule** | Cần có quy tắc giá đang hiệu lực đúng ngày/giờ để tính tiền chơi. Nếu không có rule phù hợp, chặn check-in vãng lai và hiển thị hướng dẫn cập nhật bảng giá. |
| **Session (MEMBER)** | **Membership** | Hội viên phải có membership còn hạn. Nếu hết hạn, yêu cầu gia hạn trước khi tạo session hội viên. |
| **MembershipPayment** | **MembershipPlan + Shift** | Đóng phí phải có gói hội viên hợp lệ; tạo invoice/payment trong transaction và gắn ca nếu đang mở. |
| **Invoice** | **Customer + Shift + optional Session** | Hóa đơn gắn khách và ca làm khi là giao dịch vận hành; `sessionId` nullable cho phí hội viên độc lập. `shiftId` chỉ nên nullable cho dữ liệu cũ hoặc nghiệp vụ phi vận hành có lý do rõ. |
| **Product** | **StockMovement + ActivityLog** | Tạo hàng có tồn đầu kỳ hoặc nhập/chỉnh tồn phải ghi movement/audit. `SERVICE` không có tồn; `PRODUCT` không được âm. |
| **InvoiceItem PRODUCT** | **Product + StockMovement** | Nếu `Product.type = PRODUCT`, bán hàng phải tạo stock movement và không cho tồn âm trừ khi có rule riêng. |
| **Payment** | **Invoice + Shift** | Payment ưu tiên thanh toán cho invoice; `sessionId` chỉ còn là compatibility field cho màn phiên hiện tại. `Payment.shiftId` phải khớp `Invoice.shiftId` trong các giao dịch phát sinh trong ca. |
| **Shift detail** | **Invoice + InvoiceItem + Payment** | Chi tiết ca phải xem được danh sách `đơn hàng` bằng cách truy vấn các invoice thuộc ca, kèm item và payment để đối soát. |
| **Shift close** | **Payment** | Đóng ca phải tổng hợp payment theo phương thức, tính expected cash, actual cash, difference. |

**Nguyên tắc**: Khi thêm model mới có quan hệ phụ thuộc, luôn:
1. Thêm ràng buộc trong API (kiểm tra tồn tại trước khi cho phép hành động)
2. Thêm cảnh báo trong UI (disable nút + hiển thị message hướng dẫn)
3. Ghi nhận vào bảng này
4. Ghi `ActivityLog` cho hành động tài chính hoặc hành động thay đổi dữ liệu nhạy cảm

### 14. Architecture: Port/Adapter + Domain Modules

**Dependency rule:** `shared/` ← `infrastructure/` ← `domain/` ← `app/` + `features/`

- Domain KHÔNG import `prisma` trực tiếp — chỉ qua ports
- Domain được `import type` từ ports của domain khác, không được import adapter/use-case của domain khác
- Mỗi domain có `index.ts` barrel export; code ngoài domain chỉ import từ barrel

**Port pattern:**
- Mỗi domain có `ports.ts` định nghĩa repository interface
- Adapter trong `src/lib/infrastructure/adapters/` (10 file) implement port bằng Prisma
- Store types (`Pick<Prisma.TransactionClient, ...>`) trong `src/lib/infrastructure/store-types.ts`
- Adapter factory nhận store, hoạt động với cả `prisma` (singleton) và `tx` (transaction client)

**Result type (`src/lib/shared/result.ts`):** — xem chi tiết tại §10b

**Module domains:**

| Module | Phụ trách |
|--------|-----------|
| `src/lib/shared/` | Cross-cutting: auth, utils, constants, Result type, CSRF, rate-limit |
| `src/lib/infrastructure/` | Prisma client, DB retry, adapters (10), API helpers, composition root, `runInTransaction` |
| `src/lib/sessions/` | Session, SessionPricingGroup, checkout, pricing-engine (pure function) |
| `src/lib/invoicing/` | Invoice, InvoiceItem, Payment, edit-invoice, void-invoice |
| `src/lib/memberships/` | Customer, Membership, MembershipPlan, MembershipPayment, register/renew |
| `src/lib/shifts/` | Shift, ShiftParticipant, open-or-join, close-shift |
| `src/lib/inventory/` | Product, StockMovement |
| `src/lib/pricing/` | PricingRule queries (read-side) |
| `src/lib/promotions/` | PromotionRule queries (read-side) |
| `src/lib/cashflow/` | CashFlow records (admin-only thu/chi ngoài vận hành) |
| `src/lib/audit/` | ActivityLog |
| `src/lib/settings/` | AppSetting key-value (có cache TTL 60s) |

**Import Prisma:**
- `import { prisma }` CHỈ được dùng trong 3 file: `infrastructure/prisma.ts`, `infrastructure/repositories.ts`, `infrastructure/db-helpers.ts`
- Tất cả code khác dùng ports hoặc `repositories` singleton
- `src/lib/prisma.ts` là migration shim re-export — sẽ xoá khi tất cả consumers chuyển sang repositories

**Thêm use-case mới:**
1. Xác định domain → tạo file trong `src/lib/<domain>/use-cases/`
2. Định nghĩa Input + Result interface, export `mapXxxError()`
3. Port: nếu cần model Prisma mới, thêm method vào `ports.ts`
4. Dùng `ok()` / `err()` / `fail()` — không throw error string
5. Export qua `index.ts` barrel
6. Route handler: validate → `resultToResponse(result, mapXxxError)`
7. Test: fake repository object với `vi.fn()` — không cần mock `@/lib/prisma`
