// ── Adapter: implement PricingRepository bằng Prisma ─────
import type { PricingStore } from '../store-types'
import { getDayType, getVnHour } from '@/lib/utils'
import {
  hasSharedDay,
  normalizeDaysOfWeek,
  pricingRuleWhere,
  resolveRuleDaysOfWeek,
  type OverlapInfo,
} from '@/lib/pricing'
import type { FindOverlappingRulesInput, PricingRepository, PricingRuleWithTiers } from '@/lib/pricing'
import type { DayType } from '@/types'

export function createPricingRepository(store: PricingStore): PricingRepository {
  return {
    async findApplicableRule(currentHour: number, dayType: DayType, at: Date) {
      const rule = await store.pricingRule.findFirst({
        where: pricingRuleWhere(currentHour, dayType, at),
        include: { tiers: { orderBy: { minHours: 'asc' } } },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      })
      return rule
    },

    async findByIdWithTiers(ruleId: string): Promise<PricingRuleWithTiers | null> {
      const rule = await store.pricingRule.findUnique({
        where: { id: ruleId },
        include: { tiers: { orderBy: { minHours: 'asc' } } },
      })
      return rule
    },

    async getApplicableRules(at: Date) {
      return store.pricingRule.findMany({
        where: pricingRuleWhere(getVnHour(at), getDayType(at), at),
        include: { tiers: { orderBy: { minHours: 'asc' } } },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      })
    },

    async countApplicable(at: Date) {
      return store.pricingRule.count({
        where: pricingRuleWhere(getVnHour(at), getDayType(at), at),
      })
    },

    async countAll() {
      return store.pricingRule.count()
    },

    async findOverlapping(input: FindOverlappingRulesInput): Promise<OverlapInfo[]> {
      const effectiveEnd = input.effectiveTo ?? new Date('2099-12-31')
      const hTo = input.hourTo ?? 24
      const normalizedDays = normalizeDaysOfWeek(input.daysOfWeek)

      const rules = await store.pricingRule.findMany({
        where: {
          id: input.excludeId ? { not: input.excludeId } : undefined,
          hourFrom: { lt: hTo },
          OR: [
            { hourTo: null },
            { hourTo: { gt: input.hourFrom } },
          ],
          effectiveFrom: { lte: effectiveEnd },
          AND: [{
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: input.effectiveFrom } },
            ],
          }],
        },
        select: {
          id: true,
          name: true,
          daysOfWeek: true,
          dayType: true,
          hourFrom: true,
          hourTo: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      })

      return rules
        .map((rule) => ({
          id: rule.id,
          name: rule.name,
          daysOfWeek: resolveRuleDaysOfWeek(rule.daysOfWeek, rule.dayType),
          hourFrom: rule.hourFrom,
          hourTo: rule.hourTo,
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo,
        }))
        .filter((rule) => hasSharedDay(normalizedDays, rule.daysOfWeek))
    },
  }
}
