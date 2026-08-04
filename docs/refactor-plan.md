# Kế hoạch dọn dẹp & đơn giản hoá kiến trúc

## Mục tiêu

Chuyển toàn bộ server code về layered pattern thống nhất, tổ chức **theo lớp chức năng** (layer) với đặt tên file `{domain}.{layer}.ts`:

```
app/ (FE: API routes gọi application service)
  → server/modules/service/{domain}.service.ts (business logic)
  → server/modules/repository/{domain}.repository.ts (interface)
  → server/modules/model/{domain}.model.ts (domain entity types)
  → server/modules/adapter/{domain}.adapter.ts (Prisma implementation)
  → server/db/prisma.ts (Prisma client)
```

**Giữ nguyên**: business logic, DB schema, API contract, response format.
**Chỉ thay đổi**: tổ chức code, dependency wiring, test ability.

## Nguyên tắm

1. **Mỗi lớp (layer) là một thư mục**: `model/`, `repository/`, `adapter/`, `service/`, `policy/`
2. **File đặt tên `{domain}.{layer}.ts`** — ví dụ: `sessions.model.ts`, `sessions.repository.ts`, `sessions.adapter.ts`, `sessions.service.ts`
3. **Dependency direction**: service → repository → model; adapter → repository + model + prisma; policy → model
4. **Service không import Prisma, không import application singleton** — chỉ nhận dependencies qua DI
5. **`server/application.ts`** là composition root duy nhất — wiring tất cả modules + UnitOfWork
6. **UnitOfWork** truyền transaction-scoped adapters/repositories vào service khi cần giao dịch đa bảng
7. **Không destructive**: refactor từng module, build+test mỗi bước, rollback nếu lỗi

## Cấu trúc thư mục mới

```
src/server/modules/
├── model/
│   ├── audit.model.ts
│   ├── billing.model.ts
│   ├── customers.model.ts
│   ├── identity.model.ts
│   ├── inventory.model.ts
│   ├── memberships.model.ts
│   ├── pricing.model.ts
│   ├── promotions.model.ts
│   ├── reports.model.ts
│   ├── sessions.model.ts
│   ├── settings.model.ts
│   ├── shifts.model.ts
│   └── tools.model.ts
├── repository/
│   ├── audit.repository.ts
│   ├── billing.repository.ts
│   ├── customers.repository.ts
│   ├── identity.repository.ts
│   ├── inventory.repository.ts
│   ├── memberships.repository.ts
│   ├── pricing.repository.ts
│   ├── promotions.repository.ts
│   ├── reports.repository.ts
│   ├── sessions.repository.ts
│   ├── settings.repository.ts
│   ├── shifts.repository.ts
│   └── tools.repository.ts
├── adapter/
│   ├── audit.adapter.ts
│   ├── billing.adapter.ts
│   ├── customers.adapter.ts
│   ├── identity.adapter.ts
│   ├── inventory.adapter.ts
│   ├── memberships.adapter.ts
│   ├── pricing.adapter.ts
│   ├── promotions.adapter.ts
│   ├── reports.adapter.ts
│   ├── sessions.adapter.ts
│   ├── settings.adapter.ts
│   ├── shifts.adapter.ts
│   └── tools.adapter.ts
├── service/
│   ├── audit.service.ts
│   ├── billing.service.ts
│   ├── customers.service.ts
│   ├── identity.service.ts
│   ├── inventory.service.ts
│   ├── memberships.service.ts
│   ├── pricing.service.ts
│   ├── promotions.service.ts
│   ├── reports.service.ts
│   ├── sessions.service.ts
│   ├── settings.service.ts
│   ├── shifts.service.ts
│   └── tools.service.ts
└── policy/
    ├── pricing.policy.ts        (existing: pricing/policy.ts)
    └── promotions.policy.ts     (existing: promotions/policy.ts)
```

## Layer model.ts — vai trò

**`model/*.model.ts`** chứa domain entity type definitions (hiện đang rải rắn trong repository.ts / service.ts):

```typescript
// model/sessions.model.ts
export interface SessionRecord { ... }
export interface SessionPricingGroupRecord { ... }
export interface CheckoutLine { ... }
export interface SessionCreateInput { ... }
```

