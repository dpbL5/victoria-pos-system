/**
 * Tạo (hoặc cập nhật) tài khoản admin mặc định.
 *
 * Dùng khi DB trống và bạn chưa thể đăng nhập để gọi /api/seed.
 * Idempotent: chạy lại nhiều lần vẫn an toàn, mật khẩu sẽ được reset.
 *
 * Chạy: npm run seed:admin
 * Biến môi trường:
 *   ADMIN_USERNAME  (mặc định: admin)
 *   ADMIN_PASSWORD  (mặc định: admin123)
 *   ADMIN_FULL_NAME (mặc định: Quản trị viên)
 */
import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'
import { UserRole } from '@/generated/prisma/enums'
import bcrypt from 'bcryptjs'

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'superuser@victoria2026'
const ADMIN_FULL_NAME = process.env.ADMIN_FULL_NAME ?? 'Quản trị viên'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL chưa được cấu hình trong .env')
}

async function main() {
  if (ADMIN_PASSWORD.length < 6) {
    throw new Error('ADMIN_PASSWORD phải có ít nhất 6 ký tự')
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)

  const admin = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { username: ADMIN_USERNAME },
      update: {
        passwordHash,
        fullName: ADMIN_FULL_NAME,
        role: UserRole.ADMIN,
        isActive: true,
      },
      create: {
        username: ADMIN_USERNAME,
        passwordHash,
        fullName: ADMIN_FULL_NAME,
        role: UserRole.ADMIN,
        isActive: true,
      },
    })

    await tx.activityLog.create({
      data: {
        userId: user.id,
        action: 'SEED_ADMIN',
        entityType: 'User',
        entityId: user.id,
        details: {
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
        },
      },
    })

    return user
  })

  console.log('Tạo tài khoản admin thành công:')
  console.log(`  username : ${admin.username}`)
  console.log(`  fullName : ${admin.fullName}`)
  console.log(`  role     : ${admin.role}`)
  console.log('  password : ******** (đã hash)')

  if (ADMIN_PASSWORD === 'superuser@victoria2026') {
    console.warn('\n⚠️  Đang dùng mật khẩu mặc định. Hãy cấu hình ADMIN_PASSWORD trong .env.')
  }
}

main()
  .catch((err) => {
    console.error('Seed admin thất bại:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
