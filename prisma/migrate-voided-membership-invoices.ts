/**
 * Migration data: sửa các hoá đơn phí hội viên đã bị huỷ TRƯỚC khi có fix.
 *
 * Bối cảnh:
 * - Trước đây `voidInvoice` chỉ đánh dấu hoá đơn CANCELLED, KHÔNG đụng tới kỳ
 *   hội viên → `Membership` vẫn ACTIVE dù hoá đơn phí đã bị huỷ, và
 *   `Customer.totalSpent` vẫn còn cộng khoản phí đó.
 * - Hệ quả kèm theo: nếu sau đó khách GIA HẠN, kỳ mới nối tiếp sau kỳ đáng lẽ
 *   đã huỷ (`startsAt = kỳ bị huỷ.expiresAt`) → thời hạn bị cộng dồn.
 * - Nay void sẽ tự huỷ kỳ + kỳ gia hạn chỉ nối vào kỳ ACTIVE, nên không còn dồn.
 *   Script này backfill cho dữ liệu đã lỡ huỷ trước đó.
 *
 * Nhận diện qua HOÁ ĐƠN: mọi invoice `MEM*` status CANCELLED có item
 * `MEMBERSHIP_FEE` (đọc `metadata.membershipId`). Dùng hoá đơn thay vì
 * `Payment.kind=MEMBERSHIP` vì dữ liệu cũ (trước STI) có payment kind OPERATIONAL.
 *
 * Xử lý mỗi kỳ bị huỷ A (từ hoá đơn CANCELLED):
 * 1. Nếu A.status ACTIVE → A.status = CANCELLED + trừ totalSpent (grandTotal hoá đơn).
 * 2. Dịch lùi các kỳ GIA HẠN nối liền sau A (`startsAt == A.expiresAt`) đúng bằng
 *    thời lượng của A — NHƯNG chỉ với kỳ được tạo SAU thời điểm void. Kỳ gia hạn
 *    đã có TRƯỚC khi void giữ nguyên (lựa chọn "chỉ huỷ đúng kỳ đó").
 * 3. Ghi ActivityLog MEMBERSHIP_CANCEL / MEMBERSHIP_PERIOD_SHIFT (nguồn: migration).
 *
 * Idempotent: kỳ đã CANCELLED không bị huỷ lại; kỳ đã dịch không còn khớp chuỗi.
 *
 * Chạy thử (không ghi): DRY_RUN=1 npm run migrate:voided-membership-invoices
 * Chạy thật:           npm run migrate:voided-membership-invoices
 */
import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'
import { addMonthsKeepingDay } from '@/lib/memberships/helpers'

const fmt = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '?')

function getMembershipId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const id = (metadata as Record<string, unknown>).membershipId
  return typeof id === 'string' ? id : null
}

interface ChainShift {
  id: string
  fromStart: Date
  fromEnd: Date
  newStarts: Date
  newExpires: Date
}

/**
 * Các kỳ gia hạn nối liền sau kỳ bị huỷ VÀ được tạo sau thời điểm void.
 * Rỗng nếu không có, hoặc không tìm thấy log void (an toàn: không dịch).
 */
