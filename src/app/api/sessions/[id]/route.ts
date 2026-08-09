// ── GET/PUT /api/sessions/[id] ──────────────────────────
import { NextRequest } from "next/server";
import { requireAuth, requireMutationAuth } from "@/lib/shared/auth";
import { updateSession, mapUpdateSessionError } from "@/lib/sessions";
import { repositories } from "@/lib/infrastructure/repositories";
import { updateSessionSchema } from "@/lib/sessions";
import {
  apiSuccess,
  apiError,
  resultToResponse,
  ERR_UNAUTHORIZED,
  ERR_CSRF,
} from "@/lib/infrastructure/api-helpers";

// ── GET: Chi tiết phiên ────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    const { id } = await params;

    const session = await repositories.session.findByIdForCheckout(id);

    if (!session) {
      return apiError({ code: "SESSION_NOT_FOUND", message: "Không tìm thấy phiên", status: 404 });
    }

    // IDOR: STAFF chỉ xem được phiên của ca mình tham gia hoặc do mình tạo
    if (auth.role !== "ADMIN") {
      const isOwner = session.staffId === auth.userId;
      const isParticipant = session.shiftId
        ? Boolean(await repositories.shift.findByIdAccess(session.shiftId))
        : false;
      if (!isOwner && !isParticipant) {
        return apiError({ code: "FORBIDDEN", message: "Không có quyền truy cập phiên này", status: 403 });
      }
    }

    return apiSuccess(session);
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") return apiError(ERR_UNAUTHORIZED);
    console.error("GET /api/sessions/[id] error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
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
      return apiError({ code: "VALIDATION", message: parsed.error.issues[0].message, status: 400 });
    }

    const result = await updateSession({
      sessionId: id,
      staffId: auth.userId,
      role: auth.role,
      data: parsed.data,
      notes: parsed.data.notes ?? null,
    });
    return resultToResponse(result, mapUpdateSessionError);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "UNAUTHORIZED") return apiError(ERR_UNAUTHORIZED);
    if (message === "CSRF_MISMATCH") return apiError(ERR_CSRF);
    if (message === "RATE_LIMITED") return apiError({ code: "RATE_LIMITED", message: "Quá nhiều yêu cầu. Thử lại sau.", status: 429 });
    console.error("PUT /api/sessions/[id] error:", error);
    return apiError({ code: "UNKNOWN", message: "Lỗi máy chủ", status: 500 });
  }
}
