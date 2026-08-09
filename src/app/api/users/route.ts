// ── GET /api/users & POST /api/users ────────────────────
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/shared/auth";
import { validateCSRF } from "@/lib/shared/csrf";
import { createUser, mapCreateUserError } from "@/lib/users";
import { repositories } from "@/lib/infrastructure/repositories";
import { createUserSchema } from "@/lib/users";
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
    await requireAdmin();

    const users = await repositories.user.findMany();

    return apiSuccess(users);
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return apiError(ERR_UNAUTHORIZED);
    }
    if ((error as Error).message === "FORBIDDEN") {
      return apiError(ERR_FORBIDDEN);
    }
    console.error("GET /api/users error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    await validateCSRF(request);

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return apiError({ code: 'VALIDATION', message: parsed.error.issues[0].message, status: 400 });
    }

    const result = await createUser({ staffId: auth.userId, ...parsed.data });
    return resultToResponse(result, mapCreateUserError, 201);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHORIZED") return apiError(ERR_UNAUTHORIZED);
    if (message === 'CSRF_MISMATCH') return apiError(ERR_CSRF);
    if (message === "FORBIDDEN") return apiError(ERR_FORBIDDEN);
    console.error("POST /api/users error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
  }
}
