import { randomUUID } from 'node:crypto'

export function generateInvoiceNo(prefix = 'INV', at: Date = new Date()) {
  const yyyy = at.getFullYear()
  const mm = String(at.getMonth() + 1).padStart(2, '0')
  const dd = String(at.getDate()).padStart(2, '0')
  const hh = String(at.getHours()).padStart(2, '0')
  const mi = String(at.getMinutes()).padStart(2, '0')
  const ss = String(at.getSeconds()).padStart(2, '0')
  const suffix = randomUUID().slice(0, 8).toUpperCase()

  return `${prefix}-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${suffix}`
}
