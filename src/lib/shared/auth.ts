// ── JWT Auth với jose ───────────────────────────────────
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/infrastructure/prisma";
import { generateCSRFToken, setCSRFCookie, clearCSRFCookie, validateCSRF } from "@/lib/shared/csrf";
import { rateLimit } from "@/lib/shared/rate-limit";
import { withRetry } from "@/lib/infrastructure/db-retry";
import type { SessionPayload } from "@/types";
import {
  hasAnyPermission,
  isSuperuserRole,
  type PermissionGroupDef,
} from "@/lib/shared/permissions";
import { measureApiAuth, recordApiRetry } from '@/lib/infrastructure/api-diagnostics'

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
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 1 tuần

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

// ── AuthUser — user + role + permissions (nguồn truth là DB) ──
export interface AuthRoleInfo {
  id: string;
  /** 'ADMIN' với role hệ thống; null với role admin tự tạo */
  key: string | null;
  name: string;
  locked: boolean;
  /** Khóa quyền từ permission catalog */
  permissions: string[];
}

export interface AuthUser {
  userId: string;
  username: string;
  fullName: string;
  /** null = "Chưa phân vai" — không có quyền nào */
  role: AuthRoleInfo | null;
}

// ── User lookup cache — giảm 1 DB read mỗi request ──────
// requireAuth() chạy trên mọi API request (49 route files). Không cache → mỗi
// request tốn 1 `user.findUnique`. Cache in-memory TTL ngắn giảm tải đáng kể
// trên pool chỉ 3 connections, vẫn phản ứng kịp khi user/role bị đổi (TTL 30s).
const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<string, { user: AuthUserLookup | null; expiresAt: number }>();

interface AuthUserLookup {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
  role: {
    id: string;
    key: string | null;
    name: string;
    locked: boolean;
    permissions: { permission: string }[];
  } | null;
}

function getCachedUser(userId: string): AuthUserLookup | null | undefined {
  const entry = userCache.get(userId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    userCache.delete(userId);
    return undefined;
  }
  return entry.user;
}

function toAuthUser(user: AuthUserLookup): AuthUser {
  return {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role
      ? {
          id: user.role.id,
          key: user.role.key,
          name: user.role.name,
          locked: user.role.locked,
          permissions: user.role.permissions.map((p) => p.permission),
        }
      : null,
  };
}

// ── Require auth (throws nếu chưa login) ──────────────
export async function requireAuth(): Promise<AuthUser> {
  return measureApiAuth(async () => {
    const session = await verifySession();
    if (!session) {
      throw new Error("UNAUTHORIZED");
    }

    const cached = getCachedUser(session.userId);
    let user: AuthUserLookup | null;
    if (cached === undefined) {
      user = await withRetry(() =>
        prisma.user.findUnique({
          where: { id: session.userId },
          select: {
            id: true,
            username: true,
            fullName: true,
            isActive: true,
            role: {
              select: {
                id: true,
                key: true,
                name: true,
                locked: true,
                permissions: { select: { permission: true } },
              },
            },
          },
        }), { onRetry: recordApiRetry }
      );
      userCache.set(session.userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
    } else {
      user = cached;
    }

    if (!user || !user.isActive) {
      throw new Error("UNAUTHORIZED");
    }

    return toAuthUser(user);
  })
}

// ── Require permission (any-of) ─────────────────────────
// ADMIN (key = 'ADMIN') bypass mọi guard. Còn lại cần ít nhất một trong các quyền.
export async function requirePermission(...permissionKeys: string[]): Promise<AuthUser> {
  const user = await requireAuth();
  if (isSuperuserRole(user.role)) return user;
  if (!hasAnyPermission(user.role?.permissions, permissionKeys)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/** Require quyền từ một nhóm permission (bất kỳ quyền nào trong nhóm) */
export async function requireGroupPermission(group: PermissionGroupDef): Promise<AuthUser> {
  return requirePermission(...group.permissions.map((p) => p.key));
}

/** Chỉ role hệ thống ADMIN — bootstrap/seed, không gán được qua role tuỳ chỉnh */
export async function requireSuperuser(): Promise<AuthUser> {
  const user = await requireAuth();
  if (!isSuperuserRole(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/** Check permission thuần trên AuthUser (đã tính bypass ADMIN) — dùng sau requireMutationAuth */
export function userHasPermission(user: AuthUser, ...permissionKeys: string[]): boolean {
  return isSuperuserRole(user.role) || hasAnyPermission(user.role?.permissions, permissionKeys);
}

// ── Require auth + CSRF cho mutation endpoints ──────────
// Dùng thay requireAuth() trong POST/PUT/DELETE handlers.
// Tự động áp dụng rate limiting (30 req/phút) + CSRF check.
// Phân quyền do route tự check bằng requirePermission/isSuperuserRole.
export async function requireMutationAuth(request: Request): Promise<AuthUser> {
  // Rate limit: 30 mutation requests mỗi phút mỗi IP
  const rl = await rateLimit(request, { maxRequests: 30, windowSeconds: 60, prefix: 'mutation' });
  if (!rl.ok) {
    throw new Error("RATE_LIMITED");
}

  const user = await requireAuth();
  await validateCSRF(request);
  return user;
}
