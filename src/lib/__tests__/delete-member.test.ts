import { describe, it, expect, vi } from 'vitest'

// Mock prisma singleton — delete-member import runInTransaction (db-helpers → prisma).
vi.mock('@/lib/infrastructure/prisma', () => ({ prisma: {} }))

import { deleteMember, runDeleteMemberTx, mapDeleteMemberError } from '@/lib/memberships/use-cases/delete-member'
import type { Repositories } from '@/lib/infrastructure/repositories'

function makeRepositories(overrides: Partial<Repositories> = {}): Repositories {
  const base: Repositories = {
    billing: {
      findVoidTarget: vi.fn(),
      findMergedDraftItems: vi.fn(),
      reverseStock: vi.fn(),
      markInvoiceCancelled: vi.fn(),
      createPaidInvoice: vi.fn(),
      createPayment: vi.fn(),
      createMembershipPayment: vi.fn(),
      createInvoiceItem: vi.fn(),
      updateInvoiceTotals: vi.fn(),
      findByIdForEdit: vi.fn(),
      deleteInvoiceItems: vi.fn(),
      deletePayments: vi.fn(),
      updateInvoiceFinancials: vi.fn(),
      findByIdWithDetails: vi.fn(),
      findByIdForDelete: vi.fn(),
      countLinkedTransactions: vi.fn(),
      deleteInvoiceWithItems: vi.fn(),
      findInvoicesByCustomer: vi.fn(),
      countPaidBySession: vi.fn(async () => 0),
    },
    audit: { append: vi.fn(async () => {}), findMany: vi.fn() },
    membership: { findLatest: vi.fn(), findActive: vi.fn(), create: vi.fn(), findManyByCustomer: vi.fn() },
    membershipPlan: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), countUsage: vi.fn(), delete: vi.fn() },
    customer: {
      findById: vi.fn(),
      findByIdIncludingDeleted: vi.fn(async () => ({
        id: 'cust-1',
        fullName: 'Nguyễn Văn A',
        phone: '0901234567',
        type: 'MEMBER' as const,
        deletedAt: null,
        totalHoursPlayed: 0 as never,
        totalSpent: 0 as never,
        notes: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      })),
      findByIdWithCount: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(async () => {}),
      addSpend: vi.fn(),
      recordPlay: vi.fn(),
      findByPhone: vi.fn(),
      countWalkInsBetween: vi.fn(),
    },
    shift: {
      findOpenForStaff: vi.fn(async () => ({ id: 'shift-1' }) as never),
      findOpenOperational: vi.fn(),
      findByIdForClose: vi.fn(),
      calculateExpectedCash: vi.fn(),
      markParticipantsLeft: vi.fn(),
      upsertToolCloseCount: vi.fn(),
      upsertToolOpenCount: vi.fn(),
      close: vi.fn(),
      upsertParticipant: vi.fn(),
      findByIdOrThrow: vi.fn(),
      createWithLead: vi.fn(),
      update: vi.fn(),
      findByIdWithToolStats: vi.fn(),
      findByIdAccess: vi.fn(),
      findManyWithCount: vi.fn(),
      findByIdExport: vi.fn(),
      adjustCashDifference: vi.fn(),
    },
    pricing: {
      findApplicableRule: vi.fn(),
      findByIdWithTiers: vi.fn(),
      getApplicableRules: vi.fn(),
      countApplicable: vi.fn(),
      countAll: vi.fn(),
      findOverlapping: vi.fn(),
      findManyWithTiers: vi.fn(),
      findById: vi.fn(),
      createWithTiers: vi.fn(),
      update: vi.fn(),
      deleteTiersByRule: vi.fn(),
      createTiers: vi.fn(),
      delete: vi.fn(),
    },
    promotions: { findAvailable: vi.fn(), findAvailableById: vi.fn(), findOverlapping: vi.fn(), findMany: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    settings: { get: vi.fn(), getNumeric: vi.fn(), upsert: vi.fn(), getWithLabel: vi.fn(), findAll: vi.fn() },
    session: {
      findByIdForCheckout: vi.fn(),
      findByIdWithCustomer: vi.fn(),
      findActiveByCustomer: vi.fn(async () => null),
      findMany: vi.fn(),
      findByIdForPreview: vi.fn(),
      findSellItemTotals: vi.fn(async () => ({})),
      findSellItems: vi.fn(async () => []),
      addSellItem: vi.fn(async () => {}),
      removeSellItems: vi.fn(async () => {}),
      clearSellItems: vi.fn(async () => {}),
      countCreatedBetween: vi.fn(async () => 0),
      createWithRefs: vi.fn(),
      createPricingGroup: vi.fn(async () => ({ id: 'group-1' })),
      createPlayersForGroup: vi.fn(async () => {}),
      updatePricingGroup: vi.fn(),
      update: vi.fn(),
      decrementGroupRemaining: vi.fn(),
      sumRemainingPlayers: vi.fn(),
      findByIdWithPlayers: vi.fn(),
      findPlayersForPause: vi.fn(),
      pausePlayer: vi.fn(),
      resumePlayer: vi.fn(),
      pausePlayersForSession: vi.fn(),
      resumePlayersForSession: vi.fn(),
      renamePlayer: vi.fn(),
      markPlayersCheckedOut: vi.fn(),
      movePlayersToGroup: vi.fn(async () => {}),
    },
    product: {
      findManyByIds: vi.fn(),
      findByIdForSale: vi.fn(),
      decrementStockIfAvailable: vi.fn(),
      recordSaleMovement: vi.fn(),
      findManyForAdmin: vi.fn(),
      findByIdAdmin: vi.fn(),
      createWithInitialStock: vi.fn(),
      applyStockMovement: vi.fn(),
      deactivate: vi.fn(),
      delete: vi.fn(),
      countUsage: vi.fn(),
    },
    cashflow: {
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(async () => ({ entries: [], total: 0, page: 1, pageSize: 10 })),
      summarize: vi.fn(),
    },
    user: { findByUsername: vi.fn(), findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findActiveOpenShiftParticipants: vi.fn() },
    tool: { findMany: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    student: { findMany: vi.fn(), findById: vi.fn(), findByIdIncludingDeleted: vi.fn(), create: vi.fn(), update: vi.fn(), softDelete: vi.fn() },
    lesson: { findManyBetween: vi.fn(), findById: vi.fn(), findBySeries: vi.fn(), findUpcomingByStudent: vi.fn(), findPastByStudent: vi.fn(), create: vi.fn(), update: vi.fn(), cancel: vi.fn(), setGoogleEventId: vi.fn(), deleteFutureBySeries: vi.fn(), countLessonsByStudent: vi.fn(), upsertAttendance: vi.fn(), setPackage: vi.fn() },
    lessonSeries: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    lessonPackage: { findById: vi.fn(), findActiveByStudent: vi.fn(), create: vi.fn(), update: vi.fn(), incrementUsed: vi.fn() },
    calendarConnection: { find: vi.fn(async () => null), upsert: vi.fn(), updateToken: vi.fn(), delete: vi.fn() },
    reporting: {
      getDashboardData: vi.fn(),
      getRevenueData: vi.fn(),
      getRevenueExportRows: vi.fn(),
      getSessionExportRows: vi.fn(),
      getShiftDayGroups: vi.fn(),
      getShiftRevenue: vi.fn(),
      getShiftRevenues: vi.fn(),
      getTrends: vi.fn(),
      getTopProducts: vi.fn(),
    },
  }
  return { ...base, ...overrides }
}

