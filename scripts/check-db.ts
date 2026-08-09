import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'

async function check() {
  try {
    const userCount = await prisma.user.count()
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'app'
      ORDER BY table_name
    `

    const dbUrl = process.env.DATABASE_URL ?? ""
    const host = (() => { try { return new URL(dbUrl).host } catch { return "unknown" } })()
    const dbName = (() => { try { return new URL(dbUrl).pathname.replace("/", "") || "unknown" } catch { return "unknown" } })()

    console.log('✅ Kết nối Postgres thành công')
    console.log(`   Host     : ${host}`)
    console.log(`   DB       : ${dbName}`)
    console.log(`   Users    : ${userCount}`)
    console.log(`   Admin    : ${admin ? admin.username : 'không có'}`)
    console.log(`   Tables   : ${(tables as { table_name: string }[]).map((t) => t.table_name).join(', ')}`)
  } catch (error) {
    console.error('❌ Kết nối Postgres thất bại:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

check()
