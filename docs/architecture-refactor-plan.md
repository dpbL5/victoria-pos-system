# Kế hoạch Refactor Kiến trúc — QLTruongCung POS

> **Status:** ✅ ĐÃ HOÀN THÀNH (2026-08) — migration port/adapter + domain modules đã thực hiện xong. Tài liệu này giữ lại làm lịch sử thiết kế + tham chiếu pattern (`Result<T>`, `runInTransaction`, `fail()`, barrel, adapter). Kiến trúc hiện tại mô tả trong `CLAUDE.md` §10b + §14 và `docs/directory-structure.md`.
> **Ngày (gốc):** 2026-08-07
> **Mục tiêu (gốc):** Tạo kiến trúc dễ test, dễ mở rộng, dễ điều hướng — giữ nguyên API contract với UI, không thay đổi business logic, làm từng bước một.

---

## Mục lục

1. [Đánh giá hiện trạng](#1-đánh-giá-hiện-trạng)
2. [Kiến trúc mục tiêu](#2-kiến-trúc-mục-tiêu)
3. [Nguyên tắc thiết kế](#3-nguyên-tắc-thiết-kế)
4. [Core Components](#4-core-components)
5. [Lộ trình Migration](#5-lộ-trình-migration)
6. [Cập nhật Rules](#6-cập-nhật-rules)
7. [Risk Mitigation](#7-risk-mitigation)
8. [Verification](#8-verification)

---

## 1. Đánh giá hiện trạng

### 1.1 Số liệu

| Chỉ số | Giá trị |
|--------|---------|
| Tổng dòng code | ~75,000 dòng |
| Số file nguồn | 194 file (.ts/.tsx) |
| Prisma models | 21 models, 523 dòng schema |
| API routes | 44 route handlers / 14 resource domains |
| Use-cases | 9 use-cases, ~2,670 dòng |
| Tests | ~2,040 dòng (vitest), thuần business logic |
| Stack | Next.js 16, React 19, Prisma 7, PostgreSQL, Tailwind v4, Zod 4, jose |

### 1.2 Điểm mạnh

- **6 ADR được ghi nhận** — modular monolith, invoice-first, snapshot pricing, void stock reversal, in-place edit, POS component splitting
- **Pattern "thin route → use-case"** đã định hình — route handler chỉ validate + authorize + delegate
- **Quy ước code mạnh** — import order, `formatVND`, Zod validation, toast feedback, mobile-first, Server Components mặc định
- **Helper đã có port pattern thô sơ** — `findOpenShiftForStaff(db, staffId)`, `findActiveMembership(db, customerId)`, `logActivity(db, input)` nhận `Pick<Prisma.TransactionClient, '...'>` — đây là nền tảng để formalize

### 1.3 Vấn đề cần giải quyết

#### 🔴 Vấn đề 1: Use-case khóa cứng vào Prisma

Tất cả 9 use-case đều import `prisma` trực tiếp:

```ts
// src/lib/business/use-cases/checkOut.ts
import { prisma } from '@/lib/prisma'

export async function checkOut(input: CheckoutInput): Promise<CheckoutResult> {
  const session = await prisma.session.findUnique({ ... })  // ← khóa cứng
  await prisma.$transaction(async (tx) => { ... })           // ← khóa cứng
}
```

**Hệ quả:**
- Không thể unit test use-case nếu không có database thật
- Logic nghiệp vụ và truy vấn bị trộn lẫn
- ADR-001 đã nhận ra: *"Thiếu interface port cho Prisma → khó mock DB trong test"*

#### 🔴 Vấn đề 2: `src/lib/` phẳng và đang phình to

```
src/lib/
├── api.ts / api-client.ts    # HTTP client (2 versions)
├── auth.ts / csrf.ts         # Auth infrastructure
├── pricing.ts                # Domain logic
├── promotion-calculation.ts  # Domain logic
├── rate-limit.ts             # Infrastructure
├── db-retry.ts               # Infrastructure
├── utils.ts / constants.ts   # Shared
├── business/                 # Mix of helpers + use-cases
│   ├── audit.ts              # Infrastructure
│   ├── shifts.ts             # Query service (300 dòng)
│   ├── invoices.ts           # Domain helper (13 dòng)
│   └── use-cases/            # 9 use-cases
├── validations/              # 10 Zod schema files
└── __tests__/                # 10 test files
```

Domain logic nằm cạnh infrastructure, không có ranh giới module.

#### 🟠 Vấn đề 3: Không có bounded context

21 Prisma models thuộc ít nhất 6 domain nhưng code không phản ánh ranh giới này. Một thay đổi pricing phải chạm 5-6 file rải rác khắp nơi.

#### 🟠 Vấn đề 4: Error handling không type-safe

```ts
// Use-case throws error code string — convention, không type-safe
throw new Error('SESSION_NOT_FOUND')
throw new Error('INSUFFICIENT_STOCK:' + productName)  // dynamic code
throw new Error('SHIFT_OPEN_FAILED: ' + error.message) // leak Prisma message

// Route handler phải biết convention này
const mapped = mapCheckoutError(error as Error)
```

- ~40 error codes khác nhau, 2 code dynamic
- `voidInvoice` không có `mapXxxError()` — route handler map thủ công
- Route handler vừa catch `UNAUTHORIZED`/`FORBIDDEN`/`CSRF_MISMATCH` (từ auth layer) vừa catch error code (từ use-case) — 2 cơ chế khác nhau trong 1 catch block

#### 🟡 Vấn đề 5: Feature screens không đồng đều

| Screen | Dòng | Trạng thái |
|--------|------|------------|
| `today-shift-screen.tsx` | 409 | ✅ Đã tách 15 sub-components |
| `reports-screen.tsx` | 87 | ✅ Mỏng, delegate tốt |
| `more-screen.tsx` | 539 | 🟠 Monolithic |
| `member-screen.tsx` | 799 | 🔴 Monolithic |
| `inventory-screen.tsx` | 812 | 🔴 Monolithic |

#### 🟢 Vấn đề 6: Không có shared API response type

Pattern `{ success: true/false, data/error }` được document nhưng không có type hỗ trợ — mỗi route tự construct.

#### 🟢 Vấn đề 7: `docs/refactor-plan.md` cũ theo layer-based approach

Có một refactor plan cũ mô tả cách tổ chức theo layer (`model/` + `repository/` + `adapter/` + `service/` dưới `src/server/modules/`). Thư mục `src/server/` tồn tại nhưng rỗng — effort đó đã bị abandon. Plan này thay thế hoàn toàn plan cũ.

---

## 2. Kiến trúc mục tiêu

### 2.1 Directory Structure

```
src/lib/
├── shared/                          # Cross-cutting — KHÔNG import từ domain
│   ├── index.ts                     # Barrel export
│   ├── utils.ts                     # formatVND, calcHours, getDayType, ...
│   ├── constants.ts                 # CSRF_COOKIE, CSRF_HEADER, ...
│   ├── auth.ts                      # JWT, requireAuth, requireMutationAuth
│   ├── csrf.ts                      # CSRF double-submit cookie
│   └── rate-limit.ts                # In-memory rate limiter
│
├── infrastructure/                  # Technical concerns — KHÔNG chứa business logic
│   ├── prisma.ts                    # Prisma client singleton
│   ├── db-retry.ts                  # Exponential backoff cho transient DB errors
│   ├── api-helpers.ts               # successResponse(), errorResponse(), resultToResponse()
│   └── adapters/                    # Prisma implementations của ports
│       ├── session-adapter.ts
│       ├── invoice-adapter.ts
│       ├── shift-adapter.ts
│       ├── customer-adapter.ts
│       ├── membership-adapter.ts
│       ├── product-adapter.ts
│       ├── pricing-adapter.ts
│       └── audit-adapter.ts
│
├── sessions/                        # Domain: Session + Pricing + Promotion
│   ├── index.ts                     # Public API barrel
│   ├── ports.ts                     # Repository interfaces
│   ├── use-cases/
│   │   ├── check-in.ts
│   │   ├── check-out.ts
│   │   └── sell-items.ts
│   ├── pricing-engine.ts            # calculateSessionPrice, calculateTieredSubtotal
│   ├── promotion-calculation.ts     # calculatePromotionDiscount, toPromotionSnapshot
│   └── validations.ts               # Zod schemas
│
├── invoicing/                       # Domain: Invoice + InvoiceItem + Payment
│   ├── index.ts
│   ├── ports.ts
│   ├── use-cases/
│   │   ├── void-invoice.ts
│   │   └── edit-invoice.ts
│   ├── helpers.ts                   # generateInvoiceNo
│   └── validations.ts
│
├── memberships/                     # Domain: Customer + Membership + MembershipPlan
│   ├── index.ts
│   ├── ports.ts
│   ├── use-cases/
│   │   ├── register-member.ts
│   │   └── renew-membership.ts
│   ├── helpers.ts                   # findActiveMembership, calculateRenewalPeriod, addMonthsKeepingDay
│   └── validations.ts
│
├── shifts/                          # Domain: Shift + ShiftParticipant + ShiftTool
│   ├── index.ts
│   ├── ports.ts
│   ├── use-cases/
│   │   ├── open-or-join.ts
│   │   └── close-shift.ts
│   ├── helpers.ts                   # findOpenShiftForStaff, getShiftTransactions, calculateExpectedCash
│   └── validations.ts
│
├── inventory/                       # Domain: Product + StockMovement
│   ├── index.ts
│   ├── ports.ts
│   ├── helpers.ts
│   └── validations.ts
│
├── pricing/                         # Domain: PricingRule + PricingTier (read-side)
│   ├── index.ts
│   ├── ports.ts
│   ├── helpers.ts                   # findApplicablePricingRule
│   └── validations.ts
│
├── promotions/                      # Domain: PromotionRule (read-side)
│   ├── index.ts
│   ├── ports.ts
│   ├── helpers.ts                   # findAvailablePromotions, toPromotionSnapshot
│   └── validations.ts
│
└── audit/                           # Domain: ActivityLog
    ├── index.ts
    ├── ports.ts
    └── helpers.ts                   # logActivity
```

### 2.2 Dependency Rule

```
shared/  ←  infrastructure/  ←  domain/  ←  app/ + features/
```

- `shared/` — không import từ bất kỳ module nào khác trong `lib/`
- `infrastructure/` — chỉ import từ `shared/`
- `domain/` — chỉ import từ `shared/` và type-only từ domain khác qua `ports.ts`
- `app/` + `features/` — import từ domain barrel exports + `shared/`

**Cross-domain rule:** Một domain module được `import type { ... } from '<other-domain>/ports'` nhưng **không bao giờ** import adapter hoặc use-case của domain khác. Use-case nhận cross-domain capabilities qua `Repositories` bundle / `deps` parameter.

---

## 3. Nguyên tắc thiết kế

### 3.1 Port Pattern — kế thừa từ code hiện tại

Các helper hiện tại đã dùng pattern `Pick<Prisma.TransactionClient, '...'>`:

```ts
// src/lib/business/shifts.ts — ĐÃ CÓ
type ShiftLookupStore = Pick<Prisma.TransactionClient, 'shift'>
export async function findOpenShiftForStaff(db: ShiftLookupStore, staffId: string) { ... }

// src/lib/business/memberships.ts — ĐÃ CÓ
type MembershipStore = Pick<Prisma.TransactionClient, 'membership'>
export async function findActiveMembership(db: MembershipStore, customerId: string, at: Date) { ... }

// src/lib/business/audit.ts — ĐÃ CÓ
type AuditStore = Pick<Prisma.TransactionClient, 'activityLog'>
export async function logActivity(db: AuditStore, input: LogActivityInput) { ... }
```

**Ta formalize pattern này thành port interface.** Store types định nghĩa tập hợp Prisma model delegates mà adapter cần. Vì `Pick<Prisma.TransactionClient, ...>` là structural type, cả `prisma` (singleton) và `tx` (transaction client) đều thỏa mãn — adapter tự động hoạt động với cả hai.

### 3.2 Result Type — thay thế throw Error("CODE")

```ts
// src/lib/shared/result.ts
export interface DomainError {
  code: string            // UPPER_SNAKE_CASE (giữ nguyên hiện tại)
  detail?: string         // dynamic payload (thay cho hậu tố string)
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainError }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = (code: string, detail?: string): Result<never> => ({ ok: false, error: { code, detail } })
```

**Tại sao cần `fail()` riêng cho transaction:** Throw error trong `$transaction` callback → Prisma rollback. Nếu dùng `return err()` trong callback, **Prisma sẽ COMMIT** các thay đổi trước đó. `fail()` ném một `RollbackSignal` để trigger rollback nhưng mang `DomainError` typed thay vì string:

```ts
// src/lib/infrastructure/db-helpers.ts
class RollbackSignal { constructor(readonly error: DomainError) {} }

export function fail(code: string, detail?: string): never {
  throw new RollbackSignal({ code, detail })
}

export async function runInTransaction<T>(
  work: (repos: Repositories) => Promise<T>
): Promise<Result<T>> {
  try {
    const value = await prisma.$transaction(async (tx) => {
      return work(createRepositories(tx))
    })
    return ok(value)
  } catch (error) {
    if (error instanceof RollbackSignal) return err(error.error.code, error.error.detail)
    throw error // Lỗi thật (DB, bug) vẫn throw → route catch → 500
  }
}
```

**Quy tắc:**
- Validation trước transaction → `return err(code)`
- Validation trong transaction (TOCTOU check, stock guard) → `fail(code, detail)` — trigger rollback
- KHÔNG dùng `throw new Error('CODE')` trong use-case — reserved cho programmer errors

### 3.3 Barrel Exports

Mỗi domain module có `index.ts` export public API:

```ts
// src/lib/sessions/index.ts
export { checkIn } from './use-cases/check-in'
export { checkOut } from './use-cases/check-out'
export { sellItems } from './use-cases/sell-items'
export type { CheckInInput, CheckInResult, CheckoutInput, CheckoutResult } from './use-cases/...'
export { mapCheckInError, mapCheckoutError, mapSellItemsError } from './use-cases/...'
```

Code bên ngoài domain chỉ import từ barrel:

```ts
// ✅ ĐÚNG
import { checkOut, mapCheckoutError } from '@/lib/sessions'

// ❌ SAI — import internal path
import { checkOut } from '@/lib/sessions/use-cases/check-out'
```

### 3.4 Migration Shims

Khi move file, giữ re-export ở vị trí cũ:

```ts
// src/lib/business/use-cases/checkOut.ts (sau khi migrate)
export { checkOut, mapCheckoutError } from '@/lib/sessions'
export type { CheckoutInput, CheckoutResult } from '@/lib/sessions'
```

Tất cả import hiện tại vẫn hoạt động. Xóa shim khi domain đã migrate xong.

---

## 4. Core Components

### 4.1 result.ts

```ts
// src/lib/shared/result.ts
export interface DomainError {
  /** Mã lỗi UPPER_SNAKE_CASE — giữ nguyên convention hiện tại */
  code: string
  /** Chi tiết động — thay cho hậu tố string như INSUFFICIENT_STOCK:name */
  detail?: string
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainError }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = (code: string, detail?: string): Result<never> => ({ ok: false, error: { code, detail } })
export const isOk = <T>(r: Result<T>): r is { ok: true; value: T } => r.ok
export const isErr = <T>(r: Result<T>): r is { ok: false; error: DomainError } => !r.ok

/** Bridge cho code chưa migrate: Result → throw Error(code) */
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value
  throw new Error(r.error.code)
}
```

### 4.2 api-helpers.ts

```ts
// src/lib/infrastructure/api-helpers.ts
import { NextResponse } from 'next/server'
import type { DomainError, Result } from '@/lib/shared/result'

export interface HttpErrorInfo {
  code: string
  message: string
  status: number
}

export function apiError(error: HttpErrorInfo): NextResponse {
  return NextResponse.json(
    { success: false, code: error.code, error: error.message },
    { status: error.status }
  )
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status })
}

export function resultToResponse<T>(
  result: Result<T>,
  mapper: (error: DomainError) => HttpErrorInfo,
  okStatus = 200
): NextResponse {
  if (result.ok) return apiSuccess(result.value, okStatus)
  return apiError(mapper(result.error))
}

// Auth error constants
export const ERR_UNAUTHORIZED = { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập', status: 401 } as const
export const ERR_FORBIDDEN = { code: 'FORBIDDEN', message: 'Không có quyền', status: 403 } as const
export const ERR_CSRF = { code: 'CSRF_MISMATCH', message: 'Yêu cầu không hợp lệ (CSRF)', status: 403 } as const
```

### 4.3 Store Types

```ts
// src/lib/infrastructure/store-types.ts
import type { Prisma } from '@/generated/prisma/client'

// Structural types — cả PrismaClient lẫn TransactionClient đều thỏa mãn
export type ShiftStore = Pick<Prisma.TransactionClient, 'shift' | 'shiftParticipant' | 'shiftTool'>
export type PaymentStore = Pick<Prisma.TransactionClient, 'payment' | 'membershipPayment'>
export type MembershipStore = Pick<Prisma.TransactionClient, 'membership' | 'membershipPlan'>
export type CustomerStore = Pick<Prisma.TransactionClient, 'customer'>
export type BillingStore = Pick<Prisma.TransactionClient, 'invoice' | 'invoiceItem' | 'payment' | 'membershipPayment' | 'stockMovement'>
export type SessionStore = Pick<Prisma.TransactionClient, 'session' | 'sessionPricingGroup'>
export type ProductStore = Pick<Prisma.TransactionClient, 'product' | 'stockMovement'>
export type PricingStore = Pick<Prisma.TransactionClient, 'pricingRule' | 'pricingTier'>
export type PromotionStore = Pick<Prisma.TransactionClient, 'promotionRule'>
export type SettingsStore = Pick<Prisma.TransactionClient, 'appSetting'>
export type AuditStore = Pick<Prisma.TransactionClient, 'activityLog'>
```

### 4.4 Port Interface (ví dụ: memberships domain)

```ts
// src/lib/memberships/ports.ts
import type { Prisma } from '@/generated/prisma/client'
import type { PaymentMethod } from '@/types'

export type MembershipWithPlan = Prisma.MembershipGetPayload<{ include: { plan: true } }>
export type PlanRecord = Pick<Prisma.MembershipPlanGetPayload<object>, 'id' | 'name' | 'price' | 'durationMonths' | 'isActive'>

export interface MembershipRepository {
  findLatest(customerId: string): Promise<MembershipWithPlan | null>
  findActive(customerId: string, at: Date): Promise<MembershipWithPlan | null>
  create(data: { customerId: string; planId: string; startsAt: Date; expiresAt: Date }): Promise<MembershipWithPlan>
}

export interface MembershipPlanRepository {
  findById(id: string): Promise<PlanRecord | null>
}

export interface CustomerRepository {
  findById(id: string): Promise<Prisma.CustomerGetPayload<object> | null>
  create(data: { fullName: string; phone: string | null; type: 'MEMBER' }): Promise<Prisma.CustomerGetPayload<object>>
  addSpend(customerId: string, amount: number): Promise<void>
}
```

### 4.5 Adapter (ví dụ: memberships domain)

```ts
// src/lib/infrastructure/adapters/membership-adapter.ts
import type { MembershipStore, CustomerStore, MembershipPlanStore } from '../store-types'
import { findLatestMembership, findActiveMembership } from '@/lib/memberships/helpers'
import type { MembershipRepository, MembershipPlanRepository } from '@/lib/memberships/ports'

export function createMembershipRepository(store: MembershipStore): MembershipRepository {
  return {
    findLatest: (customerId) => findLatestMembership(store, customerId),
    findActive: (customerId, at) => findActiveMembership(store, customerId, at),
    async create(data) {
      return store.membership.create({ data, include: { plan: true } })
    },
  }
}

export function createMembershipPlanRepository(store: MembershipPlanStore): MembershipPlanRepository {
  return {
    async findById(id) {
      const plan = await store.membershipPlan.findUnique({ where: { id } })
      if (!plan) return null
      return plan
    },
  }
}
```

### 4.6 Composition Root

```ts
// src/lib/infrastructure/repositories.ts
import { prisma } from './prisma'
import type { Prisma } from '@/generated/prisma/client'
// ... import tất cả adapter factories

export interface Repositories {
  membership: MembershipRepository
  membershipPlan: MembershipPlanRepository
  customer: CustomerRepository
  billing: BillingRepository
  shift: ShiftRepository
  audit: AuditRepository
  // ... bổ sung theo từng iteration
}

export function createRepositories(store: Prisma.TransactionClient): Repositories {
  return {
    membership: createMembershipRepository(store),
    membershipPlan: createMembershipPlanRepository(store),
    customer: createCustomerRepository(store),
    billing: createBillingRepository(store),
    shift: createShiftRepository(store),
    audit: createAuditRepository(store),
  }
}

/** Singleton cho standalone reads (route handlers không cần transaction) */
export const repositories: Repositories = createRepositories(prisma)
```

### 4.7 Route Handler Before/After

**Trước (hiện tại):**

```ts
// src/app/api/sessions/[id]/checkout/route.ts
import { checkOut, mapCheckoutError } from '@/lib/business/use-cases/checkOut'

export async function POST(request, { params }) {
  try {
    const auth = await requireMutationAuth(request)
    const parsed = checkoutSessionSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 })

    const result = await checkOut({ sessionId: id, staffId: auth.userId, ... })
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    if (message === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    if (message === 'CSRF_MISMATCH') return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    const mapped = mapCheckoutError(error as Error)
    return NextResponse.json({ success: false, code: mapped.code, error: mapped.message }, { status: mapped.status })
  }
}
```

**Sau (target):**

```ts
// src/app/api/sessions/[id]/checkout/route.ts
import { checkOut, mapCheckoutError } from '@/lib/sessions'
import { repositories } from '@/lib/infrastructure/repositories'
import { resultToResponse, apiError, ERR_UNAUTHORIZED, ERR_CSRF } from '@/lib/infrastructure/api-helpers'

export async function POST(request, { params }) {
  try {
    const auth = await requireMutationAuth(request)
    const parsed = checkoutSessionSchema.safeParse(body)
    if (!parsed.success) return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 })

    const result = await checkOut({ sessionId: id, staffId: auth.userId, ... }, repositories)
    return resultToResponse(result, mapCheckoutError)
  } catch (error) {
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    console.error('POST /api/sessions/[id]/checkout error:', error)
    return apiError({ code: 'SERVER_ERROR', message: 'Lỗi máy chủ', status: 500 })
  }
}
```

### 4.8 Use-case After Migration (ví dụ: registerMember)

```ts
// src/lib/memberships/use-cases/register-member.ts
import { ok, err } from '@/lib/shared/result'
import type { Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import { calculateRenewalPeriod, generateInvoiceNo } from '../helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'

export async function registerMember(
  input: RegisterMemberInput,
  deps: Repositories = repositories   // default = composition root → route handler không cần truyền
): Promise<Result<RegisterMemberResult>> {
  // Validation trước transaction → return err
  const plan = await deps.membershipPlan.findById(input.planId)
  if (!plan || !plan.isActive) return err('PLAN_NOT_FOUND')

  const openShift = await deps.shift.findOpenForStaff(input.staffId)
  if (!openShift) return err('SHIFT_REQUIRED')

  const { startsAt, expiresAt } = calculateRenewalPeriod(null, plan.durationMonths, input.paidAt)

  // Transaction với rollback semantics
  const result = await runInTransaction(async (tx) => {
    // Validation trong transaction → fail (trigger rollback)
    const existing = await tx.membership.findActive(input.customerId, new Date())
    if (existing) fail('MEMBERSHIP_ALREADY_ACTIVE')

    const customer = await tx.customer.create({ fullName, phone, type: 'MEMBER' })
    const membership = await tx.membership.create({ customerId: customer.id, planId: plan.id, startsAt, expiresAt })
    const invoice = await tx.billing.createInvoice({ ... })
    const payment = await tx.billing.createPayment({ ... })
    await tx.billing.createMembershipPayment({ ... })
    await tx.customer.addSpend(customer.id, Number(plan.price))
    await tx.audit.append({ userId: input.staffId, action: 'MEMBERSHIP_REGISTER', ... })

    return { customer, membership, invoiceId: invoice.id, paymentId: payment.id }
  })

  if (!result.ok) return result
  return ok({ customer: result.value.customer, membership: result.value.membership, ... })
}
```

---

## 5. Lộ trình Migration

### Nguyên tắc chung

- **Mỗi iteration là 1 PR độc lập** — có thể merge, deploy, test riêng
- **API contract giữ nguyên** — response shape, status code, error message không đổi
- **Barrel shims** — import cũ vẫn hoạt động trong giai đoạn chuyển tiếp
- **Gate per PR:** `npm run lint && npx vitest run && npm run build`

### Iteration 0 — Foundation (1-2 ngày)

**Mục tiêu:** Tạo infrastructure files, chưa có gì import chúng.

**Files tạo mới (không sửa file cũ):**
- `src/lib/shared/result.ts`
- `src/lib/infrastructure/api-helpers.ts`
- `src/lib/infrastructure/store-types.ts`
- `src/lib/infrastructure/db-helpers.ts` (`runInTransaction`, `fail`, `RollbackSignal`)
- `src/lib/infrastructure/repositories.ts` (bundle builder + singleton)

**Tests:** Unit test cho `result.ts`, `api-helpers.ts`.

**Verify:** `npm run build` vẫn pass (chưa có ai import file mới).

### Iteration 1 — Pilot: VoidInvoice (1 ngày)

**Mục tiêu:** POC toàn bộ pattern với use-case đơn giản nhất.

**Tại sao voidInvoice:**
- 170 dòng, ít error codes nhất
- Là use-case duy nhất chưa có `mapXxxError()` — route handler map thủ công
- Không có output phức tạp, không phụ thuộc pricing/promotion
- Chứng minh được pattern mà không rủi ro

**Files tạo:**
- `src/lib/invoicing/index.ts`
- `src/lib/invoicing/ports.ts`
- `src/lib/invoicing/helpers.ts` (move `generateInvoiceNo`)
- `src/lib/invoicing/use-cases/void-invoice.ts` (refactor)
- `src/lib/infrastructure/adapters/invoice-adapter.ts`

**Files sửa:**
- `src/app/api/invoices/[id]/void/route.ts` — dùng `apiError`, `resultToResponse`
- `src/lib/business/use-cases/voidInvoice.ts` → re-export shim

### Iteration 2 — Memberships Domain (1-2 ngày)

**Mục tiêu:** Migrate domain đầu tiên có transaction cross-aggregate. Đây là pattern cho tất cả domain sau.

**Files tạo:**
- `src/lib/memberships/index.ts`
- `src/lib/memberships/ports.ts`
- `src/lib/memberships/helpers.ts` (move `findActiveMembership`, `calculateRenewalPeriod`, `addMonthsKeepingDay`)
- `src/lib/memberships/validations.ts` (move từ `validations/membership.ts`)
- `src/lib/memberships/use-cases/register-member.ts`
- `src/lib/memberships/use-cases/renew-membership.ts`
- `src/lib/infrastructure/adapters/membership-adapter.ts`
- `src/lib/audit/ports.ts` + `src/lib/infrastructure/adapters/audit-adapter.ts` (minimal — chỉ `append` method)

**Files sửa:**
- `src/app/api/memberships/register/route.ts`
- `src/app/api/memberships/renew/route.ts`
- `src/lib/business/memberships.ts` → re-export shim
- `src/lib/business/use-cases/registerMember.ts` → re-export shim
- `src/lib/business/use-cases/renewMembership.ts` → re-export shim

**Tests:** Unit test cho `registerMember` với fake repos (mock `vi.fn()` objects).

### Iteration 3 — Shifts Domain (1-2 ngày)

**Files tạo/move:**
- `src/lib/shifts/` — ports, helpers, validations, use-cases
- `src/lib/infrastructure/adapters/shift-adapter.ts`

**Điểm cần chú ý:**
- `getShiftTransactions` (300 dòng aggregation) — giữ nguyên logic, wrap trong adapter
- `calculateExpectedCash` dùng `throw new Error('SHIFT_NOT_FOUND')` — chuyển sang `fail`/`err`

### Iteration 4 — Pricing + Promotions + Settings (read-side) (1 ngày)

**Mục tiêu:** Tạo port cho các domain read-only trước khi migrate sessions (vì checkIn/checkOut phụ thuộc vào chúng).

**Files tạo:**
- `src/lib/pricing/` — ports, helpers, validations
- `src/lib/promotions/` — ports, helpers, validations
- `src/lib/settings/` — ports, helpers (cache ở adapter singleton level)

**Quan trọng:** Cache 60s TTL trong `settings.ts` phải nằm ở composition root (wrapper quanh `SettingsRepository`), không phải trong per-`tx` adapter.

### Iteration 5 — Sessions Domain (2-3 ngày)

**Mục tiêu:** Migrate domain phức tạp nhất (checkOut 650 dòng).

**Chiến lược:** Extract helper functions từ `checkOut` trước khi migrate — tách logic nghiệp vụ thành pure functions riêng, rồi migrate use-case với ports đã có sẵn từ các iteration trước.

**Files tạo:**
- `src/lib/sessions/` — ports, helpers, use-cases (checkIn, checkOut, sellItems)
- `src/lib/infrastructure/adapters/session-adapter.ts`

**Win lớn nhất:** `checkOut` trở nên testable — hiện tại không thể test.

### Iteration 6 — Invoicing Write-side (1 ngày)

**Files tạo:**
- `src/lib/invoicing/use-cases/edit-invoice.ts` (đã có voidInvoice từ Iteration 1)

### Iteration 7 — Read-only Routes + Cleanup (2-3 ngày)

33 route handlers read-only chuyển từ `import { prisma }` sang `import { repositories }`. Cơ học, từng domain một.

**Cleanup:**
- Xóa tất cả barrel shims
- Archive `docs/refactor-plan.md` cũ (layer-based plan đã abandon)
- Update `docs/directory-structure.md`, `docs/code-conventions.md`

### Tổng thời gian ước tính: 10-15 ngày làm việc

| Iteration | Nội dung | Thời gian |
|-----------|----------|-----------|
| 0 | Foundation | 1-2 ngày |
| 1 | Pilot: VoidInvoice | 1 ngày |
| 2 | Memberships domain | 1-2 ngày |
| 3 | Shifts domain | 1-2 ngày |
| 4 | Pricing + Promotions + Settings | 1 ngày |
| 5 | Sessions domain | 2-3 ngày |
| 6 | Invoicing write-side | 1 ngày |
| 7 | Read-only routes + cleanup | 2-3 ngày |

---

## 6. Cập nhật Rules

### 6.1 Thêm vào CLAUDE.md (sau §13 Error Handling)

```markdown
### 14. Architecture: Port/Adapter + Domain Modules

**Cấu trúc module:** `src/lib/<domain>/` — mỗi domain đóng gói ports, use-cases, validations, helpers.

| Module | Phụ trách |
|--------|-----------|
| `src/lib/shared/` | Cross-cutting: auth, utils, constants, Result type |
| `src/lib/infrastructure/` | Prisma client, DB retry, adapters, API helpers, composition root |
| `src/lib/sessions/` | Session, PricingRule, PricingTier, PromotionRule |
| `src/lib/invoicing/` | Invoice, InvoiceItem, Payment |
| `src/lib/memberships/` | Customer, Membership, MembershipPlan, MembershipPayment |
| `src/lib/shifts/` | Shift, ShiftParticipant, ShiftTool |
| `src/lib/inventory/` | Product, StockMovement |
| `src/lib/pricing/` | PricingRule queries (read-side) |
| `src/lib/promotions/` | PromotionRule queries (read-side) |
| `src/lib/audit/` | ActivityLog |

**Dependency rule:**
- `shared/` ← `infrastructure/` ← `domain/` ← `app/` + `features/`
- Domain KHÔNG import `prisma` trực tiếp — chỉ qua ports
- Domain được `import type` từ ports của domain khác, không được import adapter/use-case
- Mỗi domain có `index.ts` barrel export; code ngoài domain chỉ import từ barrel

**Port pattern:**
- Mỗi domain có `ports.ts` định nghĩa repository interface
- Adapter trong `src/lib/infrastructure/adapters/` implement port bằng Prisma
- Store types (`Pick<Prisma.TransactionClient, ...>`) trong `src/lib/infrastructure/store-types.ts`
- Adapter factory nhận store, hoạt động với cả `prisma` và `tx`

**Result type:**
- Use-case return `Result<T>` (`{ ok: true, value }` | `{ ok: false, error }`)
- Validation trước transaction → `return err(code)`
- Validation trong transaction → `fail(code, detail)` (trigger rollback)
- Route handler dùng `resultToResponse(result, mapXxxError)` hoặc `apiError()` / `apiSuccess()`
- Mỗi use-case export `mapXxxError(error: DomainError): HttpErrorInfo`

**Thêm use-case mới:**
1. Xác định domain → tạo file trong `src/lib/<domain>/use-cases/`
2. Định nghĩa Input/Result interface
3. Port: nếu cần model Prisma mới, thêm vào `ports.ts`
4. Return `Result<T>` — dùng `ok()` / `err()` / `fail()`
5. Export qua `index.ts` barrel
6. Route handler: validate → gọi use-case với `repositories` → `resultToResponse()`

**Import Prisma:**
- `import { prisma }` CHỈ được dùng trong:
  - `src/lib/infrastructure/prisma.ts` (singleton)
  - `src/lib/infrastructure/repositories.ts` (composition root)
  - `src/lib/infrastructure/db-helpers.ts` (`runInTransaction`)
- Tất cả code khác dùng ports hoặc `repositories` singleton
```

### 6.2 Thêm vào AGENTS.md (sau Architecture Guidance)

```markdown
## Architecture Constraints (Port/Adapter)

- Business logic must live in `src/lib/<domain>/use-cases/`, never in route handlers or React components.
- Use-cases must accept a `deps: Repositories` parameter (defaulting to the `repositories` singleton) instead of importing `prisma` directly.
- Use-cases must return `Result<T>` from `@/lib/shared/result`. Do not `throw new Error('CODE')` in use-case code — use `return err()` (before transaction) or `fail()` (inside transaction).
- Use-cases must export `mapXxxError(error: DomainError): HttpErrorInfo` for error-to-HTTP mapping.
- Route handlers must use `resultToResponse()`, `apiSuccess()`, or `apiError()` from `@/lib/infrastructure/api-helpers`.
- Each domain module must export its public API through `index.ts` (barrel export). Code outside the domain must import from the barrel, not from internal paths.
- Cross-domain dependencies are type-only through `ports.ts`. Never import another domain's adapters or use-cases.
- All multi-table mutations must go through `runInTransaction()`, never raw `prisma.$transaction()` inside use-cases.
- New domain logic (pricing, promotions, membership math) must be a pure function when possible — no store/prisma dependency.
- `import { prisma }` is allowed only in `src/lib/infrastructure/prisma.ts`, `src/lib/infrastructure/repositories.ts`, and `src/lib/infrastructure/db-helpers.ts`.
```

### 6.3 ADR mới: ADR-007

Thêm vào `docs/architecture.md`:

```markdown
## ADR-007: Port/Adapter Pattern cho Use-cases

**Status:** Accepted (2026-08-07)

**Context:**
Use-cases hiện tại import `prisma` trực tiếp — không thể unit test nếu không có database thật,
logic nghiệp vụ bị trộn với persistence. Helper functions đã có pattern inject `db: Pick<Prisma.TransactionClient, ...>`
nhưng use-case thì chưa.

**Decision:**
1. Mỗi domain module định nghĩa `ports.ts` với repository interface. Adapter implement interface bằng Prisma
   dùng store types `Pick<Prisma.TransactionClient, ...>` — kế thừa pattern đã có từ helpers.
2. Use-case nhận `deps: Repositories` làm tham số (default = composition root singleton).
3. Use-case return `Result<T>` thay vì throw error string. Validation trước transaction → `err()`.
   Validation trong transaction → `fail()` (throw `RollbackSignal` để trigger rollback).
4. Route handler inject `repositories` vào use-case, dùng `resultToResponse()` để convert sang HTTP response.
5. Tổ chức code theo domain: `src/lib/<domain>/` với `ports.ts`, `use-cases/`, `validations.ts`, `helpers.ts`, `index.ts`.

**Consequences:**
- ✅ Use-case test được với mock repositories — không cần database thật
- ✅ Ranh giới rõ giữa business logic và persistence
- ✅ Import path ngắn gọn qua barrel exports
- ✅ Transaction semantics giữ nguyên qua `fail()`/`RollbackSignal`
- ❌ Phải migrate từng domain — có period tạm thời 2 pattern cùng tồn tại
- ❌ `Pick<Prisma.TransactionClient, ...>` vẫn coupling vào Prisma type system (chấp nhận được — Prisma là ORM chính, và chỉ type-level)
```

---

## 7. Risk Mitigation

| Rủi ro | Mức độ | Mitigation |
|--------|--------|------------|
| Rollback semantics bị break — `return err()` trong `$transaction` callback → commit partial writes | **Critical** | `fail()` throw `RollbackSignal` để trigger rollback; `runInTransaction` catch `RollbackSignal` → `err()`. Document rõ, không cho "simplify" |
| Cache trong `settings.ts` bị mất/broken khi move sang adapter | **High** | Cache ở composition root level (wrapper quanh `SettingsRepository`), không trong per-`tx` adapter |
| Dynamic error codes (`INSUFFICIENT_STOCK:name`, `SHIFT_OPEN_FAILED: msg`) không map được | **High** | Dùng `DomainError.detail` field thay vì string suffix. Kiểm tra từng error code trước khi migrate |
| `openOrJoinShift` retry loop (P2002/P2034) bị break | **Medium** | Retry loop bọc quanh `runInTransaction`; `runInTransaction` re-throw non-`RollbackSignal` errors |
| Import path thay đổi gây lỗi build hàng loạt | **Medium** | Barrel shims giữ re-export ở vị trí cũ. Xóa shim sau khi tất cả consumer đã migrate |
| 2 pattern cùng tồn tại gây confusion cho người mới | **Low** | Document rõ pattern cũ là deprecated trong CLAUDE.md; CI check `grep "from '@/lib/prisma'" src/lib/business/` giảm dần |
| Test bị break do mock `prisma` không còn hoạt động | **Low** | Test hiện tại test pure logic (pricing, validations) — không mock prisma. Test mới dùng fake repos |

---

## 8. Verification

### Per-Iteration Checklist

```bash
# 1. TypeScript
npx tsc --noEmit

# 2. Tests
npx vitest run

# 3. Lint
npm run lint

# 4. Build
npm run build

# 5. Architecture compliance (tăng dần theo iteration)
grep -rn "from '@/lib/prisma'" src/lib/ --include='*.ts' | grep -v infrastructure | grep -v shared
# ↑ Phải giảm dần về 0 (ngoại trừ barrel shims tạm thời)

grep -rn "throw new Error('" src/lib/ --include='*.ts' | grep -v shared
# ↑ Phải giảm dần về 0 (ngoại trừ shared/result.ts, infrastructure/db-helpers.ts)
```

### Manual Smoke Test (sau Iteration 1+)

1. Login → vào Ca hôm nay
2. Mở ca (nếu chưa có) → check-in khách vãng lai
3. Checkout → xem hoá đơn
4. Huỷ hoá đơn (admin)
5. Đăng ký hội viên mới (sau Iteration 2)
6. Gia hạn hội viên (sau Iteration 2)
7. Đóng ca (sau Iteration 3)

### API Contract Verification

```bash
# So sánh response trước/sau migration cho các route đã migrate
# Body, status code, error code phải identical
curl -s http://localhost:3000/api/sessions/[id]/checkout-preview | jq .
```

---

## Appendix: Các file sẽ không thay đổi

Những file này đã là pure functions hoặc đã có pattern đúng — không cần migrate:

| File | Lý do |
|------|-------|
| `src/lib/promotion-calculation.ts` | Pure functions, không import prisma |
| `src/lib/utils.ts` | Pure utilities |
| `src/lib/constants.ts` | Constants only |
| `src/lib/db-retry.ts` | Infrastructure, sẽ move vào `infrastructure/` |
| `src/lib/api.ts` / `src/lib/api-client.ts` | Client-side HTTP wrappers |
| `src/types/index.ts` | Shared types |
| `src/hooks/use-theme.ts` | UI hook |
| `src/components/**` | UI components — không phải business logic |
| `src/features/**/types.ts` | Feature-specific types |
| `src/proxy.ts` | Next.js middleware — độc lập |
