// ── Shared CSV helpers — export báo cáo (Excel-safe) ─────

/** Escape 1 cell: chặn formula injection (= + - @ tab CR) + always-quote + nhân đôi dấu " */
export function escapeCsvCell(value: string): string {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  const escaped = safeValue.replaceAll('"', '""')
  return `"${escaped}"`
}

/** Xuất rows → CSV string, mỗi cell qua escapeCsvCell. `bom` thêm BOM cho Excel. */
export function toCsv(rows: string[][], options: { bom?: boolean } = {}): string {
  const body = rows
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n')
  return options.bom ? `\uFEFF${body}` : body
}
