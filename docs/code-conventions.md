# Code Conventions — Templates & Examples

> Tài liệu reference — các template chuẩn, đọc on-demand từ CLAUDE.md (mục "Quy ước code"). Quy tắc tóm tắt nằm trong CLAUDE.md.

## Import order

```
1. React / Next.js        (import { useState } from "react")
2. Thư viện ngoài          (import { User } from "lucide-react")
3. @/lib/*                (import { formatVND } from "@/lib/utils")
4. @/types                (import type { Customer } from "@/types")
5. @/components/*         (import { Badge } from "@/components/ui/badge")
6. Relative imports       (import "./form.css")
```

```tsx
// ✅ ĐÚNG
import { formatVND } from "@/lib/utils";
import type { Customer } from "@/types";
import { User, Plus, CheckCircle } from "lucide-react";

// ❌ SAI — định nghĩa lại util/types cục bộ
function formatVND(n: number) { return n.toLocaleString("vi-VN") + "đ"; }
interface Customer { id: string; fullName: string; ... }
```

## Pattern viết Client Component (page)

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { formatVND } from "@/lib/utils";
import type { Customer } from "@/types";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

export default function CustomersPage() {
  const { success: notifySuccess, error: notifyError } = useToast();
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/customers");
      const d = await r.json();
      if (d.success) setData(d.data);
      else setError(d.error);
    } catch {
      setError("Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-4 md:p-6"><TableSkeleton rows={6} cols={5} /></div>;
  if (error) return <p className="text-red-500 text-sm p-4">{error}</p>;

  return (/* ... */);
}
```

## Data Fetching (Client Component)

```tsx
const [data, setData] = useState<T[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

const load = useCallback(async () => {
  setLoading(true);
  setError("");
  try {
    const r = await fetch("/api/endpoint");
    const d = await r.json();
    if (d.success) {
      setData(d.data);
    } else {
      setError(d.error);
    }
  } catch {
    setError("Lỗi kết nối máy chủ");
  } finally {
    setLoading(false);
  }
}, [/* dependencies */]);

// eslint-disable-next-line react-hooks/set-state-in-effect
useEffect(() => { load(); }, [load]);
```

## Forms

```tsx
import { Input, Select, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const { success: notifySuccess, error: notifyError } = useToast();
const [form, setForm] = useState({ name: "", phone: "" });
const [submitting, setSubmitting] = useState(false);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setSubmitting(true);
  try {
    const r = await fetch("/api/endpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    if (d.success) {
      notifySuccess("Tạo thành công!");
      setForm({ name: "", phone: "" }); // Reset form
      load(); // Refresh data
    } else {
      notifyError(d.error);
    }
  } catch {
    notifyError("Lỗi kết nối máy chủ");
  } finally {
    setSubmitting(false);
  }
};
```

## API Route template

```ts
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { someSchema } from "@/lib/<domain>/validations";
import { repositories } from "@/lib/infrastructure/repositories";
import { apiSuccess, apiError, resultToResponse, ERR_UNAUTHORIZED, ERR_CSRF } from "@/lib/infrastructure/api-helpers";

// Read-only route: validate → query qua repositories → apiSuccess/apiError
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const data = await repositories.someDomain.findMany(/* ... */);
    return apiSuccess(data);
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return apiError(ERR_UNAUTHORIZED);
    }
    console.error("GET /api/endpoint error:", error);
    return apiError({ code: "SERVER_ERROR", message: "Lỗi máy chủ", status: 500 });
  }
}

// Mutation route: validate → gọi use-case (tự chạy runInTransaction) → resultToResponse
export async function POST(request: NextRequest) {
  try {
    const auth = await requireMutationAuth(request); // JWT + CSRF + rate limit

    const body = await request.json();
    const parsed = someSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({ code: "VALIDATION", message: parsed.error.issues[0].message, status: 400 });
    }

    const result = await someUseCase({ ...parsed.data, staffId: auth.userId });
    return resultToResponse(result, mapSomeError);
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return apiError(ERR_UNAUTHORIZED);
    }
    if ((error as Error).message === "CSRF_MISMATCH") {
      return apiError(ERR_CSRF);
    }
    console.error("POST /api/endpoint error:", error);
    return apiError({ code: "SERVER_ERROR", message: "Lỗi máy chủ", status: 500 });
  }
}
```

Lưu ý: `import { prisma }` không được dùng ở route — query qua `repositories` singleton; mutation nhiều bảng qua use-case (dùng `runInTransaction`). Các hằng số lỗi auth: `ERR_UNAUTHORIZED`, `ERR_FORBIDDEN`, `ERR_CSRF`.

## Error Handling

**API:**

```ts
try {
  // ...
} catch (error) {
  if ((error as Error).message === "UNAUTHORIZED") {
    return apiError(ERR_UNAUTHORIZED);
  }
  if ((error as Error).message === "FORBIDDEN") {
    return apiError(ERR_FORBIDDEN);
  }
  if ((error as Error).message === "CSRF_MISMATCH") {
    return apiError(ERR_CSRF);
  }
  console.error("METHOD /api/path error:", error); // Server log
  return apiError({ code: "SERVER_ERROR", message: "Lỗi máy chủ", status: 500 });
}
```

Business errors không nằm trong try-catch — use-case trả `Result<T>` (`err()`/`fail()`), route dùng `resultToResponse(result, mapXxxError)`. Xem `CLAUDE.md` §10b.

**Client:**

```ts
try {
  const r = await fetch("/api/...");
  const d = await r.json();
  if (d.success) {
    // handle success
  } else {
    setError(d.error); // Hiển thị lỗi từ server
  }
} catch {
  setError("Lỗi kết nối máy chủ"); // Network error
}
```

## Real-time ticker (đồng hồ / thành tiền realtime)

```tsx
// Force re-render mỗi giây để cập nhật elapsed time + cost
const [, setTick] = useState(0);
useEffect(() => {
  const id = setInterval(() => setTick((t) => t + 1), 1000);
  return () => clearInterval(id);
}, []);

// Helper tính thời gian dạng hh:mm:ss
function calcElapsedHMS(startTime: string): string {
  const diffMs = Date.now() - new Date(startTime).getTime();
  if (diffMs < 0) return "00:00:00";
  const totalSeconds = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

// Helper tính thành tiền, làm tròn lên hàng chục nghìn
function calcCurrentCost(startTime: string, hourlyRate: number): number {
  const diffMs = Date.now() - new Date(startTime).getTime();
  if (diffMs < 0) return 0;
  const diffHours = diffMs / (1000 * 60 * 60);
  const raw = diffHours * Number(hourlyRate);
  return Math.ceil(raw / 10000) * 10000;
}
```
