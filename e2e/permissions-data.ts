import 'dotenv/config'
import { prisma } from '../src/lib/infrastructure/prisma'

/**
 * Dọn dữ liệu E2E của spec permission matrix:
 * - user `e2e_perm_*` (không có dữ liệu nghiệp vụ — mọi thao tác đều bị chặn 403)
 * - role `[E2E] ...` do spec tạo
 *
 * Chỉ chạy trên DB dev đã xác nhận, và chỉ xoá đúng tiền tố E2E.
 */

const USER_PREFIX = 'e2e_perm_'
const ROLE_PREFIX = '[E2E] '

function assertDevDatabase() {
  if (process.env.E2E_ALLOW_DEV_DATABASE !== '1' || process.env.NODE_ENV === 'production') {
    throw new Error('Dọn dẹp E2E chỉ chạy trên DB dev đã xác nhận (E2E_ALLOW_DEV_DATABASE=1).')
  }
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: USER_PREFIX } },
    select: { id: true },
  })
  const userIds = users.map((user) => user.id)

  if (userIds.length > 0) {
    await prisma.activityLog.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  }

  // rolePermissions cascade theo Role; user đã xoá nên FK role_id không chặn
  const roles = await prisma.role.deleteMany({ where: { name: { startsWith: ROLE_PREFIX } } })

  console.log(JSON.stringify({ cleaned: { users: userIds.length, roles: roles.count } }, null, 2))
}

async function main() {
  assertDevDatabase()
  const action = process.argv[2]
  if (action === 'cleanup') await cleanup()
  else throw new Error('Dùng: tsx e2e/permissions-data.ts cleanup')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