function makeTxInput(overrides: Partial<Parameters<typeof runDeleteMemberTx>[1]> = {}) {
  return {
    staffId: 'staff-1',
    customerId: 'cust-1',
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    now: new Date('2026-08-09T10:00:00Z'),
    ...overrides,
  }
}

describe('deleteMember', () => {
  it('xoá mềm thành công: set deletedAt + audit MEMBER_DELETE', async () => {
    const repos = makeRepositories()
    const result = await runDeleteMemberTx(repos, makeTxInput())

    expect(repos.customer.softDelete).toHaveBeenCalledWith('cust-1', new Date('2026-08-09T10:00:00Z'))
    const auditCall = (repos.audit.append as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(auditCall.action).toBe('MEMBER_DELETE')
    expect(auditCall.entityId).toBe('cust-1')
    expect(auditCall.details).toMatchObject({ fullName: 'Nguyễn Văn A', phone: '0901234567' })
    expect(result).toMatchObject({ id: 'cust-1', fullName: 'Nguyễn Văn A' })
  })

  it('không tìm thấy khách → CUSTOMER_NOT_FOUND, không xoá', async () => {
    const repos = makeRepositories({
      customer: {
        ...makeRepositories().customer,
        findByIdIncludingDeleted: vi.fn(async () => null),
      },
    })
    const result = await deleteMember({ staffId: 'staff-1', customerId: 'cust-x' }, repos)

    if (result.ok) throw new Error('expected error')
    expect(result.error.code).toBe('CUSTOMER_NOT_FOUND')
    expect(repos.customer.softDelete).not.toHaveBeenCalled()
  })

  it('đã xoá rồi → MEMBER_ALREADY_DELETED', async () => {
    const repos = makeRepositories({
      customer: {
        ...makeRepositories().customer,
        findByIdIncludingDeleted: vi.fn(async () => ({
          id: 'cust-1',
          fullName: 'Nguyễn Văn A',
          phone: null,
          type: 'MEMBER' as const,
          deletedAt: new Date('2026-08-01'),
          totalHoursPlayed: 0 as never,
          totalSpent: 0 as never,
          notes: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-08-01'),
        })),
      },
    })
    const result = await deleteMember({ staffId: 'staff-1', customerId: 'cust-1' }, repos)

    if (result.ok) throw new Error('expected error')
    expect(result.error.code).toBe('MEMBER_ALREADY_DELETED')
    expect(repos.customer.softDelete).not.toHaveBeenCalled()
  })

  it('customer không phải hội viên → NOT_A_MEMBER', async () => {
    const repos = makeRepositories({
      customer: {
        ...makeRepositories().customer,
        findByIdIncludingDeleted: vi.fn(async () => ({
          id: 'cust-1',
          fullName: 'Khách lẻ',
          phone: null,
          type: 'WALK_IN' as const,
          deletedAt: null,
          totalHoursPlayed: 0 as never,
          totalSpent: 0 as never,
          notes: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        })),
      },
    })
    const result = await deleteMember({ staffId: 'staff-1', customerId: 'cust-1' }, repos)

    if (result.ok) throw new Error('expected error')
    expect(result.error.code).toBe('NOT_A_MEMBER')
    expect(repos.customer.softDelete).not.toHaveBeenCalled()
  })

  it('còn phiên ACTIVE → MEMBER_HAS_ACTIVE_SESSION, không xoá', async () => {
    const repos = makeRepositories({
      session: {
        ...makeRepositories().session,
        findActiveByCustomer: vi.fn(async () => ({ id: 'session-1' })),
      },
    })
    const result = await deleteMember({ staffId: 'staff-1', customerId: 'cust-1' }, repos)

    if (result.ok) throw new Error('expected error')
    expect(result.error.code).toBe('MEMBER_HAS_ACTIVE_SESSION')
    expect(repos.customer.softDelete).not.toHaveBeenCalled()
  })

  it('mapDeleteMemberError mapping đúng status', () => {
    expect(mapDeleteMemberError({ code: 'CUSTOMER_NOT_FOUND' } as never)).toMatchObject({ status: 404 })
    expect(mapDeleteMemberError({ code: 'MEMBER_ALREADY_DELETED' } as never)).toMatchObject({ status: 400 })
    expect(mapDeleteMemberError({ code: 'NOT_A_MEMBER' } as never)).toMatchObject({ status: 400 })
    expect(mapDeleteMemberError({ code: 'MEMBER_HAS_ACTIVE_SESSION' } as never)).toMatchObject({ status: 409 })
  })
})
