import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoiceDetailContent, type InvoiceDetail } from './invoice-detail-content'

// ── Thời gian nghỉ theo từng người chơi trên chi tiết hoá đơn ──

function invoiceWithMetadata(metadata: Record<string, unknown>): InvoiceDetail {
  return {
    id: 'inv-1',
    invoiceNo: 'INV-1',
    status: 'PAID',
    subtotal: 200000,
    discountTotal: 0,
    grandTotal: 200000,
    paidAt: '2026-10-31T10:00:00.000Z',
    notes: null,
    createdAt: '2026-10-31T09:00:00.000Z',
    customer: null,
    session: {
      id: 's-1',
      startTime: '2026-10-31T08:00:00.000Z',
      endTime: '2026-10-31T10:00:00.000Z',
      status: 'COMPLETED',
      totalPausedSeconds: 900,
    },
    shift: null,
    staff: { id: 'u-1', fullName: 'Nhân viên A' },
    items: [
      {
        id: 'item-1',
        type: 'PLAY_TIME',
        description: 'Giờ chơi khách vãng lai × 2 người',
        quantity: 2,
        unitPrice: 100000,
        subtotal: 200000,
        discountAmount: 0,
        total: 200000,
        product: null,
        metadata,
      },
    ],
    payments: [
      {
        id: 'pay-1',
        paymentMethod: 'CASH',
        grandTotal: 200000,
        paidAt: '2026-10-31T10:00:00.000Z',
        notes: null,
        staff: { id: 'u-1', fullName: 'Nhân viên A' },
      },
    ],
    membershipPayments: [],
  }
}

describe('InvoiceDetailContent — thời gian nghỉ', () => {
  it('hiện thời gian nghỉ của từng người chơi từ metadata.playerPauses', () => {
    const html = renderToStaticMarkup(
      <InvoiceDetailContent
        invoice={invoiceWithMetadata({
          playerPricing: [
            { id: 'p1', name: 'Lan', totalHours: 1, total: 100000 },
            { id: 'p2', name: 'Minh', totalHours: 1, total: 100000 },
          ],
          playerPauses: [
            { id: 'p1', name: 'Lan', pausedSeconds: 600 },
            { id: 'p2', name: 'Minh', pausedSeconds: 300 },
          ],
          pausedSeconds: 900,
        })}
      />
    )

    expect(html).toContain('Nghỉ 00:10:00')
    expect(html).toContain('Nghỉ 00:05:00')
  })

  it('hoá đơn cũ 1 người: fallback metadata.pausedSeconds', () => {
    const html = renderToStaticMarkup(
      <InvoiceDetailContent
        invoice={invoiceWithMetadata({ pausedSeconds: 900 })}
      />
    )

    expect(html).toContain('Tổng nghỉ 00:15:00')
  })

  it('hoá đơn cũ không có dữ liệu nghỉ: không hiện dòng nghỉ', () => {
    const html = renderToStaticMarkup(
      <InvoiceDetailContent invoice={invoiceWithMetadata({})} />
    )

    expect(html).not.toContain('Nghỉ')
  })
})
