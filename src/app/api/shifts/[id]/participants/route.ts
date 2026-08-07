import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { validateCSRF } from '@/lib/csrf'
import { logActivity } from '@/lib/audit'
import { shiftWithAllParticipantsInclude } from '@/lib/shifts'
import { prisma } from '@/lib/prisma'
import {
  manageShiftParticipantSchema,
  removeShiftParticipantSchema,
} from '@/lib/shifts'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params
    const body = await request.json()
    const parsed = manageShiftParticipantSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const shift = await prisma.shift.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!shift) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy ca làm' },
        { status: 404 }
      )
    }
    if (shift.status !== 'OPEN') {
      return NextResponse.json(
        { success: false, error: 'Chỉ quản lý nhân viên khi ca đang mở' },
        { status: 400 }
      )
    }

    const staff = await prisma.user.findUnique({
      where: { id: parsed.data.staffId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    })
    if (!staff || !staff.isActive) {
      return NextResponse.json(
        { success: false, error: 'Nhân viên không tồn tại hoặc đã bị khoá' },
        { status: 404 }
      )
    }

    const updatedShift = await prisma.$transaction(async (tx) => {
      await tx.shiftParticipant.upsert({
        where: {
          shiftId_staffId: {
            shiftId: id,
            staffId: staff.id,
          },
        },
        update: {
          role: parsed.data.role,
          leftAt: null,
        },
        create: {
          shiftId: id,
          staffId: staff.id,
          role: parsed.data.role,
        },
      })

      await logActivity(tx, {
        userId: auth.userId,
        action: 'SHIFT_PARTICIPANT_UPSERT',
        entityType: 'Shift',
        entityId: id,
        details: {
          staffId: staff.id,
          staffName: staff.fullName,
          username: staff.username,
          role: parsed.data.role,
        },
      })

      return tx.shift.findUniqueOrThrow({
        where: { id },
        include: shiftWithAllParticipantsInclude,
      })
    })

    return NextResponse.json({ success: true, data: updatedShift })
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
    console.error('POST /api/shifts/[id]/participants error:', error)
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
    const body = await request.json()
    const parsed = removeShiftParticipantSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: {
        participants: {
          where: { leftAt: null },
          include: { staff: { select: { id: true, fullName: true, username: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    })
    if (!shift) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy ca làm' },
        { status: 404 }
      )
    }
    if (shift.status !== 'OPEN') {
      return NextResponse.json(
        { success: false, error: 'Chỉ quản lý nhân viên khi ca đang mở' },
        { status: 400 }
      )
    }

    const target = shift.participants.find(
      (participant) => participant.staffId === parsed.data.staffId
    )
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Nhân viên không ở trong ca đang mở' },
        { status: 404 }
      )
    }
    if (shift.participants.length <= 1) {
      return NextResponse.json(
        { success: false, error: 'Ca đang mở cần ít nhất một nhân viên' },
        { status: 400 }
      )
    }

    const leftAt = new Date()
    const updatedShift = await prisma.$transaction(async (tx) => {
      await tx.shiftParticipant.updateMany({
        where: {
          shiftId: id,
          staffId: parsed.data.staffId,
          leftAt: null,
        },
        data: { leftAt },
      })

      await logActivity(tx, {
        userId: auth.userId,
        action: 'SHIFT_PARTICIPANT_REMOVE',
        entityType: 'Shift',
        entityId: id,
        details: {
          staffId: target.staffId,
          staffName: target.staff.fullName,
          username: target.staff.username,
          leftAt: leftAt.toISOString(),
        },
      })

      return tx.shift.findUniqueOrThrow({
        where: { id },
        include: shiftWithAllParticipantsInclude,
      })
    })

    return NextResponse.json({ success: true, data: updatedShift })
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
    console.error('DELETE /api/shifts/[id]/participants error:', error)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 })
  }
}
