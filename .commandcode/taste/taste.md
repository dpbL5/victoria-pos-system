- Negative financial values in UI displays should be shown in red (e.g., `text-red-600`/`text-red-500`) with an explicit '-' prefix (e.g., `-{money(amount)}`) to make the deduction visually clear. Confidence: 0.70
- Avoid experimental/unstable framework features in production code — the user explicitly removed React 19's `ViewTransition` component because it was experimental and unstable, preferring stable, well-established APIs over bleeding-edge ones. Confidence: 0.60
- Financial records with linked transactions must be append-friendly/immutable: never hard-delete an invoice that has related payments, membership fees, or stock movements — doing so leaves orphaned references, doesn't reverse side-effects (inventory, balances, shift totals), and corrupts closed reports. Instead, use a void/cancel flow that marks the record and creates corrective entries (e.g., negative invoices, return stock movements) within a single transaction with audit logging. Hard-delete is permitted only for draft records with no linked transactions. Confidence: 0.85
- Đặt lịch (booking) deposits are collected at booking time — the booking form carries a deposit amount plus the receiving payment method, and collecting is allowed even when no shift is open and for bookings scheduled outside shift hours — then the deposit is carried forward and deducted from the final total at checkout, attributed to the shift that performs that checkout (the money is tied to the checkout `shiftId`, which is what makes out-of-hours bookings work). Booking "Ghi chú" is optional (not a required field, at either the UI or backend level). Confidence: 0.6
- Recurring CLASS schedules must always be bounded — the user explicitly asked "Loại bỏ lựa chọn Không kết thúc khi tạo lớp học", so the "Không kết thúc" (NEVER) ending option is gone from the class-creation form and the class slot add/edit modal (the shared `ScheduleFields` carries an `allowNever` prop, `false` only for class surfaces); classes end via "Vào ngày" (end date) or "Sau số buổi" (session count), with "Vào ngày" as the default, and a legacy slot stored as NEVER is forced to re-pick an ending when opened for edit. Only the standalone Lịch học (lesson schedule) keeps the open-ended NEVER option. Don't reintroduce NEVER on any new class-scheduling surface. Confidence: 0.6# Taste (Continuously Learned by [CommandCode][cmd])

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
- Performance complaints arrive as terse Vietnamese questions that carry the user's own suspected culprit ("Tìm hiểu tại sao phản hồi của UI quá chậm, có khi nào do use cache hay không?"). Treat that hypothesis as the first thing to adjudicate with measurements — confirm or refute it, naming which cache is even in play (Next.js fetch/route cache, React/query cache, or DB-side caching) — then keep going to the actual bottleneck; neither "fix" the suspected cache without proof nor dismiss it without evidence. Confidence: 0.5
- Prefers incremental, low-risk performance fixes that keep the existing API contract unchanged (raise the DB pool max, add indexes for hot query patterns like `(status, createdAt)`, merge closely-related requests into one endpoint to cut round-trips, defer loading secondary data like products/tools until needed) over larger refactors (e.g., a single bootstrap endpoint) or changing deployment-level connection settings (e.g., switching the Supabase pooler port). Confidence: 0.6

# pricing
See [pricing/taste.md](pricing/taste.md)
# finance
See [finance/taste.md](finance/taste.md)
# architecture
See [architecture/taste.md](architecture/taste.md)

# prisma
See [prisma/taste.md](prisma/taste.md)
# refactoring
See [refactoring/taste.md](refactoring/taste.md)
# workflow
See [workflow/taste.md](workflow/taste.md)