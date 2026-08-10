// ── GET/PUT/DELETE /api/customers/[id] ──────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAuth, requireMutationAuth } from "@/lib/shared/auth";
import { validateCSRF } from "@/lib/shared/csrf";
import { repositories } from "@/lib/infrastructure/repositories";
import { deleteMember, mapDeleteMemberError, updateCustomerSchema } from "@/lib/memberships";
import { apiError, resultToResponse, ERR_CSRF, ERR_FORBIDDEN, ERR_UNAUTHORIZED } from "@/lib/infrastructure/api-helpers";

// ── GET: Chi tiết khách hàng ───────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const customer = await repositories.customer.findByIdWithCount(id);

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy khách hàng" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: customer });
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
    }
    console.error("GET /api/customers/[id] error:", error);
    return NextResponse.json({ success: false, error: "Lỗi máy chủ" }, { status: 500 });
  }
}

// ── PUT: Cập nhật khách hàng ───────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireMutationAuth(request);
    const { id } = await params;

    const existing = await repositories.customer.findById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy khách hàng" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Chuẩn hóa phone rỗng về null
    const customer = await repositories.customer.update(id, {
      ...parsed.data,
      phone: parsed.data.phone || null,
    });

    return NextResponse.json({ success: true, data: customer });
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }
    if (message === 'CSRF_MISMATCH') {
      return NextResponse.json({ success: false, error: 'Yêu cầu không hợp lệ (CSRF)' }, { status: 403 });
    }
    console.error('PUT /api/customers/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ' }, { status: 500 });
  }
}

// ── DELETE: Xoá mềm hội viên (chỉ admin) ─────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin()
    await validateCSRF(request)
    const { id } = await params

    const result = await deleteMember({
      staffId: auth.userId,
      customerId: id,
    })

    return resultToResponse(result, mapDeleteMemberError)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'UNAUTHORIZED') return apiError(ERR_UNAUTHORIZED)
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF)
    if (message === 'FORBIDDEN') return apiError(ERR_FORBIDDEN)
    console.error('DELETE /api/customers/[id] error:', error)
    return apiError({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 })
  }
}
