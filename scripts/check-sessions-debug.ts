import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'
import { repositories } from '@/lib/infrastructure/repositories'

async function main() {
  try {
    const rows = await repositories.session.findMany({
      status: 'ACTIVE',
      customerId: undefined,
      date: undefined,
      skip: 0,
      take: 50,
    })
    console.log('findMany OK:', rows.total, 'rows')
  } catch (e) {
    console.error('findMany FAILED:', e)
  }

  try {
    const totals = await repositories.session.findSellItemTotals(['8d38d788-02a8-449e-8b24-7480f7fef3f5'])
    console.log('findSellItemTotals OK:', JSON.stringify(totals))
  } catch (e) {
    console.error('findSellItemTotals FAILED:', e)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
