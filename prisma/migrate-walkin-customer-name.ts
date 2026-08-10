/**
 * Migration data: dọn customer WALK_IN phát sinh từ check-in vãng lai cũ.
 *
 * Bối cảnh:
 * - UI cũ tạo 1 Customer (type=WALK_IN, không phone) cho mỗi check-in vãng lai,
 *   dù tên là do nhân viên nhập tay (không phải "Khách #...").
 * - Nay Session.customerId nullable + Session.customerName — khách vãng lai
 *   chỉ lưu tên trên phiên, không cần Customer trong DB.
 *
 * Tiêu chí "khách vãng lai phát sinh" (an toàn để dọn):
 *   type = WALK_IN, phone = null, KHÔNG có membership.
 * Customer có membership (hội viên) hoặc có phone → giữ nguyên.
 *
 * Cách xử lý cho từng customer thoả tiêu chí:
 * 1. Gán tên đang có lên Session.customerName, detach session khỏi customer.
 * 2. Detach invoice khỏi customer (invoice.customerId → null).
 * 3. MembershipPayment không thể tồn tại (không có membership) — kiểm tra an toàn.
 * 4. Xoá customer nếu không còn liên kết (session/invoice/membership/membershipPayment).
 *
 * Idempotent: chạy lại nhiều lần vẫn an toàn.
 *
 * Chạy: npm run migrate:walkin-customer-name
 */
import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL chưa được cấu hình trong .env')
  }

  // ── 1. Chọn customer vãng lai phát sinh: WALK_IN, không phone, không membership ──
  const candidates = await prisma.customer.findMany({
    where: {
      type: 'WALK_IN',
      phone: null,
      memberships: { none: {} },
    },
    select: { id: true, fullName: true },
  })

  console.log(`Tìm thấy ${candidates.length} khách vãng lai phát sinh cần dọn`)

  let movedSessions = 0
  let movedInvoices = 0
  let deletedCustomers = 0
  let skipped = 0

  for (const customer of candidates) {
    await prisma.$transaction(async (tx) => {
      // ── 2a. Copy tên lên session + detach ──
      const sessionUpdate = await tx.session.updateMany({
        where: { customerId: customer.id },
        data: { customerName: customer.fullName, customerId: null },
      })
      movedSessions += sessionUpdate.count

      // ── 2b. Detach invoice ──
      const invoiceUpdate = await tx.invoice.updateMany({
        where: { customerId: customer.id },
        data: { customerId: null },
      })
      movedInvoices += invoiceUpdate.count

      // ── 3. Kiểm tra an toàn trước khi xoá ──
      const stillLinked =
        (await tx.session.count({ where: { customerId: customer.id } })) +
        (await tx.invoice.count({ where: { customerId: customer.id } })) +
        (await tx.membership.count({ where: { customerId: customer.id } })) +
        (await tx.membershipPayment.count({ where: { customerId: customer.id } }))

      if (stillLinked === 0) {
        await tx.customer.delete({ where: { id: customer.id } })
        deletedCustomers += 1
      } else {
        console.warn(`⚠ Bỏ qua xoá customer ${customer.id} ("${customer.fullName}") — vẫn còn ${stillLinked} liên kết`)
        skipped += 1
      }
    })
  }

  console.log('Hoàn tất:')
  console.log(`  - Phiên được gán tên khách: ${movedSessions}`)
  console.log(`  - Hoá đơn detach khỏi customer: ${movedInvoices}`)
  console.log(`  - Customer đã xoá: ${deletedCustomers}`)
  console.log(`  - Bỏ qua (còn liên kết): ${skipped}`)
}

main()
  .catch((error) => {
    console.error('Migration thất bại:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
