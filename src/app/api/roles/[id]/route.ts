// ── PUT/DELETE /api/roles/[id] — sửa/xoá vai trò (admin) ─────
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/shared/auth";
import { validateCSRF } from "@/lib/shared/csrf";
import { updateRole, mapUpdateRoleError, deleteRole, mapDeleteRoleError, updateRoleSchema } from "@/lib/roles";
import {
  apiSuccess,
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from "@/lib/infrastructure/api-helpers";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('roles.manage');
    await validateCSRF(request);
    const { id } = await params;

    const body = await request.json();
    const parsed = updateRoleSchema.safeParse(body);

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 });
    }

    const result = await updateRole({
      staffId: auth.userId,
      roleId: id,
      ...parsed.data,
      description: parsed.data.description ?? undefined,
    });
    return resultToResponse(result, mapUpdateRoleError);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHORIZED") return apiError(ERR_UNAUTHORIZED);
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF);
    if (message === "FORBIDDEN") return apiError(ERR_FORBIDDEN);
    console.error("PUT /api/roles/[id] error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('roles.manage');
    await validateCSRF(request);
    const { id } = await params;

    const result = await deleteRole({ staffId: auth.userId, roleId: id });

    if (!result.ok) return apiError(mapDeleteRoleError(result.error));
    return apiSuccess({
      message:
        result.value.usersDetached > 0
          ? `Đã xoá vai trò, ${result.value.usersDetached} tài khoản chuyển sang "Chưa phân vai"`
          : 'Đã xoá vai trò',
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHORIZED") return apiError(ERR_UNAUTHORIZED);
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF);
    if (message === "FORBIDDEN") return apiError(ERR_FORBIDDEN);
    console.error("DELETE /api/roles/[id] error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
  }
}
