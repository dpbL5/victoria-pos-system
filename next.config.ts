import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*","192.168.0.106"],

  // ── Security Headers ───────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Ngăn clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Ngăn MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Giới hạn Referer gửi đi
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Chỉ cho phép script/style từ cùng origin + inline cần thiết cho Next.js
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js cần unsafe-eval cho dev
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          // Thông báo browser nên dùng HTTPS
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Hạn chế quyền browser features
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
