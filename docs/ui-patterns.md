# UI Patterns — Component Catalog & Examples

> Tài liệu reference — catalog component + ví dụ code UI, đọc on-demand từ CLAUDE.md (mục "UI Patterns"). Quy tắc tóm tắt nằm trong CLAUDE.md.

## Shared components bắt buộc (đã extract — dùng lại, không viết lại)

| Component | Import | Dùng khi |
|-----------|--------|----------|
| `Badge` | `@/components/ui/badge` | Trạng thái / loại (ACTIVE, COMPLETED, MEMBER...) |
| `StatCard` | `@/components/ui/stat-card` | Card thống kê (doanh thu, số phiên, KH mới...) |
| `EmptyState` | `@/components/ui/empty-state` | Table/list không có dữ liệu |
| `LoadingDots` | `@/components/ui/loading-dots` | Full-page loading spinner |
| `Skeleton` | `@/components/ui/skeleton` | Skeleton loading riêng lẻ |
| `TableSkeleton` | `@/components/ui/skeleton` | Skeleton table (rows × cols) |
| `StatCardsSkeleton` | `@/components/ui/skeleton` | Skeleton stat card grid |
| `CardSkeleton` | `@/components/ui/skeleton` | Skeleton card đơn |
| `Modal` | `@/components/ui/modal` | Dialog/modal (responsive: bottom sheet mobile, overlay desktop) |
| `ToastProvider` | `@/components/ui/toast` | Wrap dashboard layout — cung cấp toast notifications |
| `useToast` | `@/components/ui/toast` | Hook: `const { success, error } = useToast()` |
| `Input` | `@/components/ui/input` | Text input thống nhất |
| `Select` | `@/components/ui/input` | Select dropdown thống nhất |
| `Label` | `@/components/ui/input` | Form label (có required indicator) |
| `Textarea` | `@/components/ui/input` | Textarea input thống nhất |
| `Button` | `@/components/ui/button` | Nút (6 variants: primary/secondary/danger/ghost/inverse/outline-danger, 4 sizes, loading state, icon) |
| `FilterButton` | `@/components/ui/filter-button` | Nút filter toggle (active/onClick) |
| `NoticeCard` | `@/components/ui/notice-card` | Card thông báo (4 tones: info/success/warning/danger, title + description + action) |
| `SortableCardList` | `@/components/ui/sortable-card-list` | Danh sách card kéo thả (dụng cụ) |
| `SortableTable` | `@/components/ui/sortable-table` | Bảng kéo thả (dụng cụ) |

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

Codebase hiện tại viết style bằng **Tailwind utility classes (bảng zinc)** — bảng tham chiếu dưới đây phản ánh convention đang dùng; đối chiếu `globals.css` khi cần giá trị màu chính xác (globals.css dùng bảng màu slate cho các giá trị semantic).

| Token | Tailwind class (light) | Tailwind class (dark override) | Dùng cho |
|-------|------------------------|-------------------------------|----------|
| Surface primary | `bg-white` | `dark:bg-zinc-950` | Nền trang chính |
| Surface secondary | `bg-zinc-50` | `dark:bg-zinc-900` | Cards, sidebar |
| Surface elevated | `bg-white` | `dark:bg-zinc-900` | Modal, dropdown |
| Border default | `border-zinc-200` | `dark:border-zinc-800` | Card border, table border |
| Border input | `border-zinc-300` | `dark:border-zinc-700` | Input, select border |
| Text primary | `text-zinc-900` | `dark:text-white` | Headings |
| Text secondary | `text-zinc-500` | `dark:text-zinc-400` | Labels, descriptions |
| Text tertiary | `text-zinc-400` | `dark:text-zinc-500` | Placeholder, muted |
| Brand / Primary | `bg-blue-600 text-white` | `dark:bg-blue-600 dark:text-white` | Nút chính, nav active |
| Success | `text-emerald-600 bg-emerald-50` | `dark:text-emerald-400 dark:bg-emerald-500/15` | Active, thành công |
| Warning | `text-amber-600 bg-amber-50` | `dark:text-amber-400 dark:bg-amber-500/15` | Cảnh báo |
| Danger | `text-red-600 bg-red-50` | `dark:text-red-400 dark:bg-red-500/15` | Lỗi, disabled |
| Purple accent | `text-purple-600 bg-purple-50` | `dark:text-purple-400 dark:bg-purple-500/15` | Member badge |

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
  footer={<>Nút ở đây</>}
>
  {children}
</Modal>
```

→ Tự động: lock body scroll, close on Escape, click-outside-to-close, animate vào/ra, responsive (bottom sheet mobile, centered overlay desktop), **focus trap** (Tab giữ trong modal, restore focus về phần tử trước khi mở), padding responsive (`px-4 py-3` mobile / `sm:px-5 sm:py-4` desktop).

### Skeleton loading (preferred cho table/card pages)

```tsx
import { Skeleton, TableSkeleton, StatCardsSkeleton } from "@/components/ui/skeleton";

// Table skeleton
if (loading) return <div className="p-4 md:p-6"><TableSkeleton rows={6} cols={5} /></div>;

// Stat cards skeleton
if (loading) return <StatCardsSkeleton count={4} />;

// Skeleton riêng lẻ
<Skeleton className="h-4 w-32" />
```

### Badge

```tsx
import { Badge } from "@/components/ui/badge";

<Badge variant="success">Đang chơi</Badge>
<Badge variant="warning">Tạm dừng</Badge>
<Badge variant="danger">Đã nghỉ</Badge>
<Badge variant="purple">Hội viên</Badge>
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
if (loading) return <LoadingDots />;
if (loading) return <LoadingDots variant="dots" message="Đang tải..." />;
```
