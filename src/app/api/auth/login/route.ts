// ── POST /api/auth/login ───────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/shared/auth";
import { repositories } from "@/lib/infrastructure/repositories";
import { loginSchema } from "@/lib/users";
import bcrypt from "bcryptjs";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; resetAt: number; lockedUntil?: number }>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { username, password } = parsed.data;
    const rateLimitKey = buildRateLimitKey(request, username);
    const rateLimit = checkLoginRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${rateLimit.retryAfterMinutes} phút.`,
        },
        { status: 429 }
      );
    }

    // Tìm user
    const user = await repositories.user.findByUsername(username);

    if (!user || !user.isActive) {
      recordFailedLogin(rateLimitKey);
      return NextResponse.json(
        { success: false, error: "Tên đăng nhập hoặc mật khẩu không đúng" },
        { status: 401 }
      );
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordFailedLogin(rateLimitKey);
      return NextResponse.json(
        { success: false, error: "Tên đăng nhập hoặc mật khẩu không đúng" },
        { status: 401 }
      );
    }

    clearFailedLogin(rateLimitKey);

    // Tạo session JWT
    await createSession({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role as "ADMIN" | "MANAGER" | "STAFF",
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "Lỗi máy chủ" },
      { status: 500 }
    );
  }
}

function buildRateLimitKey(request: NextRequest, username: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwardedFor || realIp || "local";
  return `${ip}:${username.trim().toLowerCase()}`;
}

function checkLoginRateLimit(key: string): { allowed: true } | { allowed: false; retryAfterMinutes: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true };

  if (entry.lockedUntil && entry.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterMinutes: Math.max(1, Math.ceil((entry.lockedUntil - now) / 60000)),
    };
  }

  if (entry.resetAt <= now) {
    loginAttempts.delete(key);
  }

  return { allowed: true };
}

function recordFailedLogin(key: string) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  const nextEntry = entry && entry.resetAt > now
    ? { ...entry, count: entry.count + 1 }
    : { count: 1, resetAt: now + LOGIN_WINDOW_MS };

  if (nextEntry.count >= MAX_FAILED_ATTEMPTS) {
    nextEntry.lockedUntil = now + LOGIN_LOCK_MS;
  }

  loginAttempts.set(key, nextEntry);
}

function clearFailedLogin(key: string) {
  loginAttempts.delete(key);
}
