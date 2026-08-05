# workflow
- Keep documentation files (CLAUDE.md, AGENTS.md) in sync with structural code changes such as route consolidation, feature moves, or navigation updates. Confidence: 0.80
- Before implementing complex multi-file features, enter plan mode, explore existing code thoroughly, and write a structured implementation plan document covering all phases before starting. Confidence: 0.85
- When a user mentions multiple distinct features or changes, treat them as separate implementation tasks rather than bundling them into one plan. Confidence: 0.65
- Use `todo_write` to track phased, structured progress through complex features, updating individual task statuses as work progresses. Confidence: 0.75
- When a series of `edit_file` calls corrupts a file, read the full file and rewrite it entirely from scratch rather than attempting to fix broken incremental edits. Confidence: 0.80
- Organize tests by module/feature in `__tests__` directories, testing pure functions and Zod schemas with Vitest (`describe`/`it`/`expect` + `safeParse`). Confidence: 0.85
- Verify changes in this order: typecheck first (`tsc --noEmit`), then run tests (`vitest run`), then production build (`next build`). Confidence: 0.70
