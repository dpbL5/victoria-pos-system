import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { validateCSRF } from '@/lib/csrf'
import { updateMembershipPlanSchema } from '@/lib/memberships'
import { logActivity } from '@/lib/audit'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params
    const body = await request.json()
    const parsed = updateMembershipPlanSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const existing = await prisma.membershipPlan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy gói hội viên' },
        { status: 404 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const plan = await tx.membershipPlan.update({
        where: { id },
        data: parsed.data,
      })

      await logActivity(tx, {
        userId: auth.userId,
        action: 'MEMBERSHIP_PLAN_UPDATE',
        entityType: 'MembershipPlan',
        entityId: id,
        details: {
          before: {
            name: existing.name,
            durationMonths: existing.durationMonths,
            price: Number(existing.price),
            isActive: existing.isActive,
          },
          after: {
            name: plan.name,
            durationMonths: plan.durationMonths,
            price: Number(plan.price),
            isActive: plan.isActive,
          },
        },
      })

      return plan
    })

    return NextResponse.json({ success: true, data: updated })
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
    console.error('PUT /api/membership-plans/[id] error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params

    const existing = await prisma.membershipPlan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy gói hội viên' },
        { status: 404 }
      )
    }

    // Kiểm tra xem gói có đang được dùng bởi hội viên nào không
    const usageCount = await prisma.membership.count({
      where: { planId: id },
    })

    if (usageCount > 0) {
      // Thay vì xóa cứng, đánh dấu ngừng dùng
      const deactivated = await prisma.$transaction(async (tx) => {
        const plan = await tx.membershipPlan.update({
          where: { id },
          data: { isActive: false },
        })

        await logActivity(tx, {
          userId: auth.userId,
          action: 'MEMBERSHIP_PLAN_DEACTIVATE',
          entityType: 'MembershipPlan',
          entityId: id,
          details: {
            name: existing.name,
            reason: 'Gói đang được dùng bởi hội viên, chuyển sang trạng thái ngừng dùng',
            activeMembershipCount: usageCount,
          },
        })

        return plan
      })

      return NextResponse.json({
        success: true,
        data: deactivated,
        message: 'Gói đang được dùng bởi hội viên, đã chuyển sang trạng thái ngừng dùng',
      })
    }

    await prisma.$transaction(async (tx) => {
      await tx.membershipPlan.delete({ where: { id } })

      await logActivity(tx, {
        userId: auth.userId,
        action: 'MEMBERSHIP_PLAN_DELETE',
        entityType: 'MembershipPlan',
        entityId: id,
        details: {
          name: existing.name,
          durationMonths: existing.durationMonths,
          price: Number(existing.price),
        },
      })
    })

    return NextResponse.json({ success: true, message: 'Đã xóa gói hội viên' })
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
    console.error('DELETE /api/membership-plans/[id] error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
