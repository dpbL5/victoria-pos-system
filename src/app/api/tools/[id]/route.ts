import { NextRequest, NextResponse } from 'next/server'
import { requireMutationAuth } from '@/lib/shared/auth'
import { repositories } from '@/lib/infrastructure/repositories'
import { updateToolSchema } from '@/lib/tools'

async function requireAdminMutation(request: NextRequest) {
  const auth = await requireMutationAuth(request)
  if (auth.role !== 'ADMIN') {
    throw new Error('FORBIDDEN')
  }
  return auth
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminMutation(request)
    const { id } = await params

    const body = await request.json()
    const parsed = updateToolSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const existing = await repositories.tool.findById(id)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy dụng cụ' },
        { status: 404 }
      )
    }

    const tool = await repositories.tool.update(id, parsed.data)

    return NextResponse.json({ success: true, data: tool })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Chỉ quản trị viên được truy cập' }, { status: 403 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    console.error('PATCH /api/tools/[id] error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminMutation(request)
    const { id } = await params

    const existing = await repositories.tool.findById(id)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy dụng cụ' },
        { status: 404 }
      )
    }

    await repositories.tool.delete(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'Chỉ quản trị viên được truy cập' }, { status: 403 })
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 })
    }
    console.error('DELETE /api/tools/[id] error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
