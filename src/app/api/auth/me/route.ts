// ── GET /api/auth/me ────────────────────────────────────
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";

export async function GET() {
  try {
    const session = await requireAuth();
    return NextResponse.json(
      {
        success: true,
        data: session,
      }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập" },
      { status: 401 }
    );
  }
}
