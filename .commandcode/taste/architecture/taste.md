# architecture
- Extract use-case functions from route handlers into src/lib/business/use-cases/ for check-in, checkout, member registration/renewal, and shift close. Confidence: 0.70
- Mark client-side components with the `'use client'` directive at the top of the file (Next.js App Router convention). Confidence: 0.80
- Add DB-level constraints (partial unique index for single open shift, check constraints for invoice totals, no overlapping memberships) to enforce business invariants. Confidence: 0.70
- Use Asia/Ho_Chi_Minh timezone explicitly in report grouping and pricing date calculations instead of server local time. Confidence: 0.70
- Move generic helpers (api.ts, format.ts, types.ts) from features/pos/ into src/lib/. Confidence: 0.60
- Hide /pricing tab from staff users in bottom navigation; keep exactly 5 staff tabs. Confidence: 0.65
- Align cost rounding with documented rule: ceiling to nearest 10,000 VND instead of Math.round. Confidence: 0.65
- Organize features by domain module (e.g., shifts module) rather than by report type; when a report-type feature fits better in a domain module, move it there and remove it from the report section. Confidence: 0.85
- When explaining complex business logic flows (e.g., check-in → payment → checkout lifecycle), present the full state machine as an ASCII diagram with explicit states and named transitions, plus a summary table of steps/endpoints — rather than prose-only descriptions. Confidence: 0.65
