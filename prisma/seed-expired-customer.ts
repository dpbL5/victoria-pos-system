/**
 * Seed một MEMBER đã hết hạn vào DB hiện tại.
 * Không xoá dữ liệu cũ.
 *
 * Chạy: npm run seed:expired
 */
import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'
import bcrypt from 'bcryptjs'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL chưa được cấu hình trong .env')
}

async function main() {
  const plan = await prisma.membershipPlan.findFirst({ where: { isActive: true } })
  if (!plan) {
    throw new Error('Chưa có MembershipPlan nào. Hãy seed DB trước rồi thử lại.')
  }

  const now = new Date()
  const expiredStart = new Date(now)
  expiredStart.setMonth(expiredStart.getMonth() - 3)
  const expiredEnd = new Date(now)
  expiredEnd.setMonth(expiredEnd.getMonth() - 1)

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        fullName: 'Võ Thị Hết Hạn',
        phone: '0901000999',
        type: 'MEMBER',
        totalHoursPlayed: 0,
        totalSpent: 0,
      },
    })

    const membership = await tx.membership.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        startsAt: expiredStart,
        expiresAt: expiredEnd,
        status: 'ACTIVE',
      },
    })

    return { customer, membership }
  })

  console.log('Đã seed expired customer:')
  console.log(`  Tên        : ${result.customer.fullName}`)
  console.log(`  Phone      : ${result.customer.phone}`)
  console.log(`  Membership : ${result.membership.startsAt.toISOString().slice(0, 10)} → ${result.membership.expiresAt.toISOString().slice(0, 10)}`)
  console.log(`  Trạng thái : HẾT HẠN (expired)`)
}

main()
  .catch((err) => {
    console.error('Seed expired customer thất bại:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
