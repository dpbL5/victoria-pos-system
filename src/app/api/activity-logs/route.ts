import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')?.trim()
    const action = searchParams.get('action')?.trim()
    const entityType = searchParams.get('entityType')?.trim()
    const search = searchParams.get('search')?.trim()
    const limit = parseLimit(searchParams.get('limit'))

    const { rows: logs, total } = await repositories.audit.findMany({
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(search ? { search } : {}),
      take: limit,
    })

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: {
        limit,
        total,
      },
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Không có quyền' }, { status: 403 })
    }
    console.error('GET /api/activity-logs error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? DEFAULT_LIMIT)
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}
