// ── API Client với CSRF Protection ─────────────────────
// Wrapper quanh fetch() tự động đọc CSRF cookie và gửi
// header X-CSRF-Token cho các mutation requests.

import { CSRF_HEADER, CSRF_COOKIE } from "@/lib/shared/constants";

function getCSRFToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

/**
 * Gọi API với CSRF token tự động cho POST/PUT/PATCH/DELETE.
 *
 * - GET requests: fetch bình thường
 * - POST/PUT/PATCH/DELETE: tự động thêm header X-CSRF-Token
 * - body là object → tự động JSON.stringify + set Content-Type
 */
export async function api(url: string, options: ApiOptions = {}): Promise<Response> {
  const { body, headers: customHeaders, ...rest } = options;
  const method = (rest.method || "GET").toUpperCase();

  const headers: Record<string, string> = {};

  // CSRF token cho mutation requests
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = getCSRFToken();
    if (csrfToken) {
      headers[CSRF_HEADER] = csrfToken;
    }
  }

  // JSON body handling
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // Merge custom headers
  if (customHeaders) {
    if (customHeaders instanceof Headers) {
      customHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(customHeaders)) {
      for (const [key, value] of customHeaders) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, customHeaders);
    }
  }

  return fetch(url, {
    ...rest,
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
