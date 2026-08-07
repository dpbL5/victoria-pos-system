// ── PUT /api/users/[id] ─────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { validateCSRF } from "@/lib/csrf";
import { logActivity } from "@/lib/audit";
import { resetPasswordSchema, updateUserSchema } from "@/lib/validations/auth";
import bcrypt from "bcryptjs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    await validateCSRF(request);
    const { id } = await params;

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Kiểm tra user tồn tại trước khi update
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    // Chặn vô hiệu hoá nhân viên đang tham gia ca mở
    if (parsed.data.isActive === false) {
      const activeParticipants = await prisma.shiftParticipant.findMany({
        where: {
          staffId: id,
          leftAt: null,
          shift: { status: 'OPEN' },
        },
        select: { shiftId: true },
      });

      if (activeParticipants.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Không thể vô hiệu hoá nhân viên đang trong ca làm. Vui lòng đưa nhân viên rời ca trước khi khoá tài khoản.`,
          },
          { status: 409 }
        );
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: parsed.data,
        select: { id: true, username: true, fullName: true, role: true, isActive: true },
      });

      await logActivity(tx, {
        userId: auth.userId,
        action: "USER_UPDATE",
        entityType: "User",
        entityId: id,
        details: {
          targetUsername: existing.username,
          before: {
            fullName: existing.fullName,
            role: existing.role,
            isActive: existing.isActive,
          },
          after: {
            fullName: updated.fullName,
            role: updated.role,
            isActive: updated.isActive,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    const message = (error as Error).message
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: "Không có quyền" }, { status: 403 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }
    console.error("PUT /api/users/[id] error:", error);
    return NextResponse.json({ success: false, error: "Lỗi máy chủ" }, { status: 500 });
  }
}

// ── Reset password ─────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    await validateCSRF(request);
    const { id } = await params;

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Kiểm tra user tồn tại trước khi đổi mật khẩu
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });

      await logActivity(tx, {
        userId: auth.userId,
        action: "USER_PASSWORD_RESET",
        entityType: "User",
        entityId: id,
        details: {
          targetUsername: existing.username,
          targetFullName: existing.fullName,
        },
      });
    });

    return NextResponse.json({ success: true, message: "Đã đổi mật khẩu" });
  } catch (error) {
    const message = (error as Error).message
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: "Không có quyền" }, { status: 403 });
    }
    console.error("PATCH /api/users/[id] error:", error);
    return NextResponse.json({ success: false, error: "Lỗi máy chủ" }, { status: 500 });
  }
}
