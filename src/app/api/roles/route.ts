// ── GET/POST /api/roles — vai trò & quyền (admin) ─────
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/shared/auth";
import { validateCSRF } from "@/lib/shared/csrf";
import { listRoles, createRole, mapCreateRoleError, createRoleSchema } from "@/lib/roles";
import {
  apiSuccess,
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_FORBIDDEN,
  ERR_CSRF,
} from "@/lib/infrastructure/api-helpers";

export async function GET() {
  try {
    await requirePermission('roles.view');

    const result = await listRoles();
    return resultToResponse(result, () => ({ code: 'UNKNOWN', message: 'Lỗi máy chủ', status: 500 }));
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHORIZED") return apiError(ERR_UNAUTHORIZED);
    if (message === "FORBIDDEN") return apiError(ERR_FORBIDDEN);
    console.error("GET /api/roles error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('roles.manage');
    await validateCSRF(request);

    const body = await request.json();
    const parsed = createRoleSchema.safeParse(body);

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 });
    }

    const result = await createRole({
      staffId: auth.userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      permissions: parsed.data.permissions,
    });
    return resultToResponse(result, mapCreateRoleError, 201);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHORIZED") return apiError(ERR_UNAUTHORIZED);
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF);
    if (message === "FORBIDDEN") return apiError(ERR_FORBIDDEN);
    console.error("POST /api/roles error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
  }
}
