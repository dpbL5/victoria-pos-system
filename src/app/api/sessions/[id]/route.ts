// ── GET/PUT /api/sessions/[id] ──────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMutationAuth } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { updateSessionSchema } from "@/lib/validations/session";

// ── Helper: kiểm tra staff có quyền truy cập session ────
async function checkSessionAccess(session: { shiftId: string | null; staffId: string }, auth: { userId: string; role: string }) {
  if (auth.role === "ADMIN") return true;
  if (session.staffId === auth.userId) return true;
  if (session.shiftId) {
    const participant = await prisma.shiftParticipant.findFirst({
      where: { shiftId: session.shiftId, staffId: auth.userId },
    });
    if (participant) return true;
  }
  return false;
}

// ── GET: Chi tiết phiên ────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    const { id } = await params;

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, type: true } },
        staff: { select: { id: true, fullName: true } },
        payments: { select: { id: true, paymentMethod: true, grandTotal: true, paidAt: true } },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy phiên" },
        { status: 404 }
      );
    }

    // IDOR: STAFF chỉ xem được phiên của ca mình tham gia hoặc do mình tạo
    if (!(await checkSessionAccess(session, auth))) {
      return NextResponse.json(
        { success: false, error: "Không có quyền truy cập phiên này" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
    }
    console.error("GET /api/sessions/[id] error:", error);
    return NextResponse.json({ success: false, error: "Lỗi máy chủ" }, { status: 500 });
  }
}

// ── PUT: Cập nhật phiên (pause, cancel...) ─────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireMutationAuth(request);
    const { id } = await params;

    const body = await request.json();
    const parsed = updateSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const existing = await prisma.session.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy phiên" },
        { status: 404 }
      );
    }

    // IDOR: STAFF chỉ sửa được phiên của ca mình tham gia hoặc do mình tạo
    if (!(await checkSessionAccess(existing, auth))) {
      return NextResponse.json(
        { success: false, error: "Không có quyền truy cập phiên này" },
        { status: 403 }
      );
    }

    // Chặn sửa phiên đã COMPLETED (chỉ cho phép huỷ phiên ACTIVE)
    if (existing.status === "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Không thể sửa phiên đã kết thúc" },
        { status: 400 }
      );
    }

    // Chặn chuyển CANCELLED về ACTIVE
    if (existing.status === "CANCELLED" && parsed.data.status === "ACTIVE") {
      return NextResponse.json(
        { success: false, error: "Không thể kích hoạt lại phiên đã hủy" },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const session = await tx.session.update({
        where: { id },
        data: parsed.data,
        include: { customer: { select: { id: true, fullName: true } } },
      });

      await logActivity(tx, {
        userId: auth.userId,
        action: parsed.data.status === 'CANCELLED' ? 'SESSION_CANCEL' : 'SESSION_UPDATE',
        entityType: 'Session',
        entityId: id,
        details: {
          previousStatus: existing.status,
          newStatus: session.status,
          notes: parsed.data.notes ?? null,
        },
      });

      return session;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
    }
    if ((error as Error).message === "CSRF_MISMATCH") {
      return NextResponse.json({ success: false, error: "Yêu cầu không hợp lệ (CSRF)" }, { status: 403 });
    }
    if ((error as Error).message === "RATE_LIMITED") {
      return NextResponse.json({ success: false, error: "Quá nhiều yêu cầu. Thử lại sau." }, { status: 429 });
    }
    console.error("PUT /api/sessions/[id] error:", error);
    return NextResponse.json({ success: false, error: "Lỗi máy chủ" }, { status: 500 });
  }
}
