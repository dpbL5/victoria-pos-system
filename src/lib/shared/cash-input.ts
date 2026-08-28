export interface CashInputResult {
  value: string
  caret: number
}

export function normalizeCashInput(value: string, caret = value.length): CashInputResult {
  const digits = value.replace(/\D/g, '')
  const digitsBeforeCaret = value.slice(0, caret).replace(/\D/g, '')
  return {
    value: formatCashInput(digits),
    caret: formatCashInput(digitsBeforeCaret).length,
  }
}

export function cashInputToNumber(value: string): number {
  return Number(value.replace(/\D/g, '')) || 0
}

export function formatCashInput(value: number | string): string {
  const digits = String(value).replace(/\D/g, '')
  return digits ? new Intl.NumberFormat('vi-VN').format(Number(digits)) : ''
}

export interface CashInputSuggestion {
  value: number
  label: string
}

export function getCashInputSuggestions(value: string): CashInputSuggestion[] {
  const amount = cashInputToNumber(value)
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 10_000_000) return []

  return [
    { value: amount * 1_000, label: formatCashInput(amount * 1_000) },
    { value: amount * 1_000_000, label: formatCashInput(amount * 1_000_000) },
  ]
}
