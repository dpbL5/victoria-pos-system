# UI Patterns — Component Catalog & Examples

> Tài liệu reference — catalog component + ví dụ code UI, đọc on-demand từ CLAUDE.md (mục "UI Patterns"). Quy tắc tóm tắt nằm trong CLAUDE.md.

## Shared components bắt buộc (đã extract — dùng lại, không viết lại)

| Component | Import | Dùng khi |
|-----------|--------|----------|
| `Badge` | `@/components/ui/badge` | Trạng thái / loại (ACTIVE, COMPLETED, MEMBER...) |
| `StatCard` | `@/components/ui/stat-card` | Card thống kê (doanh thu, số phiên, KH mới...) |
| `EmptyState` | `@/components/ui/empty-state` | Table/list không có dữ liệu |
| `AppSkeleton` | `@/components/ui/skeleton` | Loading placeholder dùng chung |
| `Logo` | `@/components/ui/logo` | Brand mark. Inline SVG, mực theo `currentColor` + vàng theo token nên tự đổi theo theme app. **Không** dùng `<Image src="/victoria_logo.svg">` — file đó dùng `prefers-color-scheme`, bám theo theme OS chứ không bám class `.dark`, nên sai màu khi 2 theme lệch nhau |
| `Modal` | `@/components/ui/modal` | Dialog/modal (responsive: bottom sheet mobile, overlay desktop) |
| `ToastProvider` | `@/components/ui/toast` | Wrap dashboard layout — cung cấp toast notifications |
| `useToast` | `@/components/ui/toast` | Hook: `const { success, error } = useToast()` |
| `Input` | `@/components/ui/input` | Text input thống nhất |
| `Select` | `@/components/ui/input` | Select dropdown thống nhất |
| `Label` | `@/components/ui/input` | Form label (có required indicator) |
| `Textarea` | `@/components/ui/input` | Textarea input thống nhất |
| `Button` | `@/components/ui/button` | Nút (8 variants: accent `blue`/`red`/`red-soft`/`yellow` + trung tính `white`/`grey`/`contrast` + `ghost`, 4 sizes, loading state, icon). Link/`<a>` cần hình dạng button thì dùng `buttonClass({ variant, size })` từ cùng file |
| `FilterButton` | `@/components/ui/filter-button` | Nút filter toggle (active/onClick) |
| `NoticeCard` | `@/components/ui/notice-card` | Card thông báo (4 tones: info/success/warning/danger, title + description + action) |
| `SortableCardList` | `@/components/ui/sortable-card-list` | Danh sách card kéo thả (dụng cụ) |
| `SortableTable` | `@/components/ui/sortable-table` | Bảng kéo thả (dụng cụ) |

## Phiếu thu (dialog thu tiền — POS checkout)

Mọi dialog thu tiền dùng cấu trúc **phiếu hai liên** + **một rail tiền**:

- Liên 1 (TÍNH TIỀN) = đang tính cái gì → kết bằng **Tạm tính**. Liên 2 (THU TIỀN) = giảm gì, thu thế nào → **Tổng** → trừ cọc → chân phiếu **Cần thu** + nút thu. Liên 2 nằm trên bước `surface-secondary`, chạy tới chân phiếu; đường gấp là 24px giấy trắng + hairline.
- **Chuỗi số là một hàm thuần duy nhất**: `checkoutTotals()` trong `src/features/pos/checkout-totals.ts` (+ test). Không tính lại trong JSX. Công thức: `Tạm tính = giờ chơi (giá niêm yết) + hàng hoá`; `Tổng = Tạm tính − khuyến mại − phí gửi xe`; `Cần thu = Tổng − cọc (không vượt quá Tổng)`.
- **In số chính xác đến từng đồng** trong dialog thu tiền: dùng `money(value, false)`. `money()` mặc định `Math.ceil` lên hàng nghìn, nên các dòng sẽ không cộng lại đúng bằng tổng và lệch với số hoá đơn ghi.
- Mọi số tiền nằm trên `MONEY_RAIL` (`checkout-player-picker.tsx`), từ dòng đầu tới con số Display ở chân phiếu. Chỉ **một** con số cỡ 24px trên màn.
- Giá từng người chơi là **giá niêm yết**; khuyến mại là một dòng trừ riêng trong liên 2 (không net sẵn vào từng dòng).
- Bảng giá và phí gửi xe luôn hiện đầy đủ, không thu gọn; phí gửi xe áp cho cả hội viên (server không chặn theo hạng khách); khuyến mại chỉ hiện khi có khuyến mại để chọn hoặc đang có lỗi tải.

