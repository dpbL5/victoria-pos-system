// ── Use-case: checkIn — check-in khách vãng lai / hội viên ─────
import { err, ok } from '@/lib/shared/result'
import type { DomainError, Result } from '@/lib/shared/result'
import { fail, runInTransaction } from '@/lib/infrastructure/db-helpers'
import type { Repositories } from '@/lib/infrastructure/repositories'
import { repositories } from '@/lib/infrastructure/repositories'
import type { HttpErrorInfo } from '@/lib/infrastructure/api-helpers'
import { parseEndOfDay, parseStartOfDay } from '@/lib/shared/utils'
import type { PricingRuleSnapshot } from '@/types'

export interface CheckInInput {
  staffId: string
  customerId?: string
  /** Tên khách vãng lai (không bắt buộc — để trống thì tự đặt `Khách #NNN` theo số phiên trong ngày) */
  customerName?: string
  /** SĐT khách vãng lai (không bắt buộc — chỉ dùng khi không có customerId) */
  customerPhone?: string
  playerCount?: number
  now?: Date
}

export interface CheckInResult {
  id: string
  customerId: string | null
  staffId: string
  shiftId: string | null
  membershipId: string | null
  startTime: Date
  hourlyRate: number
  pricingRuleId: string | null
  pricingRuleSnapshot: PricingRuleSnapshot | null
  playerCount: number
  status: 'ACTIVE'
  customerPhone: string | null
  customer: { id: string | null; fullName: string; type: 'WALK_IN' | 'MEMBER' } | null
  membership: { id: string; startsAt: Date; expiresAt: Date } | null
  shift: { id: string; openedAt: Date; status: 'OPEN' | 'CLOSED' } | null
}

/**
 * Input cho transaction body — mọi resolve đã xong (pre-tx), chỉ cần ghi DB.
 * Tách riêng để unit test với fake repositories (pattern runCheckOutTx).
 */
export interface CheckInTxInput {
  staffId: string
  customerId: string | null
  /** Tên khách vãng lai (đã resolve `Khách #NNN` nếu không nhập) */
  customerName: string | null
  /** SĐT khách vãng lai (chỉ có khi không có customerId) */
  customerPhone?: string | null
  playerCount: number
  now: Date
  /** Có khi customer là MEMBER đang active */
  membershipId?: string
  /** Tổng số người chơi (từ playerCount) */
  totalPlayers: number
}

export async function checkIn(
  input: CheckInInput,
  deps: Repositories = repositories
): Promise<Result<CheckInResult>> {
  const { staffId, customerId, customerName, customerPhone, playerCount = 1, now = new Date() } = input

  if (!customerId) {
    return checkInAnonymousWalkIn({ staffId, customerName, customerPhone, playerCount, now })
  }

  return checkInRegisteredCustomer({ staffId, customerId, playerCount, now }, deps)
}

/** Kết quả transaction body — đủ cho entry để map thành CheckInResult */
export interface CheckInTxResult {
  id: string
  customerId: string | null
  staffId: string
  shiftId: string | null
  membershipId: string | null
  startTime: Date
  hourlyRate: number
  pricingRuleId: string | null
  pricingRuleSnapshot: PricingRuleSnapshot | null
  playerCount: number
  status: 'ACTIVE'
  customerPhone: string | null
  customer: { id: string | null; fullName: string; type: 'WALK_IN' | 'MEMBER' } | null
  membership: { id: string; startsAt: Date; expiresAt: Date } | null
  shift: { id: string; openedAt: Date; status: 'OPEN' | 'CLOSED' } | null
}

/**
 * Thân transaction — tách riêng để unit test với fake repositories.
 * Lỗi validation trong tx dùng fail() → throw RollbackSignal → rollback.
 */
