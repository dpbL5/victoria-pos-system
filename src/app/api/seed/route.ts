import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

function generatePassword(): string {
  return randomBytes(8).toString('hex') // 16-char random hex
}

export async function POST() {
  // Chỉ admin mới được seed
  try {
    await requireAdmin()
  } catch {
    await prisma.appSetting.upsert({
      where: { key: 'PARKING_FEE_UNIT_PRICE' },
      update: {},
      create: {
        key: 'PARKING_FEE_UNIT_PRICE',
        value: '5000',
        label: 'Phí gửi xe (VNĐ/xe)',
      },
    })

    return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 })
  }

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'Không khả dụng trong môi trường production' }, { status: 403 })
  }

  try {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || generatePassword()
    const staffPassword = process.env.SEED_STAFF_PASSWORD || generatePassword()

    const adminHash = await bcrypt.hash(adminPassword, 12)
    const admin = await prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        passwordHash: adminHash,
        fullName: 'Quản trị viên',
        role: 'ADMIN',
      },
    })

    const staffHash = await bcrypt.hash(staffPassword, 12)
    await prisma.user.upsert({
      where: { username: 'staff' },
      update: {},
      create: {
        username: 'staff',
        passwordHash: staffHash,
        fullName: 'Nhân viên POS',
        role: 'STAFF',
      },
    })

    await prisma.activityLog.deleteMany()
    await prisma.stockMovement.deleteMany()
    await prisma.membershipPayment.deleteMany()
    await prisma.payment.deleteMany()
    await prisma.invoiceItem.deleteMany()
    await prisma.invoice.deleteMany()
    await prisma.session.deleteMany()
    await prisma.membership.deleteMany()
    await prisma.shift.deleteMany()
    await prisma.product.deleteMany()
    await prisma.membershipPlan.deleteMany()
    await prisma.pricingRule.deleteMany()
    await prisma.customer.deleteMany()

    const membershipPlan = await prisma.membershipPlan.create({
      data: {
        name: 'Gói tháng tiêu chuẩn',
        durationMonths: 1,
        price: 1200000,
      },
    })

    const now = new Date()
    const nextMonth = new Date(now)
    nextMonth.setMonth(nextMonth.getMonth() + 1)

    const [walkInA, memberB, memberC, expiredMemberD, walkInE] = await Promise.all([
      prisma.customer.create({ data: { fullName: 'Nguyễn Văn A', phone: '0912345678', type: 'WALK_IN' } }),
      prisma.customer.create({ data: { fullName: 'Trần Thị B', phone: '0987654321', type: 'MEMBER', totalHoursPlayed: 15, totalSpent: 1200000 } }),
      prisma.customer.create({ data: { fullName: 'Lê Văn C', phone: '0905123456', type: 'MEMBER', totalHoursPlayed: 25, totalSpent: 1200000 } }),
      prisma.customer.create({ data: { fullName: 'Phạm Thị D', phone: '0909876543', type: 'MEMBER', totalHoursPlayed: 80, totalSpent: 1200000 } }),
      prisma.customer.create({ data: { fullName: 'Hoàng Văn E', phone: '0913555777', type: 'WALK_IN' } }),
    ])

    const expiredStart = new Date(now)
    expiredStart.setMonth(expiredStart.getMonth() - 2)
    const expiredEnd = new Date(now)
    expiredEnd.setMonth(expiredEnd.getMonth() - 1)

    await Promise.all([
      prisma.membership.create({
        data: {
          customerId: memberB.id,
          planId: membershipPlan.id,
          startsAt: now,
          expiresAt: nextMonth,
        },
      }),
      prisma.membership.create({
        data: {
          customerId: memberC.id,
          planId: membershipPlan.id,
          startsAt: now,
          expiresAt: nextMonth,
        },
      }),
      prisma.membership.create({
        data: {
          customerId: expiredMemberD.id,
          planId: membershipPlan.id,
          startsAt: expiredStart,
          expiresAt: expiredEnd,
        },
      }),
    ])

    await Promise.all([
      prisma.pricingRule.create({
        data: {
          name: 'Ngày thường trước 17:00',
          daysOfWeek: [1, 2, 3, 4, 5],
          hourFrom: 0,
          hourTo: 17,
          ratePerHour: 150000,
          dayType: 'WEEKDAY',
          effectiveFrom: new Date('2026-01-01'),
        },
      }),
      prisma.pricingRule.create({
        data: {
          name: 'Ngày thường từ 17:00',
          daysOfWeek: [1, 2, 3, 4, 5],
          hourFrom: 17,
          hourTo: 24,
          ratePerHour: 180000,
          dayType: 'WEEKDAY',
          effectiveFrom: new Date('2026-01-01'),
        },
      }),
      prisma.pricingRule.create({
        data: {
          name: 'Cuối tuần',
          daysOfWeek: [0, 6],
          hourFrom: 0,
          hourTo: 24,
          ratePerHour: 200000,
          dayType: 'WEEKEND',
          effectiveFrom: new Date('2026-01-01'),
        },
      }),
    ])

    const products = await Promise.all([
      prisma.product.create({
        data: {
          name: 'Nước suối',
          sku: 'DRINK-WATER',
          type: 'PRODUCT',
          price: 10000,
          costPrice: 5000,
          stockQuantity: 50,
          minStockLevel: 10,
        },
      }),
      prisma.product.create({
        data: {
          name: 'Nước điện giải',
          sku: 'DRINK-ION',
          type: 'PRODUCT',
          price: 20000,
          costPrice: 12000,
          stockQuantity: 30,
          minStockLevel: 10,
        },
      }),
      prisma.product.create({
        data: {
          name: 'Thuê cung nâng cao',
          sku: 'SERVICE-BOW-ADV',
          type: 'SERVICE',
          price: 50000,
        },
      }),
    ])

    await Promise.all(
      products
        .filter((product) => product.type === 'PRODUCT' && product.stockQuantity > 0)
        .map((product) =>
          prisma.stockMovement.create({
            data: {
              productId: product.id,
              staffId: admin.id,
              type: 'RESTOCK',
              quantity: product.stockQuantity,
              unitCost: product.costPrice,
              reason: 'Seed tồn đầu kỳ',
            },
          })
        )
    )

    return NextResponse.json({
      success: true,
      message: 'Seed hoàn tất! Lưu lại mật khẩu — chúng sẽ không hiển thị lại.',
      accounts: [
        { role: 'Admin', username: 'admin', password: adminPassword },
        { role: 'Staff', username: 'staff', password: staffPassword },
      ],
      counts: {
        customers: [walkInA, memberB, memberC, expiredMemberD, walkInE].length,
        membershipPlans: 1,
        pricingRules: 3,
        products: products.length,
      },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
