import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'

export async function GET() {
  try {
    await requireAuth()

    const rules = await repositories.pricing.getApplicableRules(new Date())

    const data = rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      ratePerHour: Number(rule.ratePerHour),
      dayType: rule.dayType,
      hourFrom: rule.hourFrom,
      hourTo: rule.hourTo,
      tiers: rule.tiers.map((t) => ({
        minHours: t.minHours,
        ratePerHour: Number(t.ratePerHour),
      })),
    }))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/pricing/applicable error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
