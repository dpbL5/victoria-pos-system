import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Victoria Archery Club - POS",
  description: "Hệ thống POS vận hành Victoria Archery Club",
  icons: {
    icon: [{ url: "/victoria_logo.svg", type: "image/svg+xml" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("qltrungcung_theme")?.value;
  const isDark = themeCookie === "dark";

  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${isDark ? "dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Theme anti-flicker script: chạy trước khi page render để tránh
          flash sai theme. Script này là static, KHÔNG chứa user input.
          Server cookie (qltrungcung_theme) xử lý theme cho lần load đầu;
          script này fallback về localStorage/system preference.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    var theme = localStorage.getItem('qltrungcung_theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
