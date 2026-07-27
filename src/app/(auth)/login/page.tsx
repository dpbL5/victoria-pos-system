"use client";

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Đăng nhập thất bại");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <div className="mb-3 flex flex-col items-center justify-center gap-3">
          <div className="rounded-xl bg-white p-2 shadow-md">
            <Image
              src="/logo.jpg"
              alt="Victoria Archery Club"
              width={80}
              height={80}
              className="h-20 w-20 object-contain"
              priority
            />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-wide text-white">VICTORIA</h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-amber-400">
              Archery Club
            </p>
          </div>
        </div>
        <p className="mb-6 text-center text-sm text-zinc-400">Đăng nhập hệ thống POS</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Tên đăng nhập</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-4 py-2.5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Nhập tên đăng nhập"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Mật khẩu</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-4 py-2.5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Nhập mật khẩu"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            icon={LogIn}
            loading={loading}
            disabled={loading}
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>

        {/* <p className="mt-6 text-center text-xs text-zinc-500">
          Admin: admin / admin123 | Staff: staff / staff123
        </p> */}
      </div>
    </div>
  );
}
