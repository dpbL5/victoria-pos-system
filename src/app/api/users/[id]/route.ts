// ── PUT /api/users/[id] ─────────────────────────────────
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/shared/auth";
import { validateCSRF } from "@/lib/shared/csrf";
import { updateUser, mapUpdateUserError, resetUserPassword, mapResetUserPasswordError } from "@/lib/users";
import { resetPasswordSchema, updateUserSchema } from "@/lib/users";
import {
  apiError,
  apiSuccess,
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
    const auth = await requireAdmin();
    await validateCSRF(request);
    const { id } = await params;

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 });
    }

    const result = await updateUser({ staffId: auth.userId, userId: id, ...parsed.data });
    return resultToResponse(result, mapUpdateUserError);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHORIZED") return apiError(ERR_UNAUTHORIZED);
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF);
    if (message === "FORBIDDEN") return apiError(ERR_FORBIDDEN);
    console.error("PUT /api/users/[id] error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
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
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 });
    }

    const result = await resetUserPassword({ staffId: auth.userId, userId: id, newPassword: parsed.data.newPassword });
    if (!result.ok) return apiError(mapResetUserPasswordError(result.error));
    return apiSuccess({ message: "Đã đổi mật khẩu" });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHORIZED") return apiError(ERR_UNAUTHORIZED);
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF);
    if (message === "FORBIDDEN") return apiError(ERR_FORBIDDEN);
    console.error("PATCH /api/users/[id] error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
  }
}
