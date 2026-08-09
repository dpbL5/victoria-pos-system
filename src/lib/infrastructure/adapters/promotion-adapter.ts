// ── Adapter: implement PromotionRepository bằng Prisma ─────
import type { PromotionStore } from '../store-types'
import {
  hasSharedDay,
  normalizePromotionDays,
  promotionRuleWhere,
  resolvePromotionDays,
  toPromotionSnapshot,
  type PromotionOverlapInfo,
} from '@/lib/promotions'
import type { PromotionRepository } from '@/lib/promotions'

export function createPromotionRepository(store: PromotionStore): PromotionRepository {
  return {
    async findAvailable(at) {
      const rules = await store.promotionRule.findMany({
        where: promotionRuleWhere(at),
        orderBy: [
          { effectiveFrom: 'desc' },
          { createdAt: 'desc' },
        ],
      })
      return rules.map(toPromotionSnapshot)
    },

    async findAvailableById(id, at) {
      const rule = await store.promotionRule.findFirst({
        where: {
          id,
          ...promotionRuleWhere(at),
        },
      })
      return rule ? toPromotionSnapshot(rule) : null
    },

    async findOverlapping(input): Promise<PromotionOverlapInfo[]> {
      const candidateEnd = input.effectiveTo ?? new Date('2099-12-31T23:59:59.999Z')
      const candidateHourTo = input.hourTo ?? 24
      const normalizedDays = normalizePromotionDays(input.daysOfWeek)

      const rules = await store.promotionRule.findMany({
        where: {
          isActive: true,
          id: input.excludeId ? { not: input.excludeId } : undefined,
          hourFrom: { lt: candidateHourTo },
          OR: [
            { hourTo: null },
            { hourTo: { gt: input.hourFrom } },
          ],
          effectiveFrom: { lte: candidateEnd },
          AND: [
            {
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: input.effectiveFrom } },
              ],
            },
          ],
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
          daysOfWeek: resolvePromotionDays(rule.daysOfWeek, rule.dayType),
          hourFrom: rule.hourFrom,
          hourTo: rule.hourTo,
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo,
        }))
        .filter((rule) => hasSharedDay(normalizedDays, rule.daysOfWeek))
    },

    async findMany() {
      return store.promotionRule.findMany({
        orderBy: [
          { isActive: 'desc' },
          { dayType: 'asc' },
          { hourFrom: 'asc' },
          { effectiveFrom: 'desc' },
        ],
      })
    },

    async findById(id) {
      return store.promotionRule.findUnique({ where: { id } })
    },

    async create(data) {
      return store.promotionRule.create({
        data: {
          name: data.name,
          discountType: data.discountType as 'FIXED_PER_HOUR' | 'PERCENT_PLAY_TIME' | 'FIXED_AMOUNT' | 'PERCENT',
          discountValue: data.discountValue,
          daysOfWeek: data.daysOfWeek,
          hourFrom: data.hourFrom,
          hourTo: data.hourTo,
          dayType: data.dayType as 'WEEKDAY' | 'WEEKEND',
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo,
          isActive: data.isActive,
        },
      })
    },

    async update(id, data) {
      return store.promotionRule.update({ where: { id }, data })
    },

    async delete(id) {
      await store.promotionRule.delete({ where: { id } })
    },
  }
}
