import 'dotenv/config'
import { prisma } from '@/lib/infrastructure/prisma'
import { findOpenShiftForStaff } from '@/lib/shifts'

async function main() {
  const shifts = await prisma.shift.findMany({
    select: {
      id: true,
      staffId: true,
      status: true,
      openedAt: true,
      openSlot: true,
      participants: { select: { staffId: true, role: true, leftAt: true } },
    },
    orderBy: { openedAt: 'desc' },
    take: 10,
  })
  console.log('=== SHIFTS ===')
  console.log(JSON.stringify(shifts, null, 2))

  const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, isActive: true } })
  console.log('=== USERS ===')
  console.log(JSON.stringify(users, null, 2))

  // Thử findOpenShiftForStaff cho từng user
  for (const u of users) {
    const s = await findOpenShiftForStaff(prisma, u.id)
    console.log(`findOpenShiftForStaff(${u.username}):`, s ? `FOUND ${s.id} (${s.status})` : 'null')
    if (s) {
      console.log(`  participants:`, JSON.stringify(s.participants.map(p => ({ staffId: p.staff.id, leftAt: p.leftAt, role: p.role }))))
    }
  }

  // Mô phỏng openOrJoinShift cho từng user (chỉ đọc — không ghi)
  const openOperational = await prisma.shift.findFirst({ where: { status: 'OPEN' }, select: { id: true, staffId: true } })
  console.log('=== openOperational:', openOperational ? openOperational.id : 'none')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
