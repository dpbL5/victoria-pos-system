import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'

async function main() {
  try {
    const result = await prisma.$queryRawUnsafe(
      `SELECT unnest(enum_range(NULL::app."PromotionDiscountType"))::text as val`
    )
    console.log('Enum values:', JSON.stringify(result))
  } finally {
    await prisma.$disconnect()
  }
}

main()