async function buildChainShifts(input: {
  customerId: string | null
  invoiceId: string | null
  cancelledId: string
  aStarts: Date
  aExpires: Date
}): Promise<ChainShift[]> {
  const { customerId, invoiceId, cancelledId, aStarts, aExpires } = input
  if (!customerId || !invoiceId) return []

  const voidLog = await prisma.activityLog.findFirst({
    where: { action: 'INVOICE_VOID', entityId: invoiceId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  if (!voidLog) {
    console.warn('    ⚠ Không thấy log INVOICE_VOID — bỏ qua dịch kỳ nối tiếp')
    return []
  }

  const delta = aExpires.getTime() - aStarts.getTime()
  const chain = await prisma.membership.findMany({
    where: { customerId, id: { not: cancelledId }, startsAt: { gte: aExpires } },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      startsAt: true,
      expiresAt: true,
      createdAt: true,
      plan: { select: { durationMonths: true } },
    },
  })

  const shifts: ChainShift[] = []
  let cursor = aExpires.getTime()
  let newCursor = aStarts
  for (const m of chain) {
    if (m.startsAt.getTime() !== cursor) break // đứt chuỗi → dừng
    if (m.createdAt.getTime() <= voidLog.createdAt.getTime()) break // kỳ có trước void → giữ nguyên
    const months = m.plan?.durationMonths
    // Dịch lùi về đúng vị trí: bắt đầu ở mốc trước đó, giữ độ dài theo THÁNG (như
    // calculateRenewalPeriod lúc đăng ký) — tránh lệch ngày do trừ mili-giây.
    const newStarts = new Date(newCursor)
    const newExpires = months && months > 0
      ? addMonthsKeepingDay(newStarts, months)
      : new Date(m.expiresAt.getTime() - delta)
    shifts.push({
      id: m.id,
      fromStart: m.startsAt,
      fromEnd: m.expiresAt,
      newStarts,
      newExpires,
    })
    cursor = m.expiresAt.getTime()
    newCursor = newExpires
  }
  return shifts
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL chưa được cấu hình trong .env')
  }
  const dryRun = process.env.DRY_RUN === '1'

  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? '').host } catch { return 'unknown' }
  })()
  console.log(`DB đang sửa: ${host}${dryRun ? ' (DRY RUN — chỉ đọc)' : ''}`)

  const invoices = await prisma.invoice.findMany({
    where: { invoiceNo: { startsWith: 'MEM' }, status: 'CANCELLED' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      invoiceNo: true,
      grandTotal: true,
      staffId: true,
      customer: { select: { fullName: true } },
      items: { where: { type: 'MEMBERSHIP_FEE' }, select: { metadata: true } },
    },
  })

  console.log(`Tìm thấy ${invoices.length} hoá đơn phí hội viên đã huỷ`)

  let cancelled = 0
  let shifted = 0
  for (const inv of invoices) {
    const membershipId = inv.items.map((i) => getMembershipId(i.metadata)).find((id): id is string => !!id)
    if (!membershipId) {
      console.warn(`  ⚠ ${inv.invoiceNo}: không đọc được membershipId trong item — bỏ qua`)
      continue
    }

    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        expiresAt: true,
        customerId: true,
        plan: { select: { name: true } },
      },
    })
    if (!membership) {
      console.warn(`  ⚠ ${inv.invoiceNo}: không tìm thấy kỳ ${membershipId} — bỏ qua`)
      continue
    }

    const needsCancel = membership.status === 'ACTIVE'
    const amount = Number(inv.grandTotal)
    const who = inv.customer?.fullName ?? membership.customerId

    const plan = await buildChainShifts({
      customerId: membership.customerId,
      invoiceId: inv.id,
      cancelledId: membership.id,
      aStarts: membership.startsAt,
      aExpires: membership.expiresAt,
    })

    if (!needsCancel && plan.length === 0) continue // đã xử lý xong, không còn gì lệch

    const cancelNote = needsCancel ? `CANCELLED, trừ ${amount}` : 'đã CANCELLED (giữ nguyên)'

    if (dryRun) {
      if (needsCancel) cancelled += 1
      shifted += plan.length
      console.log(`  • [dry] ${who} — ${inv.invoiceNo} — kỳ ${fmt(membership.startsAt)}→${fmt(membership.expiresAt)}: ${cancelNote}`)
      for (const s of plan) {
        console.log(`      ↳ dịch kỳ nối tiếp ${fmt(s.fromStart)}→${fmt(s.fromEnd)}  thành  ${fmt(s.newStarts)}→${fmt(s.newExpires)}`)
      }
      continue
    }

    await prisma.$transaction(async (tx) => {
      if (needsCancel) {
        const res = await tx.membership.updateMany({
          where: { id: membershipId, status: 'ACTIVE' },
          data: { status: 'CANCELLED' },
        })
        if (res.count === 0) return
        await tx.customer.update({
          where: { id: membership.customerId },
          data: { totalSpent: { decrement: amount } },
        })
        cancelled += 1
      }

      for (const s of plan) {
        await tx.membership.update({
          where: { id: s.id },
          data: { startsAt: s.newStarts, expiresAt: s.newExpires },
        })
        shifted += 1
        console.log(`      ↳ dịch kỳ nối tiếp ${fmt(s.fromStart)}→${fmt(s.fromEnd)}  thành  ${fmt(s.newStarts)}→${fmt(s.newExpires)}`)
      }

      await tx.activityLog.create({
        data: {
          userId: inv.staffId,
          action: needsCancel ? 'MEMBERSHIP_CANCEL' : 'MEMBERSHIP_PERIOD_SHIFT',
          entityType: 'Membership',
          entityId: membership.id,
          details: {
            source: 'migrate-voided-membership-invoices',
            customerId: membership.customerId,
            customerName: inv.customer?.fullName ?? null,
            invoiceId: inv.id,
            invoiceNo: inv.invoiceNo,
            planName: membership.plan?.name ?? null,
            startsAt: membership.startsAt.toISOString(),
            expiresAt: membership.expiresAt.toISOString(),
            refundedSpend: needsCancel ? amount : 0,
            shiftedMemberships: plan.length,
            shiftedMembershipIds: plan.map((s) => s.id),
          },
        },
      })

      console.log(`  ✓ ${who} — ${inv.invoiceNo} — kỳ ${fmt(membership.startsAt)}→${fmt(membership.expiresAt)}: ${cancelNote}`)
    })
  }

  console.log('Hoàn tất:')
  console.log(`  - Kỳ hội viên đã huỷ thêm: ${cancelled}`)
  console.log(`  - Kỳ gia hạn nối tiếp đã dịch lại: ${shifted}`)
  if (dryRun) console.log('  (DRY RUN — chưa ghi gì)')

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('Migration thất bại:', error)
  process.exit(1)
})
