import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAuth, requireMutationAuth } from '@/lib/auth'
import { getSetting, upsertSetting, SETTING_KEYS } from '@/lib/business/settings'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/business/audit'
import { z } from 'zod'

const updateSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(255),
  label: z.string().max(200).optional(),
})

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const key = request.nextUrl.searchParams.get('key')

    if (key) {
      const value = await getSetting(key)
      const row = await prisma.appSetting.findUnique({ where: { key } })
      return NextResponse.json({
        success: true,
        data: { key, value: value ?? '', label: row?.label ?? null },
      })
    }

    const all = await prisma.appSetting.findMany({ orderBy: { key: 'asc' } })
    return NextResponse.json({ success: true, data: all })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    console.error('GET /api/settings error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request)
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Chỉ quản trị viên được truy cập' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    if (!Object.values(SETTING_KEYS).includes(parsed.data.key as typeof SETTING_KEYS[keyof typeof SETTING_KEYS])) {
      return NextResponse.json(
        { success: false, error: 'Không hỗ trợ cài đặt này' },
        { status: 400 }
      )
    }

    const oldValue = await getSetting(parsed.data.key)

    await upsertSetting(parsed.data.key, parsed.data.value, parsed.data.label)

    await prisma.$transaction(async (tx) => {
      await logActivity(tx, {
        userId: auth.userId,
        action: 'SETTING_UPDATE',
        entityType: 'AppSetting',
        entityId: randomUUID(),
        details: {
          key: parsed.data.key,
          oldValue: oldValue ?? '',
          newValue: parsed.data.value,
          label: parsed.data.label,
        },
      })
    })

    return NextResponse.json({ success: true, data: { key: parsed.data.key, value: parsed.data.value } })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    console.error('PUT /api/settings error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