export async function runCheckInTx(
  tx: Repositories,
  input: CheckInTxInput
): Promise<CheckInTxResult> {
  const {
    staffId,
    customerId,
    customerName,
    customerPhone,
    now,
    membershipId,
    totalPlayers,
  } = input

  // ── Dùng parseStartOfDay/parseEndOfDay để tính mốc ngày theo giờ Việt Nam (UTC+7) ──
  const todayStr = now.toISOString().slice(0, 10)
  const today = parseStartOfDay(todayStr)
  const tomorrow = parseEndOfDay(todayStr)
  // parseEndOfDay trả về 23:59:59.999 VN, cần +1ms để làm cận trên cho lt
  const tomorrowBoundary = new Date(tomorrow.getTime() + 1)

  // ── Khách vãng lai: không tạo Customer, lưu tên ngay trên phiên ──
  // customerName đã resolve `Khách #NNN` (theo số phiên trong ngày) nếu không nhập.
  let sessionCustomerName: string | null = customerName
  if (!customerId && !sessionCustomerName) {
    const todaySessionCount = await tx.session.countCreatedBetween(today, tomorrowBoundary)
    sessionCustomerName = `Khách #${String(todaySessionCount + 1).padStart(3, '0')}`
  }

  const openShift = await tx.shift.findOpenForStaff(staffId)
  if (!openShift) fail('SHIFT_REQUIRED')

  // ── Bảng giá không còn chọn lúc check-in: để trống, nhân viên chọn khi thu tiền ──
  const session = await tx.session.createWithRefs({
    customerId,
    customerName: sessionCustomerName,
    customerPhone: customerId ? null : (customerPhone ?? null),
    staffId,
    shiftId: openShift.id,
    membershipId,
    startTime: now,
    hourlyRate: 0,
    pricingRuleId: null,
    pricingRuleSnapshot: null,
    playerCount: totalPlayers,
  })

  // Luôn tạo 1 pricing group trống giá (bảng giá sẽ gán khi checkout)
  const group = await tx.session.createPricingGroup({
    sessionId: session.id,
    label: 'Nhóm 1',
    playerCount: totalPlayers,
    remainingCount: totalPlayers,
    hourlyRate: 0,
    pricingRuleId: null,
    pricingSnapshot: null,
  })

  // Tạo SessionPlayer cho từng người chơi (tên trống → UI đánh số "Người N",
  // pause riêng từng người). Phiên 1 người cũng tạo 1 row (nguồn dữ liệu đồng nhất).
  await tx.session.createPlayersForGroup(session.id, group.id, totalPlayers)

  await tx.audit.append({
    userId: staffId,
    action: 'SESSION_CHECK_IN',
    entityType: 'Session',
    entityId: session.id,
    details: {
      customerId,
      customerName: sessionCustomerName ?? session.customer?.fullName ?? null,
      customerPhone: session.customerPhone ?? null,
      customerType: session.customer?.type ?? 'WALK_IN',
      membershipId,
      shiftId: openShift.id,
      playerCount: totalPlayers,
    },
  })

  return {
    ...session,
    hourlyRate: Number(session.hourlyRate),
  } as CheckInTxResult
}

async function checkInAnonymousWalkIn(
  input: {
    staffId: string
    customerName?: string
    customerPhone?: string
    playerCount?: number
    now: Date
  }
): Promise<Result<CheckInResult>> {
  const { staffId, customerName, customerPhone, playerCount = 1, now } = input

  const totalPlayers = playerCount

  const result = await runInTransaction((tx) =>
    runCheckInTx(tx, {
      staffId,
      customerId: null,
      customerName: customerName ?? null,
      customerPhone: customerPhone?.trim() || null,
      playerCount,
      now,
      totalPlayers,
    })
  )

  if (!result.ok) return result
  return ok(result.value as CheckInResult)
}

async function checkInRegisteredCustomer(
  input: {
    staffId: string
    customerId: string
    playerCount?: number
    now: Date
  },
  deps: Repositories,
): Promise<Result<CheckInResult>> {
  const { staffId, customerId, playerCount = 1, now } = input

  // Validation trước transaction → return err
  const customer = await deps.customer.findById(customerId)
  if (!customer) return err('CUSTOMER_NOT_FOUND')

  const activeSession = await deps.session.findActiveByCustomer(customerId)
  if (activeSession) return err('ACTIVE_SESSION_EXISTS')

  let membershipId: string | undefined
  const totalPlayers = playerCount

  if (customer.type === 'MEMBER') {
    const activeMembership = await deps.membership.findActive(customer.id, now)
    if (!activeMembership) return err('MEMBERSHIP_REQUIRED')
    membershipId = activeMembership.id
  }

  const result = await runInTransaction((tx) =>
    runCheckInTx(tx, {
      staffId,
      customerId,
      customerName: null,
      playerCount,
      now,
      membershipId,
      totalPlayers,
    })
  )

  if (!result.ok) return result
  return ok(result.value as CheckInResult)
}

export function mapCheckInError(error: DomainError): HttpErrorInfo {
  switch (error.code) {
    case 'CUSTOMER_NOT_FOUND':
      return { code: 'CUSTOMER_NOT_FOUND', message: 'Không tìm thấy khách hàng', status: 404 }
    case 'ACTIVE_SESSION_EXISTS':
      return { code: 'ACTIVE_SESSION_EXISTS', message: 'Khách đang có phiên chơi chưa kết thúc', status: 400 }
    case 'MEMBERSHIP_REQUIRED':
      return {
        code: 'MEMBERSHIP_REQUIRED',
        message: 'Hội viên chưa có gói còn hiệu lực. Vui lòng gia hạn trước khi check-in.',
        status: 409,
      }
    case 'SHIFT_REQUIRED':
      return { code: 'SHIFT_REQUIRED', message: 'Cần mở hoặc tham gia ca trước khi check-in', status: 409 }
    default:
      return { code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }
  }
}