**`repository/*.repository.ts`** chứa chỉ interface — import types từ model:

```typescript
// repository/sessions.repository.ts
import type { SessionRecord, ... } from '@/server/modules/model/sessions.model'

export interface SessionRepository {
  findById(id: string): Promise<SessionRecord | null>
  create(input: SessionCreateInput): Promise<SessionRecord>
  // ... chỉ method signatures
}
```

**`adapter/*.adapter.ts`** chứa Prisma implementation — mapping giữa model ↔ Prisma:

```typescript
// adapter/sessions.adapter.ts
export function createPrismaSessionRepository(store: PrismaStore): SessionRepository {
  function mapToRecord(rule: PrismaSession): SessionRecord { ... }
  return { findById, create, ... }
}
```

**`service/*.service.ts`** chứa business logic — factory nhận DI:

```typescript
// service/sessions.service.ts
export function createSessionsService(deps: SessionsDependencies): SessionsService {
  return { checkIn, checkOut, sellItems, calculatePrice, listSessions, getSession, ... }
}
```

---

## Phân tích hiện trạng (2 patterns đang cùng tồn tại)

### Pattern A — đã refactor (pricing, promotions)
```
pricing/repository.ts        → PricingRepository interface
pricing/repository.prisma.ts → createPrismaPricingRepository(store)
pricing/use-cases.ts         → createPricingUseCases({ repository, unitOfWork })
pricing/policy.ts            → pure functions
```
Ưu điệm: test được bằng fake repo. Nhược điểm: tên gọi chưa đồng nhất, chưa có model.ts riêng.

### Pattern B — legacy (sessions, memberships, inventory, billing, shifts, settings, tools, customers, identity, reports)
```
{module}/service.ts → import { prisma } trực tiếp, dùng runPrismaTransaction
```
+ file use case tách riêng (check-in.ts, check-out.ts...) vẫn import prisma trực tiếp.

### Vấn đề chính
- 2 patterns đồng thời → chaos kiến trúc
- `import { prisma }` lan khắp — vi phạm DI
- `import { application }` trong sessions → circular dependency
- `logActivity(db, input)` dùng raw Prisma store → bypass repository
- `application.ts` chỉ wiring 3 modules, còn lại route import trực tiếp service

### Giải pháp: chuyển hết về Pattern A

**Giải quyết mọi vấn đề trên bằng cách chuyển hết các module Pattern B về Pattern A** — áp dụng cấu trúc `model → repository (interface) → adapter (Prisma) → service (DI factory)` cho toàn bộ 12 module còn lại:

| Vấn đề | Cách giải quyết qua Pattern A |
|--------|-------------------------------|
| 2 patterns đồng thời | Thống nhất structure: model + repository + adapter + service cho mọi module |
| `import { prisma }` lan khắp | Adapter là nơi duy nhất import prisma; service nhận interface qua DI |
| Circular dependency qua `application` | Service nhận `pricing`, `promotions` qua DI parameters — không import singleton |
| `logActivity` bypass repository | Audit có repository interface; mọi service nhận `audit: AuditRepository` qua DI |
| `application.ts` chỉ wiring 3 modules | Mở rộng wiring cho tất cả 12 module |

Chiến lược migration chi tiết ở phần **Migration strategy** và **Kế hoạch thực hiện** dưới đây.

---

## Git workflow — Nhánh riêng cho mỗi module

**Tạo nhánh mỗi khi bắt đầu refactor một module, hoàn thành test xong mới merge về main.**

### Quy trình

1. **Checkout nhánh feature từ master**:
   ```bash
   git checkout -b refactor/{domain}-to-layered master
   ```
   Ví dụ: `refactor/sessions-layered`, `refactor/billing-layered`

2. **Thực hiện migration** theo Migration strategy (model → repository → adapter → service → wiring → routes → delete old)