## Bề rộng nội dung trang (bắt buộc — mọi trang giống nhau)

Mọi trang dashboard dùng **cùng một bề rộng nội dung**: class `max-w-content`, sinh ra từ token `--container-content` trong `src/app/globals.css` (`@theme inline`).

```tsx
// Screen chuẩn — copy khối này cho trang mới
return (
  <div className="min-h-full bg-zinc-50 px-4 py-4 dark:bg-zinc-950 md:px-6 md:py-6">
    <div className="mx-auto max-w-content space-y-4">
      <header className="hidden items-center justify-between gap-3 md:flex">…</header>
      …
    </div>
  </div>
)
```

Quy tắc:

- **Không hardcode `max-w-3xl/4xl/5xl/6xl/7xl`** trong `src/features/**/*-screen.tsx` và `src/app/(dashboard)/**/page.tsx` — có test chặn: `src/lib/__tests__/page-content-width.test.ts`.
- Mọi `*-screen.tsx` phải chứa `max-w-content` (hoặc nằm trong danh sách full-bleed có chủ đích: `lessons-screen.tsx` — lịch FullCalendar).
- Loading toàn màn hình dùng `AppSkeleton`; khi có nội dung, screen vẫn theo quy tắc `max-w-content`.
- Đổi bề rộng toàn app = sửa đúng **1 dòng** `--container-content` trong `globals.css` (không sửa từng trang).
- Bề rộng riêng cho thành phần con (ví dụ tờ hoá đơn `max-w-3xl` trong chi tiết giao dịch) vẫn hợp lệ — test chỉ áp cho file trang/screen.

## Icon mapping chuẩn (dùng nhất quán toàn dự án)

- **Dùng `lucide-react` cho tất cả icons** — không dùng emoji trong UI
- Kích thước: `size={16}` inline, `size={20}` heading, `size={24}` icon lớn
- Style với Tailwind: `<User className="text-zinc-400" size={16} />`

| Ngữ cảnh | Icon | Ghi chú |
|----------|------|---------|
| Dashboard | `LayoutDashboard` | `size={20}` trên sidebar |
| Phiên bắn | `Timer` | Check-in, danh sách phiên |
| Khách hàng | `Users` | (dùng `Users`, không phải `User`) |
| Báo cáo | `BarChart3` | |
| Cài đặt | `Settings` | |
| Nhân viên | `UserCog` | |
| Thêm mới | `Plus` | Nút "Thêm", "Tạo mới" |
| Sửa | `Pencil` | |
| Xoá | `Trash2` | |
| Đóng / Huỷ | `X` | |
| Thanh toán | `CreditCard` | Checkout |
| Tìm kiếm | `Search` | |
| Lọc | `Filter` | |
| Check-in | `LogIn` | Nút check-in khách |
| Check-out | `LogOut` | Nút checkout |
| Làm mới | `RefreshCw` | Refresh data |
| Thành công | `CheckCircle` | className="text-emerald-500" |
| Lỗi | `XCircle` | className="text-red-500" |
| Cảnh báo | `AlertCircle` | className="text-amber-500" |
| Loading | `Loader2` | className="animate-spin" |
| Logout | `LogOut` | |
| Mũi tên | `ArrowLeft` / `ArrowRight` | Điều hướng |
| Chevron | `ChevronLeft` / `ChevronRight` | Collapse sidebar |
| Xuất file | `Download` | |
| Doanh thu | `DollarSign` | StatCard |
| Xu hướng | `TrendingUp` / `TrendingDown` | Trend indicator |
| Đồng hồ | `Clock` | Active sessions |
| Hội viên | `Ticket` | Check-in modal |
| Khách vãng lai | `Users` | Check-in modal |
| Mật khẩu | `Key` | Reset password |

## Design tokens (color)

Nguồn sự thật: **`src/app/globals.css`** — CSS custom properties định nghĩa trong `:root` (light) và `.dark` (dark mode), gồm `--color-brand`, `--color-surface-*`, `--color-border-*`, `--color-text-*`, `--color-success/warning/danger/info-*`, `--color-accent-purple-*`, `--shadow-*`, `--radius-*`.

