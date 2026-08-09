// ── JWT Auth với jose ───────────────────────────────────
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/infrastructure/prisma";
import { generateCSRFToken, setCSRFCookie, clearCSRFCookie, validateCSRF } from "@/lib/shared/csrf";
import { rateLimit } from "@/lib/shared/rate-limit";
import { withRetry } from "@/lib/infrastructure/db-retry";
import type { SessionPayload } from "@/types";

// ── Config ─────────────────────────────────────────────
const rawSessionSecret = process.env.SESSION_SECRET;

if (!rawSessionSecret || rawSessionSecret.length < 32) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET chưa được cấu hình hoặc quá ngắn. " +
      "Tạo secret mới: openssl rand -hex 32"
    );
  }
  // Dev: không có fallback secret — yêu cầu cấu hình rõ ràng
  throw new Error(
    "Thiếu SESSION_SECRET trong .env. " +
    "Tạo secret mới: openssl rand -hex 32"
  );
}

const SESSION_SECRET = new TextEncoder().encode(rawSessionSecret);
const SESSION_NAME = "qltrungcung_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 giờ

// ── Create session ─────────────────────────────────────
export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(SESSION_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  // Set CSRF token cookie (readable by client JS)
  const csrfToken = generateCSRFToken();
  await setCSRFCookie(csrfToken);

  return token;
}

// ── Verify session ─────────────────────────────────────
export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ── Destroy session ────────────────────────────────────
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_NAME);
  await clearCSRFCookie();
}

// ── Require auth (throws nếu chưa login) ──────────────
export async function requireAuth(): Promise<SessionPayload> {
  const session = await verifySession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }

  const user = await withRetry(() =>
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    })
  );

  if (!user || !user.isActive) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };
}

// ── Require admin role ─────────────────────────────────
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

// ── Require auth + CSRF cho mutation endpoints ──────────
// Dùng thay requireAuth() trong POST/PUT/DELETE handlers.
// Tự động áp dụng rate limiting (30 req/phút) + CSRF check.
export async function requireMutationAuth(request: Request): Promise<SessionPayload> {
  // Rate limit: 30 mutation requests mỗi phút mỗi IP
  const rl = await rateLimit(request, { maxRequests: 30, windowSeconds: 60, prefix: 'mutation' });
  if (!rl.ok) {
    throw new Error("RATE_LIMITED");
  }

  const session = await requireAuth();
  await validateCSRF(request);
  return session;
}
