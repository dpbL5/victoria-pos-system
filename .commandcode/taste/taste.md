# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# communication
- Communicate in Vietnamese for this project. Confidence: 0.85
- Khi người dùng nói "bỏ nó đi" hoặc tỏ vẻ muốn xoá bỏ một tính năng trong lúc bực bội, hãy xác nhận lại phạm vi chính xác trước khi xoá code — tránh hiểu nhầm thành xoá toàn bộ thay vì đơn giản hoá/làm gọn. Confidence: 0.65

# ui
- Use a blocking overlay (modal/backdrop) when no shift is open instead of only disabling buttons and showing warning banners. The overlay must cover only the content area, leaving both the bottom navigation (mobile) and sidebar navigation (desktop) accessible. Confidence: 0.82
- On mobile, hide the sidebar navigation and logout button; they should only display on desktop ratio. Confidence: 0.65
- When a desired UI component (e.g., Switch) doesn't exist in the component library, use a native HTML element with Tailwind styling instead of creating a new component. Confidence: 0.75
- When displaying data grouped by day, sort today's group to the top of the list. Confidence: 0.85
- When functionality moves to a dedicated module/page, remove the old tab and replace it with a navigation link to the new location rather than keeping both. Confidence: 0.80

# api
- Manually extract CSRF tokens from `document.cookie` and set the `X-CSRF-Token` header for mutation requests (PATCH/DELETE) when existing API helpers only support POST. Confidence: 0.70
- Use `requireMutationAuth` for write operations (POST/PATCH/DELETE) and `requireAuth` for read operations; check `auth.role !== 'ADMIN'` for admin-only access rather than relying on a dedicated `requireAdmin` function. Confidence: 0.70

# performance
- Use `Promise.all` to parallelize independent API/data-fetching calls rather than awaiting sequentially. Confidence: 0.60
- Paginate grouped data by day (not by individual records) to reduce query size; fetch a date range and group in memory at the API level. Confidence: 0.80

# pricing
- Do not use peak/off-peak hour classification; use only traditional time ranges (hourFrom/hourTo) for pricing rules. Confidence: 0.75

# architecture
See [architecture/taste.md](architecture/taste.md)

# prisma
- When spreading parsed Zod schema data into a Prisma `update` or `create` call, explicitly delete nested relation fields (e.g., `delete data.tiers`) that don't exist as columns on the target table — Prisma will reject unknown fields at runtime. Confidence: 0.75
- When syncing a related collection (e.g., tiers) in a PUT route, only perform delete+recreate when the client explicitly sends the field in the request body (`parsed.data.tiers !== undefined`), not with `?? []` which conflates "not sent" with "sent empty" and silently deletes existing data on unrelated updates. Confidence: 0.75
- Use Prisma `createMany` for batch inserts of related records (e.g., ShiftTool) instead of individual create calls within a transaction. Confidence: 0.65

# refactoring
- Extract shared UI content into standalone components and wrap them in modal shells for reuse across page and modal contexts. Confidence: 0.85
- Prefer opening nested modals (on top of current modal) over `router.push` page navigation for detail drill-downs inside modal contexts, to preserve user context and allow returning to the original modal when closed. Confidence: 0.75

# workflow
- Before implementing complex multi-file features, enter plan mode, explore existing code thoroughly, and write a structured implementation plan document covering all phases before starting. Confidence: 0.85
- Use `todo_write` to track phased, structured progress through complex features, updating individual task statuses as work progresses. Confidence: 0.75
- When a series of `edit_file` calls corrupts a file, read the full file and rewrite it entirely from scratch rather than attempting to fix broken incremental edits. Confidence: 0.80
- Organize tests by module/feature in `__tests__` directories, testing pure functions and Zod schemas with Vitest (`describe`/`it`/`expect` + `safeParse`). Confidence: 0.85
- Verify changes in this order: typecheck first (`tsc --noEmit`), then run tests (`vitest run`), then production build (`next build`). Confidence: 0.70