Từ Tailwind v4, `globals.css` có block `@theme inline` **map token → utility class**. Token dùng được trực tiếp dưới dạng `bg-brand`, `text-yellow`, `border-danger`, `bg-surface-primary`… (light + dark tự động theo CSS var). Mỗi token có thể dùng với prefix `bg-`/`text-`/`border-`/`ring-`/`fill-`/`stroke-`:

| Token | Utility | Giá trị light | Giá trị dark | Dùng cho |
|-------|---------|---------------|--------------|----------|
| `--color-brand` | `bg-brand`, `text-brand` | `#2563eb` | `#1a1a1a` (charcoal) | Nút primary, nav active (light) |
| `--color-yellow` | `bg-yellow`, `text-yellow` | `#ffd444` | `#ffd444` | Vàng thương hiệu — dùng chung cả 2 theme |
| `--color-yellow-dark` | `text-yellow-dark`, `bg-yellow-dark` | `#8a6a00` | `#ffd444` | Bước đậm của yellow để làm chữ/icon trên nền sáng (tagline, hội viên) |
| `--color-yellow-bg` / `-border` | `bg-yellow-bg`, `border-yellow-border` | tint `rgba(255,212,68,.16/.45)` | tint `rgba(255,212,68,.16/.38)` | Nền/viền nhạt cho badge, chip hội viên |
| `--color-text-tertiary` | `text-text-tertiary` | `#71717a` | `#a1a1aa` | Chữ mờ (nút `ghost`, placeholder) — đủ tương phản 4.5:1 |
| `--color-surface-primary` | `bg-surface-primary` | `#ffffff` | `#18181b` | Nền trang chính |
| `--color-surface-secondary` | `bg-surface-secondary` | `#f8fafc` | `#27272a` | Cards, sidebar |
| `--color-border-default` | `border-border-default` | `#e2e8f0` | `#3f3f46` | Card/table border |
| `--color-text-primary` | `text-text-primary` | `#0f172a` | `#fafafa` | Headings |
| `--color-success` | `text-success`, `bg-success` | `#15803d` | `#22c55e` | Trạng thái thành công |
| `--color-warning` | `text-warning`, `bg-warning` | `#b45309` | `#f59e0b` | Cảnh báo |
| `--color-danger` | `text-danger`, `bg-danger` | `#b91c1c` | `#ef4444` | Lỗi |
| `--color-accent-purple` | `text-accent-purple` | `#6d28d9` | `#8b5cf6` | Nhãn không thuộc hội viên (vai trò ADMIN, "Bắt buộc", "Hôm nay") |

| `--color-info` | `text-info`, `bg-info` | `#1d4ed8` | `#3b82f6` | Thông tin |

> Lưu ý: `--color-brand` đổi thành charcoal trong dark mode (theo thương hiệu). Nút `blue` dùng `--color-info` (không dùng `--color-brand`) để vẫn là màu xanh ở dark.

### Bộ variant cho nút — accent + trung tính

`Button` có 4 accent (`blue`/`red`/`red-soft`/`yellow`) + 3 trung tính (`white`/`grey`/`contrast`) + `ghost`, mỗi variant map vào token có sẵn (không hardcode màu):

| Variant | Vai trò | Token nền | Token tint |
|---|---|---|---|
| `blue` | Hành động brand: tạo mới, đăng nhập, mở dialog, điều hướng, Xem báo cáo | `--color-info` | `info-bg`/`info-border` |
| `red` | Phá huỷ & kết thúc: Xoá, Huỷ hoá đơn, Huỷ lịch, Ngắt kết nối, Đăng xuất, Kết thúc lớp, Vô hiệu hoá, Đóng ca | `--color-danger` | `danger-bg`/`danger-border` |
| `red-soft` | `red` bản nhạt cho nút icon trong bảng/card | `--color-danger-bg` | `--color-danger-border` |
| `yellow` | Mọi thao tác thuộc hội viên (chọn chế độ Hội viên, đăng ký, gia hạn) | `--color-yellow` | `yellow-bg`/`yellow-border` |
| `white` | Trung tính: Huỷ, Quay lại, Thử lại, Xem, Tìm, phân trang, sửa/xem (icon trong row) | `surface-elevated` + `border-default` | `surface-tertiary` (hover) |
| `grey` | Trung tính nền xám, không viền — tile hành động màn Ca (Bán kèm, Bán lẻ) | `surface-tertiary` | — |
| `contrast` | **Nút hành động chính**: đảo màu (đậm ở light, trắng ở dark) — Thêm/Tạo, Lưu, Cập nhật, Thu tiền, Check-in, Mở ca, Đăng nhập, tile Check-in màn Ca | `text-primary` + `text-inverse` | — |
| `ghost` | Tiện ích nền trong suốt: đóng modal, chevron, toggle filter | — | `surface-tertiary` (hover) |

