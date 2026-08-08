// ── Composition root — bundle các repository adapters ─────
import { prisma } from './prisma'
import { createBillingRepository } from './adapters/invoice-adapter'
import { createAuditRepository } from './adapters/audit-adapter'
import { createMembershipRepository, createMembershipPlanRepository, createCustomerRepository } from './adapters/membership-adapter'
import { createShiftRepository } from './adapters/shift-adapter'
import { createPricingRepository } from './adapters/pricing-adapter'
import { createPromotionRepository } from './adapters/promotion-adapter'
import { createSettingsRepository } from './adapters/settings-adapter'
import { createSessionRepository } from './adapters/session-adapter'
import { createProductRepository } from './adapters/product-adapter'
import { createCashflowRepository } from './adapters/cashflow-adapter'
import { createCachedSettingsRepository } from '@/lib/settings'
import type { Prisma } from '@/generated/prisma/client'
import type { BillingRepository } from '@/lib/invoicing/ports'
import type { AuditRepository } from '@/lib/audit/ports'
import type { CustomerRepository, MembershipPlanRepository, MembershipRepository } from '@/lib/memberships/ports'
import type { ShiftRepository } from '@/lib/shifts/ports'
import type { PricingRepository } from '@/lib/pricing/ports'
import type { PromotionRepository } from '@/lib/promotions/ports'
import type { SettingsRepository } from '@/lib/settings/ports'
import type { ProductRepository, SessionRepository } from '@/lib/sessions/ports'
import type { CashflowRepository } from '@/lib/cashflow/ports'

/**
 * Bundle các repository theo từng domain. Interface được bổ sung dần
 * theo từng iteration của plan refactor (ADR-007).
 */
export interface Repositories {
  billing: BillingRepository
  audit: AuditRepository
  membership: MembershipRepository
  membershipPlan: MembershipPlanRepository
  customer: CustomerRepository
  shift: ShiftRepository
  pricing: PricingRepository
  promotions: PromotionRepository
  settings: SettingsRepository
  session: SessionRepository
  product: ProductRepository
  cashflow: CashflowRepository
}

export function createRepositories(store: Prisma.TransactionClient): Repositories {
  return {
    billing: createBillingRepository(store),
    audit: createAuditRepository(store),
    membership: createMembershipRepository(store),
    membershipPlan: createMembershipPlanRepository(store),
    customer: createCustomerRepository(store),
    shift: createShiftRepository(store),
    pricing: createPricingRepository(store),
    promotions: createPromotionRepository(store),
    // Per-tx: KHÔNG cache — mỗi transaction đọc dữ liệu mới
    settings: createSettingsRepository(store),
    session: createSessionRepository(store),
    product: createProductRepository(store),
    cashflow: createCashflowRepository(store),
  }
}

/**
 * Singleton cho standalone reads (route handlers không cần transaction).
 * Settings được wrap cache 60s TTL — cache nằm ở composition root,
 * không trong per-tx adapter (xem src/lib/settings/helpers.ts).
 */
export const repositories: Repositories = {
  ...createRepositories(prisma),
  settings: createCachedSettingsRepository(createSettingsRepository(prisma)),
}