3. **Verify trên nhánh feature**:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm vitest run
   pnpm tsx scripts/check-architecture.ts
   ```

4. **Merge về master** chỉ khi tất cả checks pass:
   ```bash
   git checkout master
   git merge --no-ff refactor/{domain}-to-layered
   ```
   Dùng `--no-ff` để giữ lịch sử merge rõ ràng.

### Lý do
- Mỗi module được cách ly, rollback nếu test lỗi không ảnh hưởng module khác
- Master luôn ở trạng thái buildable
- Migration strategy per module được verify đầy đủ trước khi merge

---

## Kế hoạch thực hiện

### BưỔc 0: Chuẩn hoá pricing/promotions — tạo model.ts, đổi tên (1-2 ngày)

**Pricing:**
1. Tạo `model/pricing.model.ts` — extract types từ `pricing/repository.ts`
2. Tạo `repository/pricing.repository.ts` — import từ model, chỉ chứa PricingRepository interface
3. Tạo `adapter/pricing.adapter.ts` — rename từ `repository.prisma.ts`, export `createPrismaPricingAdapter(store)`
4. Tạo `service/pricing.service.ts` — rename từ `use-cases.ts`, export `createPricingService`
5. Giữ `policy/pricing.policy.ts` — copy từ `pricing/policy.ts`

**Promotions:** làm tương tự với pricing.

Files cập nhật import:
- `server/application.ts`
- `server/modules/sessions/check-in.ts`, `calculate-price.ts`, `check-out.ts`
- `src/__tests__/pricing-use-cases.test.ts` → `src/__tests__/pricing-service.test.ts`

### BưỔop 1: Audit cleanup + model.ts + adapter pattern (1 ngày)

1. `model/audit.model.ts` — `AuditEntryInput`, `AuditEntryRecord`
2. `repository/audit.repository.ts` — `AuditRepository` interface
3. `adapter/audit.adapter.ts` — `createPrismaAuditAdapter(store)`
4. **Xóa** `modules/audit/service.ts` (`logActivity`)
5. Thay `import { logActivity }` bằng `auditRepository.append()` qua UnitOfWork

Files cần sửa: **18+ file**

### BưỔop 2: UnitOfWork mở rộng (1 ngày)

```typescript
// server/db/unit-of-work.ts
export function createUnitOfWork(
  factories: Record<string, (tx: PrismaStore) => unknown>
): UnitOfWork<Record<string, unknown>> {
  return {
    run: (work, options) => runPrismaTransaction(
      (tx) => work(Object.fromEntries(
        Object.entries(factories).map(([k, f]) => [k, f(tx)])
      ) as any),
      options
    )
  }
}
```

### BưỔop 3: Refactor Sessions module (3-4 ngày)

1. `model/sessions.model.ts` — extract types từ service.ts + check-in.ts + check-out.ts
2. `repository/sessions.repository.ts` — interface (SessionRepository)
3. `adapter/sessions.adapter.ts` — Prisma implementation
4. `service/sessions.service.ts` — `createSessionsService({ deps })` — factory nhận DI

Xóa files cũ: `modules/sessions/check-in.ts`, `modules/sessions/check-out.ts`, `modules/sessions/sell-items.ts`, `modules/sessions/calculate-price.ts`, `modules/sessions/service.ts`

### BưỔop 4: Refactor Billing, Inventory, Settings, Shifts, Memberships (1-2 ngày/module)

Mỗi module tạo: model + repository + adapter + service theo pattern A.

### BưỔop 5: Identity, Customers, Tools, Reports (1-2 ngày/module)

### BưỔop 6: Wiring `application.ts` (1 ngày)

Composition root wiring tất cả modules qua DI. pricing & promotions define trước sessions.

### BưỔop 7: Route handlers (1-2 ngày)

Thay `import { X } from '@/server/modules/...'` → `application.{module}.{method}()`. Dùng `toErrorResponse()`.

### BưỔop 8: Architecture checker (1 ngày)

Cập nhật `scripts/check-architecture.ts` rules:
- model/ → không import adapter/ hoặc prisma
- repository/ → không import adapter/ hoặc prisma
- service/ → không import prisma, không import application singleton
- adapter/ → import prisma được nhưng không import service

### BưỔop 9: Tests (2-3 ngày)

- Pure functions: Vitest unit test
- Service use cases: fake repository unit test
- Adapter: integration test

### BưỔop 10: Cập nhật CLAUDE.md (1 ngày)

**Là bước cuối cùng** sau khi toàn bộ refactor xong. Cập nhật document để match layer-based architecture:

1. **"Modular monolith theo domain và hướng phụ thuộc"** (line ~68-86): cập nhật dependency diagram → `app → service → repository → model → adapter → prisma`, đổi mô tả domain module → layer-based module
2. **"Cấu trúc thư mục"** (line ~90-120): thay `modules/{domain}/` bằng `modules/{model|repository|adapter|service|policy}/{domain}.{layer}.ts`
3. **"Module và use-case architecture"** (line ~541-581): cập nhật ví dụ cấu trúc module từ domain-dir sang layer-dir
4. **Quy tắc import** (line ~153-156): cập nhật boundary rules cho layer structure
5. **API routes table** (line ~495-526): cập nhật import paths nếu reference module paths

---

## Thứ tự thực hiện

```
1. Pricing/promotions: tạo model.ts, đổi tên → adapter/service/policy
2. Audit: cleanup logActivity, tạo model/repository/adapter
3. UnitOfWork mở rộng
4. Billing → Inventory → Settings → Shifts → Memberships
5. Sessions (lớn nhất)
6. Identity, Customers, Tools, Reports
7. Wiring application.ts
8. Routes + error handling
9. Architecture checker cập nhật
10. Tests
11. Cập nhật CLAUDE.md (bước cuối cùng)
```

## Migration strategy (từng module)

Mỗi module tuân thủ:
1. `git checkout -b refactor/{domain}-to-layered master`
2. Tạo `model/{domain}.model.ts` (extract types)
3. Tạo `repository/{domain}.repository.ts` (interface, import từ model)
4. Tạo `adapter/{domain}.adapter.ts` (Prisma impl, copy logic từ service.ts cũ)
5. Tạo `service/{domain}.service.ts` (`createXxxService` factory)
6. Wiring vào `application.ts`
7. Cập nhật route handlers
8. Xóa files cũ trong `modules/{domain}/`
9. Chạy `typecheck + lint + vitest + architecture check`
10. Merge `--no-ff` về master nếu pass

Sau khi **tất cả module** đã merge: `git checkout -b docs/update-claude-md master` → cập nhật CLAUDE.md → merge về master.

## Verification checklist

- `pnpm typecheck` — không error
- `pnpm lint` — không error
- `vitest run` — unit tests pass
- `scripts/check-architecture.ts` — pass (layer-based rules)
- `next build` — production build pass
- Integration test DB pass
- API contract snapshot unchanged (URL, method, response format)
- CLAUDE.md đồng bộ với layer-based structure

## Files cần tạo mới (mẫu)

```
model/sessions.model.ts, repository/sessions.repository.ts, adapter/sessions.adapter.ts, service/sessions.service.ts
model/billing.model.ts, repository/billing.repository.ts, adapter/billing.adapter.ts, service/billing.service.ts
model/inventory.model.ts, repository/inventory.repository.ts, adapter/inventory.adapter.ts, service/inventory.service.ts
model/memberships.model.ts, repository/memberships.repository.ts, adapter/memberships.adapter.ts, service/memberships.service.ts
model/shifts.model.ts, repository/shifts.repository.ts, adapter/shifts.adapter.ts, service/shifts.service.ts
model/settings.model.ts, repository/settings.repository.ts, adapter/settings.adapter.ts, service/settings.service.ts
model/tools.model.ts, repository/tools.repository.ts, adapter/tools.adapter.ts, service/tools.service.ts
model/identity.model.ts, repository/identity.repository.ts, adapter/identity.adapter.ts, service/identity.service.ts
model/customers.model.ts, repository/customers.repository.ts, adapter/customers.adapter.ts, service/customers.service.ts
model/reports.model.ts, repository/reports.repository.ts, adapter/reports.adapter.ts, service/reports.service.ts
model/pricing.model.ts, repository/pricing.repository.ts, adapter/pricing.adapter.ts, service/pricing.service.ts
model/promotions.model.ts, repository/promotions.repository.ts, adapter/promotions.adapter.ts, service/promotions.service.ts
```
## Dọn các file trống hoặc không còn dùng nữa