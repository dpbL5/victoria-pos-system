// ── GET /api/users & POST /api/users ────────────────────
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { validateCSRF } from "@/lib/csrf";
import { logActivity } from "@/lib/audit";
import { createUserSchema } from "@/lib/validations/auth";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
    }
    if ((error as Error).message === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: "Không có quyền" }, { status: 403 });
    }
    console.error("GET /api/users error:", error);
    return NextResponse.json({ success: false, error: "Lỗi máy chủ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    await validateCSRF(request);

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Kiểm tra username đã tồn tại
    const existing = await prisma.user.findUnique({
      where: { username: parsed.data.username },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Tên đăng nhập đã tồn tại" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: parsed.data.username,
          passwordHash,
          fullName: parsed.data.fullName,
          role: parsed.data.role,
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      await logActivity(tx, {
        userId: auth.userId,
        action: "USER_CREATE",
        entityType: "User",
        entityId: created.id,
        details: {
          username: created.username,
          fullName: created.fullName,
          role: created.role,
          isActive: created.isActive,
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: user }, { status: 201 });
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
    console.error("POST /api/users error:", error);
    return NextResponse.json({ success: false, error: "Lỗi máy chủ" }, { status: 500 });
  }
}
