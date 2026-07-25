# architecture
- Extract use-case functions from route handlers into src/lib/business/use-cases/ for check-in, checkout, member registration/renewal, and shift close. Confidence: 0.70
- Add DB-level constraints (partial unique index for single open shift, check constraints for invoice totals, no overlapping memberships) to enforce business invariants. Confidence: 0.70
- Use Asia/Ho_Chi_Minh timezone explicitly in report grouping and pricing date calculations instead of server local time. Confidence: 0.70
- Move generic helpers (api.ts, format.ts, types.ts) from features/pos/ into src/lib/. Confidence: 0.60
- Hide /pricing tab from staff users in bottom navigation; keep exactly 5 staff tabs. Confidence: 0.65
- Align cost rounding with documented rule: ceiling to nearest 10,000 VND instead of Math.round. Confidence: 0.65
- Organize features by domain module (e.g., shifts module) rather than by report type; when a report-type feature fits better in a domain module, move it there and remove it from the report section. Confidence: 0.85
