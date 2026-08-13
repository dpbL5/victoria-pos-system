- Negative financial values in UI displays should be shown in red (e.g., `text-red-600`/`text-red-500`) with an explicit '-' prefix (e.g., `-{money(amount)}`) to make the deduction visually clear. Confidence: 0.70
- Financial records with linked transactions must be append-friendly/immutable: never hard-delete an invoice that has related payments, membership fees, or stock movements — doing so leaves orphaned references, doesn't reverse side-effects (inventory, balances, shift totals), and corrupts closed reports. Instead, use a void/cancel flow that marks the record and creates corrective entries (e.g., negative invoices, return stock movements) within a single transaction with audit logging. Hard-delete is permitted only for draft records with no linked transactions. Confidence: 0.85# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# communication
See [communication/taste.md](communication/taste.md)
# ui
See [ui/taste.md](ui/taste.md)
# api
See [api/taste.md](api/taste.md)
# performance
- Use `Promise.all` to parallelize independent API/data-fetching calls rather than awaiting sequentially. Confidence: 0.60
- Paginate grouped data by day (not by individual records) to reduce query size; fetch a date range and group in memory at the API level. Confidence: 0.80
- When the user reports a page being slow (e.g., "/sessions quá chậm"), they expect evidence-based diagnosis before any fix: measure actual query/network latency against the real DB (e.g., a throwaway tsx benchmark script timing each query, including a raw PING) to identify the bottleneck, present a prioritized set of improvement options with a recommendation, and re-run the same measurement after implementing to validate the gain — code-reading alone is not sufficient. Confidence: 0.65
- Prefers incremental, low-risk performance fixes that keep the existing API contract unchanged (raise the DB pool max, add indexes for hot query patterns like `(status, createdAt)`, merge closely-related requests into one endpoint to cut round-trips, defer loading secondary data like products/tools until needed) over larger refactors (e.g., a single bootstrap endpoint) or changing deployment-level connection settings (e.g., switching the Supabase pooler port). Confidence: 0.6

# pricing
- Do not use peak/off-peak hour classification; use only traditional time ranges (hourFrom/hourTo) for pricing rules. Confidence: 0.75
- For walk-in customers, pricing decisions belong at checkout (when collecting payment), not at check-in: the check-in dialog records only check-in time and player count, and the price table is selected/resolved at the moment of payment. Price is likewise not needed while a session is active — the user had the live running-total calculation removed from the active session card entirely ("Bỏ logic tính giá trước vì từ lúc bắt đầu và trong lúc chơi thì không cần xem giá"), so price display/computation belongs only at payment time. Confidence: 0.75

- When a walk-in session is split across multiple pricing tables ("Nhiều bảng giá"), checkout collects payment for ALL groups in a single invoice, each group priced by its own rule — the user explicitly chose "Thu hết 1 lần" (over the recommended sequential per-group checkout) when the multi-group billing logic was wrong. Confidence: 0.8
- Players must be manually assignable to pricing groups: the user chose "Chọn tay từng người" (explicit checkbox assignment of each player into a group) over automatic first-N-by-creation-order distribution, so staff decide which player pays which price table; the flow must persist the player→group mapping and price each player by its group's rule. Confidence: 0.8
- Prefers one unified control over a mode toggle when the default state already covers the simple case: at checkout the user removed the "Một bảng giá / Nhiều bảng giá" toggle entirely and made the group builder the only pricing UI — the default single group (all players + first pricing rule) already implements the one-table case ("mặc định chỉ có 1 nhóm -> 1 bảng giá"), and multiple tables are reached by deselecting players from the default group and adding another group with a different rule, so the two-mode UI was deemed unnecessary ("không cần thiết lắm"). After such a removal, the client always sends `groups` (even a single group) and the extra single-mode state/select is deleted. Confidence: 0.7

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
- Apply Prisma schema changes with `npx prisma db push` + `npx prisma generate` — this project does not use Prisma migration files; a stale Prisma client (errors like "Unknown field X" on fields already present in the schema) is fixed by re-running `npx prisma generate`, and `db push` is used to sync schema to the DB. Confidence: 0.78
- Raw SQL (Prisma `$queryRaw`/`$queryRawUnsafe`) must schema-qualify enum types and tables with the `app.` prefix (e.g., `NULL::app."PromotionDiscountType"`): this project's Postgres (Supabase via PgBouncer transaction pooler, port 6543) resets session state, so `search_path` stays `"$user", public, extensions` and raw queries cannot see the `app` schema — whereas generated Prisma queries work because DATABASE_URL carries `?schema=app`. Confidence: 0.85

# refactoring
- Prefer reusing existing components over creating new ones when combining or refactoring features; only create a new component when no existing component can serve the purpose. Confidence: 0.85
- Extract shared UI content into standalone components and wrap them in modal shells for reuse across page and modal contexts. Confidence: 0.85
- Prefer opening nested modals (on top of current modal) over `router.push` page navigation for detail drill-downs inside modal contexts, to preserve user context and allow returning to the original modal when closed. Confidence: 0.75
- When introducing a UI pattern or applying a refactor, apply it consistently across all relevant modules and user types rather than just the obvious ones — when the agent implemented a prominent elapsed-time clock only for walk-in sessions without pricing, the user immediately requested uniform application to members too ("Áp dụng chung cho cả hội viên"). Confidence: 0.82

# workflow
See [workflow/taste.md](workflow/taste.md)