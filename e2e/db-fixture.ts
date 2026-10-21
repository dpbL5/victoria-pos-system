import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import { UserRole } from '../src/generated/prisma/enums'
import { prisma } from '../src/lib/infrastructure/prisma'

const statePath = resolve(process.cwd(), '.e2e-auth.json')

interface FixtureState {
  id: string
  username: string
  password: string
}

function assertFixtureAccess() {
  if (process.env.E2E_ALLOW_DEV_DATABASE !== '1' || process.env.NODE_ENV === 'production') {
    throw new Error('Fixture E2E chỉ được phép chạy trên DB development đã xác nhận.')
  }
}

async function createFixture() {
  const suffix = randomBytes(8).toString('hex')
  const username = `e2e_pw_${suffix}`
  const password = randomBytes(24).toString('base64url')
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      fullName: `Playwright E2E ${suffix}`,
      role: UserRole.ADMIN,
      isActive: true,
    },
  })

  const state: FixtureState = { id: user.id, username, password }
  await writeFile(statePath, JSON.stringify(state), 'utf8')
}

async function cleanupFixture() {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8')) as FixtureState
    // Audit log của ca/phiên do fixture tạo vẫn trỏ tới user — xoá trước.
    await prisma.activityLog.deleteMany({ where: { userId: state.id } })
    await prisma.user.delete({ where: { id: state.id } })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const users = await prisma.user.findMany({
      where: {
        username: { startsWith: 'e2e_pw_' },
        fullName: { startsWith: 'Playwright E2E ' },
      },
      select: { id: true },
    })
    await prisma.activityLog.deleteMany({
      where: { userId: { in: users.map((user) => user.id) } },
    })
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } })
  }
  await rm(statePath, { force: true })
}

async function main() {
  assertFixtureAccess()
  const action = process.argv[2]
  if (action === 'create') await createFixture()
  else if (action === 'cleanup') await cleanupFixture()
  else throw new Error('Dùng: tsx e2e/db-fixture.ts create|cleanup')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