Quy ước chọn variant:
- Nút hành động chính (thêm/tạo, submit form, thu tiền, check-in, mở ca) dùng `contrast`; nút phụ (huỷ, quay lại, thử lại, xem, phân trang) dùng `white`.
- Hành động xoá/kết thúc: có chữ → `red`; icon-only trong bảng/card → `red-soft`.
- Thao tác liên quan hội viên → `yellow`.
- Mặc định khi không truyền `variant` là `blue`.

### Card primitive

Shell thẻ chuẩn đã extract thành **`Card`** (`@/components/ui/card`) — dùng cho mọi khối nội dung, thay cho việc lặp class dài:

```tsx
import { Card } from "@/components/ui/card";

<Card padding="md">          // "none" | "sm" | "md" | "lg"
  Nội dung
</Card>

<Card padding="md" interactive className="text-left">  // thẻ bấm được (hover)
  ...
</Card>
```

Card render `div` với class cơ sở `rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900` + padding theo prop. **Không dùng Card để thay `<button>`/`<a>`** (Card là `div`).

## Ví dụ code UI

### Toast notification (dùng thay inline feedback)

```tsx
import { useToast } from "@/components/ui/toast";

const { success: notifySuccess, error: notifyError } = useToast();

notifySuccess("Tạo thành công!");
notifyError(d.error || "Lỗi kết nối máy chủ");
```

→ Toast tự động dismiss sau 3.5s. Không cần `feedback` state. Vẫn dùng text đỏ nhỏ dưới field cho form validation errors.

### Modal (thay thế inline modal code)

```tsx
import { Modal } from "@/components/ui/modal";

<Modal
  open={showModal}
  onClose={() => setShowModal(false)}
  title="Tiêu đề"
  description="Mô tả phụ (tuỳ chọn)"
  size="md"            // "sm" | "md" | "lg" | "full"
  overlayColor="rgba(0,0,0,0.5)" // màu overlay (mặc định --color-surface-overlay)
  footer={<>Nút ở đây</>}
>
  {children}
</Modal>
```

→ Tự động: lock body scroll, close on Escape, click-outside-to-close, animate vào/ra, responsive (bottom sheet mobile, centered overlay desktop), **focus trap** (Tab giữ trong modal, restore focus về phần tử trước khi mở), padding responsive (`px-4 py-3` mobile / `sm:px-5 sm:py-4` desktop).

### Loading UI

```tsx
import { AppSkeleton } from '@/components/ui/skeleton'

if (loading) return <AppSkeleton />
```

Chỉ dùng `AppSkeleton` cho loading placeholder. Không tạo skeleton component, markup, animation, hoặc style riêng; với tải lại cục bộ, giữ nội dung hiện tại hoặc dùng trạng thái loading của control.

### Badge

```tsx
import { Badge } from "@/components/ui/badge";

<Badge variant="success">Đang chơi</Badge>
<Badge variant="warning">Tạm dừng</Badge>
<Badge variant="danger">Đã nghỉ</Badge>
<Badge variant="yellow">Hội viên</Badge>
<Badge variant="default">Vãng lai</Badge>
<Badge variant="outline">Nháp</Badge>
<Badge size="sm">Nhỏ</Badge>          // size="sm" | "md" (default)
```

### StatCard

```tsx
import { StatCard } from "@/components/ui/stat-card";
import { DollarSign } from "lucide-react";

<StatCard
  label="Doanh thu hôm nay"
  value={formatVND(revenue)}
  color="green"              // "green" | "blue" | "yellow" | "red" | "purple" | "default"
  icon={DollarSign}          // LucideIcon
  trend={{ value: 12, label: "vs hôm qua" }}  // optional
/>
```

### Empty State

```tsx
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "lucide-react";

<EmptyState
  message="Không có dữ liệu"
  description="Hướng dẫn thêm cho người dùng"
  icon={Inbox}               // LucideIcon, default Inbox
  action={<button>Thêm mới</button>}
/>
```

### Loading (full page)

```tsx
if (loading) return <AppSkeleton />
```
