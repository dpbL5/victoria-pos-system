// ── Backfill restore: áp kind=MEMBERSHIP cho payments từ backup ─────
// Chạy SAU `prisma db push --accept-data-loss` (đã thêm cột kind + drop bảng cũ).
// Đọc dữ liệu từ scripts/_mp-backup.json (dump trước khi drop).
// Usage: npx tsx scripts/backfill-membership-payment.ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "fs";

interface MpRow {
  id: string
  invoice_id: string | null
  customer_id: string
  membership_id: string
  plan_id: string
}

async function main() {
  const dbUrl = process.env.DATABASE_URL!;
  const schema = new URL(dbUrl).searchParams.get("schema") ?? undefined;
  const adapter = new PrismaPg({ connectionString: dbUrl }, { schema });
  const prisma = new PrismaClient({ adapter });

  try {
    const mps = JSON.parse(readFileSync("scripts/_mp-backup.json", "utf8")) as MpRow[]
    console.log("Restoring from backup:", mps.length, "rows")

    let updated = 0
    for (const mp of mps) {
      if (!mp.invoice_id) {
        console.warn("SKIP (no invoiceId):", mp.id)
        continue
      }
      const res = await prisma.payment.updateMany({
        where: { invoiceId: mp.invoice_id, kind: "OPERATIONAL" },
        data: {
          kind: "MEMBERSHIP",
          customerId: mp.customer_id,
          membershipId: mp.membership_id,
          planId: mp.plan_id,
        },
      })
      updated += res.count
      if (res.count === 0) console.warn("No matching OPERATIONAL payment for invoice:", mp.invoice_id)
    }
    console.log("Payments updated to MEMBERSHIP:", updated)
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
