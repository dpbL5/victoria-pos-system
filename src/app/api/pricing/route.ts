import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { validateCSRF } from '@/lib/csrf'
import { logActivity } from '@/lib/audit'
import { deriveDayTypeFromDays, normalizeDaysOfWeek } from '@/lib/pricing'
import { repositories } from '@/lib/infrastructure/repositories'
import { prisma } from '@/lib/prisma'
import { parseLocalDate, parseLocalDateEnd } from '@/lib/utils'
import { createPricingRuleSchema } from '@/lib/pricing'

export async function GET() {
  try {
    await requireAdmin()

    const rules = await prisma.pricingRule.findMany({
      orderBy: [
        { dayType: 'asc' },
        { hourFrom: 'asc' },
        { effectiveFrom: 'desc' },
      ],
      include: {
        tiers: { orderBy: { minHours: 'asc' } },
      },
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 })
    }
    console.error('GET /api/pricing error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const body = await request.json()
    const parsed = createPricingRuleSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const effectiveFrom = parseLocalDate(parsed.data.effectiveFrom)
    const effectiveTo = parsed.data.effectiveTo ? parseLocalDateEnd(parsed.data.effectiveTo) : null
    const daysOfWeek = normalizeDaysOfWeek(parsed.data.daysOfWeek)
    const dayType = deriveDayTypeFromDays(daysOfWeek)

    const overlaps = await repositories.pricing.findOverlapping({
      daysOfWeek,
      hourFrom: parsed.data.hourFrom,
      hourTo: parsed.data.hourTo ?? null,
      effectiveFrom,
      effectiveTo,
    })

    const rule = await prisma.$transaction(async (tx) => {
      const created = await tx.pricingRule.create({
        data: {
          name: parsed.data.name.trim(),
          hourFrom: parsed.data.hourFrom,
          hourTo: parsed.data.hourTo ?? null,
          ratePerHour: parsed.data.ratePerHour,
          daysOfWeek,
          dayType,
          effectiveFrom,
          effectiveTo,
        },
      })

      if (parsed.data.tiers && parsed.data.tiers.length > 0) {
        await tx.pricingTier.createMany({
          data: parsed.data.tiers.map((t) => ({
            ruleId: created.id,
            minHours: t.minHours,
            ratePerHour: t.ratePerHour,
          })),
        })
      }

      await logActivity(tx, {
        userId: auth.userId,
        action: 'PRICING_RULE_CREATE',
        entityType: 'PricingRule',
        entityId: created.id,
        details: {
          name: created.name,
          hourFrom: created.hourFrom,
          hourTo: created.hourTo,
          ratePerHour: Number(created.ratePerHour),
          daysOfWeek: created.daysOfWeek,
          dayType: created.dayType,
        },
      })

      return created
    })

    return NextResponse.json(
      {
        success: true,
        data: rule,
        ...(overlaps.length > 0 ? { warnings: overlaps.map(o => `Trùng khung giờ với quy tắc "${o.name}"`) } : {}),
      },
      { status: 201 }
    )
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 })
    }
    console.error('POST /api/pricing error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
