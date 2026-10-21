import 'dotenv/config'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { prisma } from '../src/lib/infrastructure/prisma'

/**
 * Dọn dẹp dữ liệu do E2E tạo trên DB dev.
 *
 * Mọi thực thể E2E đặt tên/ghi chú bắt đầu bằng `[E2E] `, nên việc dọn chỉ nhắm
 * đúng nhãn đó — không xoá dữ liệu có sẵn của người dùng. Thứ tự xoá đi từ bản
 * ghi con (item/payment/movement) lên bản ghi cha để không vướng FK.
 */

const LABEL = '[E2E] '
const statePath = resolve(process.cwd(), '.e2e-state.json')

interface E2EState {
  joined?: { shiftId: string; staffId: string }
}

/**
 * Ca có sẵn của môi trường dev mà lượt chạy đã tham gia: gỡ lại đúng bản ghi
 * `ShiftParticipant` do E2E tạo để trạng thái dev trở về như trước khi chạy.
 */
async function releaseJoinedShift() {
  if (!existsSync(statePath)) return 0

  const state = JSON.parse(readFileSync(statePath, 'utf8')) as E2EState
  rmSync(statePath, { force: true })
  if (!state.joined) return 0

  const { count } = await prisma.shiftParticipant.deleteMany({
    where: { ...state.joined, leftAt: null },
  })
  return count
}

function assertDevDatabase() {
  if (process.env.E2E_ALLOW_DEV_DATABASE !== '1' || process.env.NODE_ENV === 'production') {
    throw new Error('Dọn dẹp E2E chỉ chạy trên DB dev đã xác nhận (E2E_ALLOW_DEV_DATABASE=1).')
  }
}

async function collectIds() {
  const [products, rules, sessions, bookings, shifts] = await Promise.all([
    prisma.product.findMany({ where: { name: { startsWith: LABEL } }, select: { id: true } }),
    prisma.pricingRule.findMany({ where: { name: { startsWith: LABEL } }, select: { id: true } }),
    prisma.session.findMany({ where: { customerName: { startsWith: LABEL } }, select: { id: true } }),
    prisma.booking.findMany({ where: { customerName: { startsWith: LABEL } }, select: { id: true } }),
    prisma.shift.findMany({ where: { notes: { startsWith: LABEL } }, select: { id: true } }),
  ])

  const productIds = products.map((row) => row.id)
  const ruleIds = rules.map((row) => row.id)
  const sessionIds = sessions.map((row) => row.id)
  const bookingIds = bookings.map((row) => row.id)
  const shiftIds = shifts.map((row) => row.id)

  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { sessionId: { in: sessionIds } },
        { items: { some: { productId: { in: productIds } } } },
      ],
    },
    select: { id: true },
  })
  const invoiceIds = invoices.map((row) => row.id)

  const payments = await prisma.payment.findMany({
    where: { OR: [{ invoiceId: { in: invoiceIds } }, { sessionId: { in: sessionIds } }] },
    select: { id: true },
  })

  const items = await prisma.invoiceItem.findMany({
    where: { invoiceId: { in: invoiceIds } },
    select: { id: true },
  })

  return {
    productIds,
    ruleIds,
    sessionIds,
    bookingIds,
    shiftIds,
    invoiceIds,
    paymentIds: payments.map((row) => row.id),
    itemIds: items.map((row) => row.id),
  }
}

async function inspect() {
  const ids = await collectIds()
  console.log(JSON.stringify({
    products: ids.productIds.length,
    pricingRules: ids.ruleIds.length,
    sessions: ids.sessionIds.length,
    bookings: ids.bookingIds.length,
    shifts: ids.shiftIds.length,
    invoices: ids.invoiceIds.length,
    payments: ids.paymentIds.length,
    invoiceItems: ids.itemIds.length,
  }, null, 2))
}

async function cleanup() {
  const ids = await collectIds()
  const releasedParticipants = await releaseJoinedShift()

  await prisma.stockMovement.deleteMany({
    where: {
      OR: [
        { productId: { in: ids.productIds } },
        { invoiceItemId: { in: ids.itemIds } },
      ],
    },
  })
  await prisma.payment.deleteMany({ where: { id: { in: ids.paymentIds } } })
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: ids.invoiceIds } } })
  await prisma.invoice.deleteMany({ where: { id: { in: ids.invoiceIds } } })
  await prisma.session.deleteMany({ where: { id: { in: ids.sessionIds } } })
  await prisma.booking.deleteMany({ where: { id: { in: ids.bookingIds } } })
  await prisma.pricingTier.deleteMany({ where: { ruleId: { in: ids.ruleIds } } })
  await prisma.pricingRule.deleteMany({ where: { id: { in: ids.ruleIds } } })
  await prisma.product.deleteMany({ where: { id: { in: ids.productIds } } })

  // Ca E2E chỉ xoá được khi không còn bản ghi nào tham chiếu tới nó.
  const deletedShifts = await prisma.shift.deleteMany({
    where: {
      id: { in: ids.shiftIds },
      invoices: { none: {} },
      payments: { none: {} },
      sessions: { none: {} },
    },
  })

  const entityIds = [
    ...ids.productIds,
    ...ids.ruleIds,
    ...ids.sessionIds,
    ...ids.bookingIds,
    ...ids.invoiceIds,
    ...ids.paymentIds,
  ]
  await prisma.activityLog.deleteMany({ where: { entityId: { in: entityIds } } })

  console.log(JSON.stringify({
    cleaned: {
      products: ids.productIds.length,
      pricingRules: ids.ruleIds.length,
      sessions: ids.sessionIds.length,
      bookings: ids.bookingIds.length,
      invoices: ids.invoiceIds.length,
      payments: ids.paymentIds.length,
      shiftsDeleted: deletedShifts.count,
      shiftsKept: ids.shiftIds.length - deletedShifts.count,
      shiftParticipantsReleased: releasedParticipants,
    },
  }, null, 2))
}

async function main() {
  assertDevDatabase()
  const action = process.argv[2]
  if (action === 'inspect') await inspect()
  else if (action === 'cleanup') await cleanup()
  else throw new Error('Dùng: tsx e2e/e2e-data.ts inspect|cleanup')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
