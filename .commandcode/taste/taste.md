- Negative financial values in UI displays should be shown in red (e.g., `text-red-600`/`text-red-500`) with an explicit '-' prefix (e.g., `-{money(amount)}`) to make the deduction visually clear. Confidence: 0.70
- Financial records with linked transactions must be append-friendly/immutable: never hard-delete an invoice that has related payments, membership fees, or stock movements — doing so leaves orphaned references, doesn't reverse side-effects (inventory, balances, shift totals), and corrupts closed reports. Instead, use a void/cancel flow that marks the record and creates corrective entries (e.g., negative invoices, return stock movements) within a single transaction with audit logging. Hard-delete is permitted only for draft records with no linked transactions. Confidence: 0.85# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# communication
- Communicate in Vietnamese for this project. Confidence: 0.85
- User reports bugs as concrete step-by-step reproduction flows (exact navigation path, button labels, observed error message) plus the business risk of repeating the action (e.g., "ấn nhiều lần tạo nhiều customer") — expects the agent to reason through the full sequence and side-effect risks, not just the headline error. Confidence: 0.55
- Khi người dùng nói "bỏ nó đi" hoặc tỏ vẻ muốn xoá bỏ một tính năng trong lúc bực bội, hãy xác nhận lại phạm vi chính xác trước khi xoá code — tránh hiểu nhầm thành xoá toàn bộ thay vì đơn giản hoá/làm gọn. Confidence: 0.65
- User occasionally types terse commands in English ("continue", "Let do first 6 candidates", "all i choose a", "commit changes", "I need you to remove agents/skills that I would rarely use for this projects") even in this Vietnamese-speaking project; respond in Vietnamese regardless. Confidence: 0.80

# ui
See [ui/taste.md](ui/taste.md)
# api
See [api/taste.md](api/taste.md)
# performance
- Use `Promise.all` to parallelize independent API/data-fetching calls rather than awaiting sequentially. Confidence: 0.60
- Paginate grouped data by day (not by individual records) to reduce query size; fetch a date range and group in memory at the API level. Confidence: 0.80

# pricing
- Do not use peak/off-peak hour classification; use only traditional time ranges (hourFrom/hourTo) for pricing rules. Confidence: 0.75
- For walk-in customers, pricing decisions belong at checkout (when collecting payment), not at check-in: the check-in dialog records only check-in time and player count, and the price table is selected/resolved at the moment of payment. Price is likewise not needed while a session is active — the user had the live running-total calculation removed from the active session card entirely ("Bỏ logic tính giá trước vì từ lúc bắt đầu và trong lúc chơi thì không cần xem giá"), so price display/computation belongs only at payment time. Confidence: 0.75

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
- Apply Prisma schema changes with `npx prisma db push` + `npx prisma generate` — this project does not use Prisma migration files. Confidence: 0.70

# refactoring
- Prefer reusing existing components over creating new ones when combining or refactoring features; only create a new component when no existing component can serve the purpose. Confidence: 0.85
- Extract shared UI content into standalone components and wrap them in modal shells for reuse across page and modal contexts. Confidence: 0.85
- Prefer opening nested modals (on top of current modal) over `router.push` page navigation for detail drill-downs inside modal contexts, to preserve user context and allow returning to the original modal when closed. Confidence: 0.75
- When introducing a UI pattern or applying a refactor, apply it consistently across all relevant modules and user types rather than just the obvious ones — when the agent implemented a prominent elapsed-time clock only for walk-in sessions without pricing, the user immediately requested uniform application to members too ("Áp dụng chung cho cả hội viên"). Confidence: 0.82

# workflow
See [workflow/taste.md](workflow/taste.md)