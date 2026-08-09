// ── POST /api/auth/logout ──────────────────────────────
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/shared/auth";

export async function POST() {
  await destroySession();
  return NextResponse.json({ success: true, message: "Đã đăng xuất" });
}
