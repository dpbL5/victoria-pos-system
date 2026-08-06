- Negative financial values in UI displays should be shown in red (e.g., `text-red-600`/`text-red-500`) with an explicit '-' prefix (e.g., `-{money(amount)}`) to make the deduction visually clear. Confidence: 0.70
- Financial records with linked transactions must be append-friendly/immutable: never hard-delete an invoice that has related payments, membership fees, or stock movements — doing so leaves orphaned references, doesn't reverse side-effects (inventory, balances, shift totals), and corrupts closed reports. Instead, use a void/cancel flow that marks the record and creates corrective entries (e.g., negative invoices, return stock movements) within a single transaction with audit logging. Hard-delete is permitted only for draft records with no linked transactions. Confidence: 0.85# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# communication
- Communicate in Vietnamese for this project. Confidence: 0.85
- Khi người dùng nói "bỏ nó đi" hoặc tỏ vẻ muốn xoá bỏ một tính năng trong lúc bực bội, hãy xác nhận lại phạm vi chính xác trước khi xoá code — tránh hiểu nhầm thành xoá toàn bộ thay vì đơn giản hoá/làm gọn. Confidence: 0.65

# ui
See [ui/taste.md](ui/taste.md)
# api
- Audit-log destructive operations (e.g., DELETE endpoints) by writing to the activity journal/log with entity type and relevant field details (via `logActivity`) for traceability. Confidence: 0.75
- Manually extract CSRF tokens from `document.cookie` and set the `X-CSRF-Token` header for mutation requests (PATCH/DELETE) when existing API helpers only support POST. Confidence: 0.70
- Use `requireMutationAuth` for write operations (POST/PATCH/DELETE) and `requireAuth` for read operations; check `auth.role !== 'ADMIN'` for admin-only access rather than relying on a dedicated `requireAdmin` function. Confidence: 0.70
- Use typed API client helpers (`apiJson<T>(url, options)` for responses, `jsonRequest(body)` for building POST/json request options) from `@/features/pos/api` instead of raw `fetch` in client components. Confidence: 0.70
- Sanitize string inputs from request bodies on the backend: `JSON.parse` then trim, type-coerce (`String(...)`), and cap length before passing to business logic. Confidence: 0.65

# performance
- Use `Promise.all` to parallelize independent API/data-fetching calls rather than awaiting sequentially. Confidence: 0.60
- Paginate grouped data by day (not by individual records) to reduce query size; fetch a date range and group in memory at the API level. Confidence: 0.80

# pricing
- Do not use peak/off-peak hour classification; use only traditional time ranges (hourFrom/hourTo) for pricing rules. Confidence: 0.75

# finance
- Charges that reduce payment (e.g., parking fees, deductions) should be modeled as negative invoice line items — subtract from `subtotal` and `grandTotal` rather than accumulating into the total; guard totals with `Math.max(0, ...)` to prevent negative balances; invoice item `subtotal` and `total` fields should be negative for such deductions. Confidence: 0.75
- Corrections to records whose originating reporting period (e.g., a closed shift) is already closed must be append-only: create corrective entries (e.g., negative payments, return stock movements) attached to that closed period's existing records and flag them in the audit log (e.g., `closedShiftCorrection`), rather than mutating the closed period's aggregated totals (e.g., `expectedCash`/`actualCash`) or blocking the correction entirely. Confidence: 0.82
- Negative financial values in UI displays should be shown in red (e.g., `text-red-600`/`text-red-500`) with an explicit '-' prefix (e.g., `-{money(amount)}`) to make the deduction visually clear. Confidence: 0.70

# architecture
See [architecture/taste.md](architecture/taste.md)

# prisma
- When spreading parsed Zod schema data into a Prisma `update` or `create` call, explicitly delete nested relation fields (e.g., `delete data.tiers`) that don't exist as columns on the target table — Prisma will reject unknown fields at runtime. Confidence: 0.75
- When syncing a related collection (e.g., tiers) in a PUT route, only perform delete+recreate when the client explicitly sends the field in the request body (`parsed.data.tiers !== undefined`), not with `?? []` which conflates "not sent" with "sent empty" and silently deletes existing data on unrelated updates. Confidence: 0.75
- Use Prisma `createMany` for batch inserts of related records (e.g., ShiftTool) instead of individual create calls within a transaction. Confidence: 0.65

# refactoring
- Prefer reusing existing components over creating new ones when combining or refactoring features; only create a new component when no existing component can serve the purpose. Confidence: 0.85
- Extract shared UI content into standalone components and wrap them in modal shells for reuse across page and modal contexts. Confidence: 0.85
- Prefer opening nested modals (on top of current modal) over `router.push` page navigation for detail drill-downs inside modal contexts, to preserve user context and allow returning to the original modal when closed. Confidence: 0.75
- When introducing a UI pattern or applying a refactor, apply it consistently across all relevant modules rather than just the obvious ones. Confidence: 0.75

# workflow
See [workflow/taste.md](workflow/taste.md)