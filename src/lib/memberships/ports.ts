// ── Ports — repository interfaces cho domain memberships ─────
import type { Prisma } from '@/generated/prisma/client'

export type MembershipWithPlan = Prisma.MembershipGetPayload<{ include: { plan: true } }>
export type PlanRecord = Prisma.MembershipPlanGetPayload<object>
export type CustomerRecord = Prisma.CustomerGetPayload<object>
/** Dòng khách hàng trong danh sách — notes cố ý loại ra (có thể chứa PII) */
export type CustomerListRow = Prisma.CustomerGetPayload<{
  select: {
    id: true
    fullName: true
    phone: true
    type: true
    totalHoursPlayed: true
    totalSpent: true
    createdAt: true
    updatedAt: true
  }
}>

export interface MembershipRepository {
  /** Membership ACTIVE mới nhất của khách hàng (không filter thời gian) */
  findLatest(customerId: string): Promise<MembershipWithPlan | null>
  /** Membership còn hiệu lực tại thời điểm `at` */
  findActive(customerId: string, at: Date): Promise<MembershipWithPlan | null>
  create(data: {
    customerId: string
    planId: string
    startsAt: Date
    expiresAt: Date
    status: 'ACTIVE'
  }): Promise<MembershipWithPlan>
  /** Lịch sử membership (include customer + plan, orderBy startsAt desc) — GET /api/memberships */
  findManyByCustomer(customerId?: string): Promise<MembershipWithPlan[]>
}

export interface MembershipPlanRepository {
  findById(id: string): Promise<PlanRecord | null>
  /** Danh sách gói (orderBy isActive desc, price asc) — GET /api/membership-plans */
  findMany(): Promise<PlanRecord[]>
  create(data: { name: string; durationMonths: number; price: number }): Promise<PlanRecord>
  update(id: string, data: { name?: string; durationMonths?: number; price?: number; isActive?: boolean }): Promise<PlanRecord>
  /** Số membership đang dùng gói — soft-delete check */
  countUsage(planId: string): Promise<number>
  delete(id: string): Promise<void>
}

export interface CustomerListInput {
  search?: string
  type?: 'WALK_IN' | 'MEMBER'
  skip: number
  take: number
}

export interface CustomerListResult {
  rows: CustomerListRow[]
  total: number
}

export interface CustomerRepository {
  /** Customer chưa bị xoá mềm (deletedAt null) */
  findById(id: string): Promise<CustomerRecord | null>
  /** Customer bất kể đã xoá hay chưa — dùng trong use-case xoá để phân biệt trạng thái */
  findByIdIncludingDeleted(id: string): Promise<CustomerRecord | null>
  /** Chi tiết khách + _count.sessions — GET /api/customers/[id] */
  findByIdWithCount(id: string): Promise<(CustomerRecord & { _count: { sessions: number } }) | null>
  create(data: {
    fullName: string
    phone?: string | null
    type: 'MEMBER' | 'WALK_IN'
  }): Promise<CustomerRecord>
  /** Danh sách khách (search/type + phân trang) — GET /api/customers */
  findMany(input: CustomerListInput): Promise<CustomerListResult>
  /** Cập nhật hồ sơ khách (phone rỗng → null) — PUT /api/customers/[id] */
  update(id: string, data: { fullName?: string; phone?: string | null; notes?: string }): Promise<CustomerRecord>
  /** Xoá mềm: set deletedAt — hội viên ẩn khỏi list/tìm kiếm nhưng giữ lịch sử tài chính */
  softDelete(id: string, at: Date): Promise<void>
  /** Cộng totalSpent; setTypeMember = true cũng đổi type sang MEMBER (khi gia hạn) */
  addSpend(customerId: string, amount: number, setTypeMember?: boolean): Promise<void>
  /** Cộng totalHoursPlayed + totalSpent (sau checkout) */
  recordPlay(customerId: string, input: { hours: number; spent: number }): Promise<void>
  /** Đếm khách vãng lai tạo trong khoảng thời gian (đặt tên khách #001...) */
  countWalkInsBetween(from: Date, to: Date): Promise<number>
}
