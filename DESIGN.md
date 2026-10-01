---
name: Victoria Archery Club POS
description: Hệ thống POS vận hành CLB bắn cung — mobile-first, tiếng Việt, light + dark.
colors:
  # Neutral — thang zinc. Value = giá trị :root (light); override .dark ghi trong mục Colors.
  surface-primary: "#ffffff"
  surface-secondary: "#fafafa"
  surface-tertiary: "#f4f4f5"
  surface-elevated: "#ffffff"
  surface-overlay: "rgba(15, 23, 42, 0.6)"
  border-default: "#e4e4e7"
  border-strong: "#d4d4d8"
  text-primary: "#18181b"
  text-secondary: "#3f3f46"
  text-tertiary: "#71717a"
  text-inverse: "#ffffff"
  # Accent — vàng thương hiệu (hồng tâm)
  yellow: "#ffd444"
  yellow-dark: "#8a6a00"
  yellow-bg: "rgba(255, 212, 68, 0.16)"
  yellow-border: "rgba(255, 212, 68, 0.45)"
  # Accent — hành động vận hành
  info: "#1d4ed8"
  info-bg: "#eff6ff"
  info-border: "#bfdbfe"
  focus-ring: "#2563eb"
  # Status
  success: "#15803d"
  success-bg: "#f0fdf4"
  success-border: "#bbf7d0"
  warning: "#b45309"
  warning-bg: "#fffbeb"
  warning-border: "#fde68a"
  danger: "#b91c1c"
  danger-bg: "#fef2f2"
  danger-border: "#fecaca"
  # Tertiary — nhãn không thuộc hội viên
  accent-purple: "#6d28d9"
  accent-purple-bg: "#f5f3ff"
  accent-purple-border: "#ddd6fe"
  # Identity — chỉ dùng cho logo/wordmark, KHÔNG dùng làm utility UI
  brand: "#2563eb"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: "1.75rem"
    letterSpacing: "0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  overline:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.15em"
  numeric:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  island: "28px"
  full: "9999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-contrast:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-action:
    backgroundColor: "{colors.info}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.text-inverse}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-danger-soft:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  button-gold:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-neutral:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    textColor: "{colors.text-tertiary}"
    rounded: "{rounded.lg}"
    padding: "6px"
  input:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "42px"
  card:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.xl}"
    padding: "16px"
  modal-panel:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.2xl}"
  badge:
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
  stat-card:
    backgroundColor: "{colors.surface-tertiary}"
    rounded: "{rounded.xl}"
    padding: "16px 20px"
  nav-island:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.island}"
    height: "64px"
---

# Design System: Victoria Archery Club POS

## Overview

**Creative North Star: "Ink & Gold Ledger"**

Hệ này là một **sổ điểm vận hành**, không phải một dashboard. Mọi màn hình đều trả lời đúng một câu hỏi của người đang đứng quầy: *số tiền này là bao nhiêu, và nó có khớp không.* Vì vậy bố cục nghiêng về mật độ thông tin và tương phản chữ, không nghiêng về khoảng trắng lãng mạn. Bề mặt gần như vô sắc — một thang neutral duy nhất từ paper trắng tới canvas xám — để chữ và con số là thứ duy nhất nổi lên. Độ sâu đến từ **bước tint**, không đến từ bóng đổ.

Màu duy nhất được phép trang trí là **vàng hồng tâm**. Trong bắn cung, vàng là vòng trong cùng: bắn vào đó mới ghi điểm. Trong hệ này, vàng chỉ xuất hiện ở hội viên, ở nhận diện thương hiệu, và ở những chỗ liên quan trực tiếp tới tiền — và xuất hiện thưa. Sự thưa đó là điểm mạnh: vì cả app gần như đơn sắc, một chip vàng ở màn Hội viên đọc được ngay lập tức từ khoảng cách một sải tay. Màu vận hành còn lại là xanh `info` cho hành động, và bộ ba success/warning/danger cho trạng thái. Không có màu thứ tư nào được phép gia nhập.

Chất liệu là **tactile**: nút và control được thiết kế cho ngón tay cái trên điện thoại, có phản hồi chạm rõ ràng, kích thước đủ lớn để bấm khi tay đang cầm máy và khách đang chờ. Hệ chạy light + dark như hai biến thể ngang hàng của cùng một world, không phải dark là bản phụ của light.

**Key Characteristics:**

- Một thang neutral duy nhất (zinc) làm toàn bộ nền/chữ/viền; không có màu trang trí thứ hai.
- Vàng hồng tâm dùng thưa, chỉ cho hội viên + nhận diện + nhấn tiền.
- Phẳng mặc định: `shadow-sm` là mức cao nhất của một bề mặt ở trạng thái nghỉ.
- Hai cỡ chữ gánh gần hết giao diện: 12px và 14px.
- Số liệu luôn `tabular-nums`; tiền và thời gian dùng mono.
- Mobile-first 375px+; desktop chỉ là bản mở rộng của cùng bố cục.
- Light + dark là hai biến thể ngang hàng, cùng một thang màu.

> **Trạng thái chuyển đổi.** `src/app/globals.css` là nguồn sự thật về màu. Token neutral đã được re-point để **trùng khít** thang zinc đang hiển thị, nên việc migrate class zinc hardcode (~1.550 chỗ) sang token là **refactor không đổi pixel**. UI mới hoặc vừa sửa phải dùng token. Debt còn lại tập trung ở: `features/pos/invoice-detail-content.tsx`, `features/memberships/customer-detail-screen.tsx`, `features/reports/reports-overview.tsx`, `features/reports/reports-charts.tsx`, `features/transactions/shift-transactions-screen.tsx`, và trong chính vài primitive (`components/ui/modal.tsx`, `components/ui/empty-state.tsx`).

## Colors

Bảng màu gần như đơn sắc, chạy trên một thang neutral zinc, với đúng một màu trang trí (vàng) và hai màu chức năng (xanh hành động, bộ ba trạng thái).

> Mọi giá trị dưới đây là bản chiếu của `src/app/globals.css`. File đó là normative — DESIGN.md phản chiếu, không định nghĩa lại. **The One Source Rule.**
> Value ghi trong frontmatter là giá trị `:root` (light). Mỗi dòng dưới đây ghi kèm giá trị `.dark`.

### Primary

- **Sight Blue / xanh hành động** (`--color-info`, `#1d4ed8` → dark `#3b82f6`): màu của mọi hành động vận hành có chủ đích — nav active, nút hành động mặc định, avatar tài khoản, chip filter đang chọn, focus ring (light `#2563eb`). Đây là accent được dùng nhiều nhất trong app, và nó **không** phải `--color-brand`.
- **Bullseye Gold / vàng hồng tâm** (`--color-yellow`, `#ffd444` ở cả hai theme): vàng thương hiệu lấy từ logo. Chỉ dùng cho: badge/CTA hội viên, tagline wordmark, nhấn liên quan tiền. Trên nền sáng dùng `text-yellow-dark`, trên nền tối dùng `text-yellow`.

### Secondary

- **Ledger Tints / bộ tint trạng thái** (`success` `#15803d` → `#22c55e`, `warning` `#b45309` → `#f59e0b`, `danger` `#b91c1c` → `#ef4444`): mỗi màu đi thành bộ ba `-bg` / `-border` / màu gốc. Light dùng tint đặc (`#f0fdf4`, `#fffbeb`, `#fef2f2`), dark dùng tint alpha `rgba(...,0.1)` trên nền tối. Dùng cho badge trạng thái, NoticeCard, StatCard, và số âm.
- **Admin Violet** (`--color-accent-purple`, `#6d28d9` → `#8b5cf6`): nhãn không-thuộc-hội-viên — vai trò ADMIN, "Bắt buộc", "Hôm nay". Là màu thứ tư duy nhất được phép, và chỉ cho nhãn.

### Neutral

- **Ink** (`--color-text-primary`, `#18181b` → `#ffffff`): chữ chính, tiêu đề, số tiền. Tương phản 17:1 trên canvas.
- **Ink Soft** (`--color-text-secondary`, `#3f3f46` → `#d4d4d8`): nhãn field, chữ phụ, mô tả. 10:1 trên canvas.
- **Ink Muted** (`--color-text-tertiary`, `#71717a` → `#a1a1aa`): chữ mờ nhất được phép — placeholder, nút ghost, meta. 4.6:1 trên canvas, đúng ngưỡng WCAG AA.
- **Ink Inverse** (`--color-text-inverse`, `#ffffff` → `#09090b`): chữ trên khối đảo màu (nút `contrast`).
- **Paper** (`--color-surface-primary`, `#ffffff` → `#09090b`): nền body, chrome sidebar/header, và nền của khối đảo màu.
- **Canvas** (`--color-surface-secondary`, `#fafafa` → `#09090b`): nền của mọi màn dashboard. Đây là bề mặt phổ biến nhất trong app.
- **Tint** (`--color-surface-tertiary`, `#f4f4f5` → `#27272a`): hover, dải inset (header/footer modal), chip trung tính. Là bước tint dùng để tạo chiều sâu.
- **Card** (`--color-surface-elevated`, `#ffffff` → `#18181b`): card, modal, input, popover.
- **Hairline** (`--color-border-default`, `#e4e4e7` → `#27272a`): viền card/row/dải phân cách. Viền 1px là công cụ tách lớp chính.
- **Hairline Strong** (`--color-border-strong`, `#d4d4d8` → `#52525b`): viền input và chip outline — nơi đường viền phải đủ rõ để mời gõ vào.
- **Scrim** (`--color-surface-overlay`, `rgba(15,23,42,0.6)` → `rgba(0,0,0,0.7)`): lớp phủ sau modal/drawer.

### Named Rules

**The One Source Rule.** `src/app/globals.css` sở hữu mọi giá trị màu; DESIGN.md phản chiếu nó. Không bao giờ viết giá trị thứ ba — không hex inline, không `bg-zinc-*`, không `text-slate-*`.

**The One Gold Rule.** Vàng đánh dấu thứ ghi điểm: hội viên, nhận diện, tiền-quan-trọng. Tối đa **một** điểm vàng làm tiêu điểm trên mỗi màn. Vì toàn app gần như đơn sắc, sự thưa của vàng chính là thứ làm nó có nghĩa.

**The Sight Blue Rule.** Hành động vận hành dùng `--color-info`, **không** dùng `--color-brand`. `--color-brand` là token nhận diện: nó chuyển thành charcoal `#1a1a1a` ở dark mode, nên nếu đem làm nút hay link sẽ mất hút trên nền tối.

**The Legibility Floor.** Chữ nhỏ (dưới 18.66px bold / 24px) phải đạt 4.5:1. `--color-text-tertiary` (`#71717a`, 4.6:1 trên canvas) là mức mờ **thấp nhất được phép**. Các bậc mờ hơn như `zinc-400` (2.6:1) và `zinc-300` chỉ được dùng cho icon trang trí hoặc viền, tuyệt đối không cho chữ. Vàng `#ffd444` không bao giờ là chữ trên nền sáng (1.43:1 trên trắng; 13.8:1 trên zinc-950) — trên nền sáng bắt buộc dùng bước đậm `text-yellow-dark` `#8a6a00`, đo được **5.07:1** trên trắng và **4.77:1** trên nền tint vàng, tức đạt AA cho cả chữ nhỏ.

## Typography

**Display Font:** Geist (với `ui-sans-serif, system-ui, -apple-system, sans-serif`)
**Body Font:** Geist (cùng stack)
**Label/Mono Font:** Geist Mono (với `ui-monospace, monospace`) — chỉ cho số liệu

**Character:** Một family duy nhất, không có pairing cầu kỳ. Geist là geometric grotesque trung tính, đúng chất "sổ sách": nó không có cá tính để tranh chấp với con số. Toàn bộ cá tính chữ nằm ở **cách dùng** — hai cỡ nhỏ, nhãn in hoa giãn chữ, và số liệu luôn tabular.

### Hierarchy

- **Display** (700, 24px / 32px, tracking −0.025em, `tabular-nums`): con số lớn — doanh thu, tổng tiền trên StatCard. Một màn chỉ nên có một cụm cỡ này.
- **Headline** (700, 20px / 28px, tracking +0.025em): tiêu đề màn hình trên mobile (header dán trên cùng) và tên màn. Đây là chữ lớn nhất định kỳ xuất hiện trong app.
- **Title** (600, 18px / 28px): tiêu đề modal, tiêu đề nhóm nội dung lớn.
- **Body** (400–500, 14px / 20px): cỡ chữ gánh gần hết giao diện — nhãn, giá trị, dòng hàng, mô tả.
- **Label** (500, 12px / 16px): nhãn field, tên cột bảng, chip, badge chữ.
- **Overline** (600, 10px / 16px, tracking 0.15em, IN HOA): nhãn nhóm, tagline `ARCHERY CLUB`, nhãn StatCard. Đây là dấu vân tay chữ của hệ — dùng cho **định danh**, không cho nội dung cần đọc.
- **Numeric** (Geist Mono, 500, 14px, `tabular-nums`): cột số trong bảng dữ liệu dày — hoá đơn, báo cáo. Trên card, số tiền và đồng hồ đếm giờ dùng Geist + `tabular-nums`; chính `tabular-nums` mới khoá bề rộng ký tự, nên mono ở đó là thừa chứ không phải nhất quán.

### Named Rules

**The Two-Size Rule.** Giao diện nói bằng 12px và 14px. Mọi cỡ lớn hơn phải thuộc đúng một trong ba vai: tiêu đề màn, con số hiển thị, hoặc nhãn in hoa 10px có giới hạn. Cỡ 15px và 12.5px không tồn tại trong hệ.

**The Ledger Type Rule.** Mọi con số thay đổi luôn `tabular-nums` — chính `tabular-nums` mới là thứ khoá bề rộng ký tự, và nó là yêu cầu bắt buộc. `font-mono` dành cho **cột số trong bảng dữ liệu dày** (hoá đơn, báo cáo), không dùng cho đồng hồ đếm giờ hay số tiền trên card. Không bao giờ để chữ số tỉ lệ trong bảng hoặc trong ticker.

**The Vietnamese Subset Rule.** Font stack chỉ hợp lệ khi subset tiếng Việt được load. Geist có subset `vietnamese` (`U+1EA0-1EF9`, `U+0102-0103`, `U+0110-0111`, `U+01A0-01A1`, `U+01AF-01B0`); thiếu nó thì `Đ`, `ế`, `ộ`, `ớ`, `ờ`… rơi về font hệ thống và chữ bị trộn hai typeface. Xem Do's and Don'ts.

## Layout

Bố cục là **một cột nội dung duy nhất**, mở rộng bằng sidebar ở desktop. Không có layout nhiều cột kiểu dashboard truyền thống ở cấp trang.

**Khung xương.** Mobile (<768px) dùng header dán trên cùng (cao 56px) + bottom nav dạng đảo nổi (cao 64px, capsule bo 28px, `max-w-md`, lùi vào 12px mỗi bên, `backdrop-blur`, có chừa safe-area cho iPhone). Desktop (≥768px) thay bottom nav bằng sidebar cố định bên trái — mở rộng 15rem, thu gọn 4.5rem (`localStorage: qltrungcung_sidebar_collapsed`) — và nội dung lùi lề tương ứng (`md:ml-60` / `md:ml-[4.5rem]`).

**Bề rộng nội dung.** Mọi trang dùng chung một bề rộng: class `max-w-content`, sinh từ `--container-content` (64rem = 1024px). Đổi bề rộng toàn app = sửa **một dòng** trong `globals.css`; có test chặn việc hardcode `max-w-3xl/4xl/5xl/6xl` trong file trang. Bề rộng riêng cho thành phần con (tờ hoá đơn, panel) vẫn hợp lệ.

**Nhịp dọc.** Padding trang: 16px ở mobile, 24px ở desktop (`px-4 py-4 md:px-6 md:py-6`). Khoảng cách giữa các khối: 16px (`space-y-4`). Trong khối: 12px. Bước nhỏ 8px. Thang dùng thật là 8 / 12 / 16 / 24 — không có bước lẻ.

**Grid.** Mặc định một cột; lưới thống kê `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`. Hàng hành động màn Ca trên desktop là 3 track cố định 9rem (`md:grid-cols-[repeat(3,minmax(0,9rem))] md:justify-center`) — không kéo giãn tile điện thoại hết bề rộng `max-w-content`.

**Chiều cao điều khiển.** Nút icon 36px (`h-9`), nút icon nhỏ 28px (`h-7`), hàng hành động màn Ca 56px (`min-h-14`, 3 tile ngang), bottom nav 64px.

**The Row-Action Rule.** Nút hành động **bên trong một hàng danh sách** dùng size `sm` (28px) và đứng **cạnh nhau thành hàng ngang**, bố cục `[phụ][chính]` — như `Dừng`/`Thu` ở thẻ người đang chơi và `Hủy`/`Xác nhận` ở hàng lịch đặt. Đây là chủ ý nhỏ hơn ngưỡng 44px: hàng đã cao ~110px, và mật độ mới là thứ đọc được ở quầy. Ngưỡng **44px áp cho nút đứng riêng** (form, dialog, action bar, tile màn Ca).

Trong hàng, nút phụ ẩn nhãn dưới `sm` (`hidden sm:inline`) và giữ `aria-label`; nút chính giữ **nhãn ngắn** ở mọi bề rộng (`Thu`, `Xác nhận`) — nhãn dài kiểu "Xác nhận & Chơi" chỉ sống trong dialog, nơi có đủ chỗ. Nhãn dài trong hàng sẽ bóp cột thông tin: đo được ở 375px, cột phải 121px là ngưỡng giữ cho hàng meta không tràn thêm dòng.

Input primitive đo 42px ở mobile (16px padding + 24px line-height + 2px viền) — form chính trên mobile thêm `py-2.5` để vượt ngưỡng 44px.

**Điểm gãy.** Có đúng hai điểm gãy, và chúng trả lời hai câu hỏi khác nhau:

- `md` (768px) — điểm gãy **kiến trúc**: đảo nav mobile đổi thành sidebar. Dùng `md:` cho những gì thuộc về *khung* (padding trang, tiêu đề màn, dải sticky).
- `lg` (1024px) — điểm gãy **mật độ**: nơi lưới/bảng dày được phép chuyển sang dạng hàng ngang nhiều cột. Dùng `lg:` cho những gì thuộc về *chiều rộng nội dung*.

**The Density Breakpoint Rule.** Đừng đặt layout hàng ngang ở `md`. Ở đúng 768px sidebar vừa lấy 240px, nên bề rộng nội dung tụt còn **528px — hẹp hơn cả một điện thoại 640px**. Layout chuyển sang hàng ngang ở `md` sẽ vỡ ngay tại điểm hẹp nhất (đo được trên màn Đặt lịch: cell dải ngày 60px trong khi nội dung cần ~74px, tràn 7px ở 768 và 4px ở 820; đến 1024 cell mới đủ 96px). Layout nội dung phải đổi ở `lg`.

`sm` (640px) chỉ dùng cho chi tiết nhỏ (cỡ chữ input, ẩn khối tài khoản trên header).

## Elevation & Depth

**Phẳng mặc định, sâu bằng tint.** Hệ này không dùng bóng để dựng cấu trúc. Chiều sâu đến từ việc xếp các bước tint cạnh nhau (canvas → card → tint) cộng với viền hairline 1px. Bóng chỉ xuất hiện theo hai lý do: **phản hồi trạng thái** (hover lift) và **tách lớp phủ** (modal, drawer, toast, đảo nav).

Ở trạng thái nghỉ, `shadow-sm` là mức cao nhất mà một bề mặt được phép có. Không có bóng ở input, ở hàng bảng, hay ở badge. Khi cần tách hai bề mặt cùng màu, câu trả lời là đổi bước tint hoặc thêm viền — không phải thêm bóng.

### Shadow Vocabulary

- **Resting surface** (`0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)` = `shadow-sm`): card, nút, wrapper bảng. Đây là mức trần ở trạng thái nghỉ.
- **Hover lift** (`0 6px 16px -8px rgba(15,23,42,0.12), 0 2px 4px rgba(15,23,42,0.04)` qua `.motion-hover-lift`, kèm `translateY(-1px)`): phản hồi khi trỏ vào card/row bấm được. Chỉ chạy khi hover.
- **Overlay** (`0 20px 25px rgba(0,0,0,0.1), 0 8px 10px rgba(0,0,0,0.05)` = `shadow-xl`): modal và bottom sheet — một lớp thật sự nổi trên scrim.
- **Island nav** (`0 8px 30px rgb(15 23 42 / 0.14)`, dark `0 8px 30px rgb(0 0 0 / 0.35)`, kèm `backdrop-blur-xl`): riêng cho đảo nav mobile. Đây là bóng duy nhất được phép "đậm" ở trạng thái nghỉ, vì đảo nav nổi trên nội dung đang cuộn.
- **Toast** (`shadow-lg` + `backdrop-blur-sm`): thông báo nổi, tách khỏi nội dung.

**Thang z-index:** header 30 → sidebar 40 → bottom nav 50 → modal 60 → toast 100.

### Named Rules

**The Flat-By-Default Rule.** Bề mặt phẳng ở trạng thái nghỉ. Bóng là câu trả lời cho một sự kiện (hover, lớp phủ), không phải trang trí nền.

**The Tint-Not-Shadow Rule.** Nếu bạn đang với tay lấy một cái bóng để tách hai bề mặt, hãy đổi bước tint hoặc thêm viền hairline thay vào đó.

## Shapes

Ngôn ngữ hình khối là **bo góc vừa phải, viền mảnh, không cắt xén**. Không có góc vuông trong giao diện, cũng không có hình dạng lạ.

- **Điều khiển** bo 12px (`rounded-lg`) — nút, input, select, ô bấm. Đây là bán kính chi phối.
- **Khối nội dung** bo 16px (`rounded-xl`) — card, wrapper bảng, dải thống kê.
- **Lớp phủ** bo 20px (`rounded-2xl`) — panel modal, bottom sheet, card đăng nhập. Modal trên mobile bo trên, vuông dưới (bottom sheet).
- **Pill** bo tròn hoàn toàn (`rounded-full`) — badge, chip filter, dot nav active.
- **Đảo nav mobile** bo 28px (`rounded-[1.75rem]`) — hình khối đặc trưng nhất của hệ, không dùng ở chỗ nào khác.
- **Icon tile** bo 16px (`rounded-2xl`) cho khối icon lớn (EmptyState, logo loading).

Viền luôn 1px, không bao giờ 2px. Dải phân cách giữa các hàng dùng `divide-y` với màu hairline, không dùng `border` từng hàng. Viền nét đứt (`border-dashed`) chỉ dùng cho vùng "phụ lục" lồng trong một khối — ví dụ danh sách hàng bán kèm trong tờ hoá đơn.

## Components

### Buttons

- **Shape:** bo 12px (`rounded-lg`), cao 36px ở size `md`, padding 8px/16px. Bốn size: `xs` (24px) `sm` (28px) `md` (36px) `lg` (44px).
- **Primary (contrast):** đảo màu — nền `--color-text-primary`, chữ `--color-text-inverse`. Ở light là khối đen trên giấy trắng, ở dark là khối trắng trên nền than. Đây là nút hành động chính: Lưu, Thu tiền, Check-in, Mở ca, Đăng nhập.
- **Action (blue):** nền `--color-info`, chữ trắng. Cho hành động cấp hai và hành động brand: Tạo mới, Xem báo cáo, mở dialog.
- **Danger (red):** nền `--color-danger`, chữ trắng — cho hành động kết thúc có chữ (Xoá, Huỷ hoá đơn, Đóng ca). Bản `red-soft` (nền `danger-bg`, chữ `danger`, viền `danger-border`) dành cho nút icon trong bảng/card.
- **Gold (yellow):** nền `--color-yellow`, chữ `--color-text-primary` (vàng là màu sáng nên chữ phải là ink). Chỉ dùng cho thao tác thuộc hội viên: đăng ký, gia hạn, chọn chế độ Hội viên.
- **Neutral:** `white` (viền hairline + nền card) cho hành động phụ; `grey` (nền tint, không viền) cho tile hành động màn Ca; `ghost` (trong suốt, chữ muted) cho nút đóng modal và chevron.
- **Hover / Focus:** hover bằng `opacity-90` cho nút đặc, `bg-surface-tertiary` cho nút có nền; nhấn bằng `scale(0.97)`. Focus luôn là ring 2px `--color-focus-ring` lệch 2px. Chuyển động 120–200ms với curve `cubic-bezier(0.2, 0, 0, 1)`.

### Chips (FilterButton)

- **Style:** pill bo tròn hoàn toàn, chữ 12px/500, padding 6px/12px, viền 1px.
- **State:** đang chọn — nền `info-bg`, chữ `info`, viền `info-border`. Chưa chọn — nền card, chữ `text-secondary`, viền hairline, hover sang nền tint. Không có trạng thái thứ ba.

### Cards / Containers

- **Corner Style:** 16px (`rounded-xl`).
- **Background:** `--color-surface-elevated` cho card trên canvas; `--color-surface-tertiary` cho card thống kê có tone.
- **Shadow Strategy:** `shadow-sm` ở trạng thái nghỉ, lift khi hover nếu bấm được (xem Elevation & Depth).
- **Border:** 1px `--color-border-default`. Viền luôn hiện diện — nó là công cụ tách lớp chính, không phải trang trí.
- **Internal Padding:** 12px / 16px / 24px (`sm` / `md` / `lg`); card mặc định 16px.
- **Biến thể StatCard:** card có tone nền theo ngữ nghĩa (success/info/warning/danger/purple/default), chứa một con số cỡ Display + một icon trong ô nền card. Trend đi kèm dùng mũi tên + màu success/danger, không dùng màu khác.

### Inputs / Fields

- **Style:** nền `--color-surface-elevated`, viền 1px `--color-border-strong`, bo 12px, padding 8px/12px, cao 42px ở mobile. Viền dùng `strong` chứ không `default` — input phải mời gõ vào rõ hơn một cái card.
- **Focus:** viền đổi sang `--color-info` + ring 1px `--color-focus-ring`. Không dùng glow, không dùng bóng.
- **Placeholder:** `--color-text-tertiary` — mức mờ thấp nhất được phép, không mờ hơn.
- **Error / Disabled:** lỗi field hiển thị bằng chữ đỏ nhỏ ngay dưới field (`text-danger`), **không** dùng toast. Disabled dùng `opacity-50` + `cursor-not-allowed`, giữ nguyên hình dạng.
- **Label:** 12px/500 `text-secondary`, dấu `*` bắt buộc màu `--color-danger`.

### Navigation

- **Desktop:** sidebar nền `--color-surface-primary`, viền phải 1px hairline. Nhóm menu có nhãn overline 10px in hoa màu `text-tertiary`/muted. Item chưa chọn: chữ `text-secondary`, hover nền tint. Item đang chọn: nền `info-bg`, chữ `info`, icon 20px — **không** có thanh chỉ báo bên trái, màu nền chính là chỉ báo.
- **Mobile:** đảo nổi 64px, capsule 28px, nền card bán trong suốt + `backdrop-blur-xl`, viền hairline. Mỗi tab gồm icon trong ô nền tint khi active, nhãn 10px/500, và một **dot 16×3px** trượt ra dưới icon khi active (`.nav-dot`, dùng `currentColor`). Active màu `--color-info`; chưa chọn màu `text-tertiary`.
- **Header mobile:** dán trên cùng, nền paper bán trong suốt + `backdrop-blur-md`, viền dưới hairline. Logo 36px + tiêu đề màn cỡ Headline; bên phải là nút làm mới 36px và khối tài khoản (ẩn dưới `sm`).

### Surface Ladder (signature)

Thứ tự lớp cố định, dùng ở mọi màn: **Paper** (`surface-primary`, chrome và body) → **Canvas** (`surface-secondary`, nền màn) → **Card** (`surface-elevated`, khối nội dung) → **Tint** (`surface-tertiary`, hover và dải inset). Ở light, card sáng hơn canvas; ở dark, card cũng sáng hơn canvas (`#18181b` trên `#09090b`). Hai theme đi cùng một hướng — không có theme nào bị đảo ngược thứ tự lớp.

### Money & Deduction Display (signature)

Mọi khoản trừ (phí gửi xe, chiết khấu, hoàn) hiển thị bằng chữ `text-danger` kèm dấu `-` tường minh, và tổng được chặn sàn bằng `Math.max(0, ...)`. Số âm không bao giờ hiển thị bằng màu trung tính, và không bao giờ chỉ dựa vào dấu để truyền đạt. Trong bảng, tiền dùng `font-mono tabular-nums` để cột số không nhảy.

### Phiếu thu hai liên (signature)

Mọi dialog thu tiền đọc như một **phiếu hai liên**, không phải một chồng mục:

- **Liên 1 · Tính tiền** — đang tính cái gì: từng người chơi (giá niêm yết + thời gian chơi/nghỉ), hàng hoá/dịch vụ, vùng thêm hàng; kết bằng **Tạm tính**.
- **Liên 2 · Thu tiền** — vì sao ra số cuối: khuyến mại, phí gửi xe, tiền cọc (khấu trừ), **Tổng**, rồi phương thức thanh toán. Liên 2 nằm trên bước `surface-secondary`, chạy hết tới chân phiếu; đường gấp là 24px giấy trắng + một hairline.
- **Chân phiếu** — kết quả: **Cần thu** + nút thu. Đây là con số **duy nhất** cỡ Display (24px) trên màn.

Chuỗi số đi một hướng và mỗi khoản xuất hiện đúng **một lần**: `Tạm tính = giờ chơi (giá niêm yết) + hàng hoá`, `Tổng = Tạm tính − khuyến mại − phí gửi xe`, `Cần thu = Tổng − cọc`. Vì vậy mọi số tiền in **chính xác đến từng đồng** (`money(value, false)` — không `Math.ceil` lên hàng nghìn, nếu không các dòng không cộng lại đúng bằng tổng), và mọi số nằm trên **một rail phải cố định** (`MONEY_RAIL`) từ dòng đầu tới chân phiếu. Hàm thuần `src/features/pos/checkout-totals.ts` là nguồn duy nhất của chuỗi này — không tính lại trong JSX.

Khoản điều chỉnh (khuyến mại, phí gửi xe, tiền cọc) là **một lớp mỏng** trong liên 2, tách khỏi danh sách khoản thu; hàng chỉ-để-đọc không nằm lẫn với hàng có control. Bảng giá và phí gửi xe luôn hiện đầy đủ (không thu gọn); khuyến mại chỉ hiện khi có khuyến mại để chọn (lỗi tải vẫn hiện).

## Do's and Don'ts

### Do:

- **Do** dùng token utility cho mọi màu: `bg-surface-secondary`, `bg-surface-elevated`, `border-border-default`, `text-text-secondary`, `text-danger`. Bảng quy đổi từ class zinc đang có sang token nằm ở cuối mục này.
- **Do** để token tự lo dark mode. Mỗi token đã có sẵn giá trị light và dark, nên **không** viết `dark:` cho màu đã có token — `bg-surface-elevated` đã đúng ở cả hai theme.
- **Do** giữ mỗi màn đúng một điểm vàng làm tiêu điểm (The One Gold Rule), và dùng `text-yellow-dark dark:text-yellow` khi vàng là chữ.
- **Do** giữ thang ink ở đúng ba bậc: `text-text-primary` / `--secondary` / `--tertiary`. Mức mờ nhất được phép cho chữ là `#71717a` (4.6:1 trên canvas).
- **Do** dùng `PAGE_TITLE_CLASS` (`src/components/ui/page-title.ts`) cho **mọi** `h1` tiêu đề trang — đó là Headline 20px/28px/+0.025em, cùng cỡ với header dán trên cùng ở mobile, nên desktop và mobile đọc ra một tiêu đề. Cấm hardcode cỡ chữ trong `h1` (24px là cỡ Display, để dành cho con số); ràng buộc khoá ở `page-title.test.ts`. Wordmark `VICTORIA` (sidebar, login) nằm ngoài luật này.
- **Do** dùng `tabular-nums` cho mọi con số thay đổi, và `font-mono` cho cột số trong bảng dữ liệu dày.
- **Do** giữ vùng chạm ≥44px; form chính trên mobile thêm `py-2.5` cho field.
- **Do** load subset tiếng Việt cho font: `subsets: ["latin", "vietnamese"]` trong `src/app/layout.tsx`.
- **Do** hiển thị khoản trừ bằng `text-danger` + dấu `-` tường minh, và chặn sàn tổng bằng `Math.max(0, ...)`.
- **Do** theo bậc bo góc: 12px điều khiển, 16px khối nội dung, 20px lớp phủ, pill cho badge/chip.
- **Do** kiểm tra cả light và dark trước khi commit — hai theme là hai biến thể ngang hàng, không phải bản phụ.
- **Do** dùng `AppSkeleton` cho mọi trạng thái loading, `EmptyState` cho mọi danh sách rỗng, `lucide-react` cho mọi icon.
- **Do** migrate class zinc sang token khi bạn đang sửa file đó — việc này không đổi pixel, nên không cần một đợt refactor riêng.

### Don't:

- **Don't** hardcode màu palette: `bg-zinc-*`, `text-slate-*`, `border-gray-*`, hay bất kỳ hex inline nào. Ngoại lệ duy nhất là `src/features/reports/reports-charts.tsx` (ramp biểu đồ) và SVG logo.
- **Don't** dùng `--color-brand` cho nút, link, hay trạng thái active. Nó thành charcoal `#1a1a1a` ở dark mode. Hành động dùng `--color-info` (The Sight Blue Rule).
- **Don't** dùng `text-zinc-400` (hay mờ hơn) cho chữ ở light mode — 2.6:1, dưới ngưỡng AA. Cũng đừng dùng vàng `#ffd444` làm chữ trên nền sáng (1.43:1).
- **Don't** thêm màu thứ năm. Hệ đã có đúng một màu trang trí (vàng) và hai màu chức năng (xanh, bộ ba trạng thái) — màu mới phải thay thế một màu cũ, không phải xếp thêm.
- **Don't** tự nghĩ ra màu cho series biểu đồ. Mọi chart lấy từ ramp duy nhất trong `reports-charts.tsx`; không hardcode `bg-rose-500`/`bg-sky-500`/`bg-teal-500` rải rác trong màn.
- **Don't** dùng gradient, glow, neon, chữ phát sáng, animation nền, hay hiệu ứng phát sáng khi hover. Đây là sổ điểm vận hành, không phải UI game.
- **Don't** dựng hero, khối marketing, hay bố cục nhiều cột lãng mạn bên trong app. Nội dung là bảng, danh sách, và form.
- **Don't** dựng bảng kiểu ERP: lưới nhiều cột chữ 12px, cuộn ngang, filter chi chít. Nhân viên thao tác bằng một ngón tay đang cầm điện thoại.
- **Don't** xếp viền + bóng + tint trên cùng một phần tử. Mỗi phần tử chọn **một** công cụ tách lớp.
- **Don't** thêm bóng mới. Vocabulary chỉ có: `shadow-sm` (nghỉ), hover lift, `shadow-xl` (lớp phủ), bóng đảo nav, `shadow-lg` (toast).
- **Don't** dùng emoji trong UI, và đừng tạo skeleton/loading placeholder thứ hai ngoài `AppSkeleton`.
- **Don't** dùng `#000` làm màu chữ hay màu nền. Mực đen của hệ là `#18181b`; `#000` chỉ tồn tại bên trong file SVG logo.
- **Don't** hardcode `max-w-3xl/4xl/5xl/6xl` trong file trang — dùng `max-w-content` (đã có test chặn).

### Bảng quy đổi zinc → token (migrate không đổi pixel)

| Class đang dùng | Token thay thế |
|---|---|
| `bg-white dark:bg-zinc-900` | `bg-surface-elevated` |
| `bg-zinc-50 dark:bg-zinc-950` | `bg-surface-secondary` |
| `bg-white dark:bg-zinc-950` (body, chrome) | `bg-surface-primary` |
| `bg-zinc-100 dark:bg-zinc-800` | `bg-surface-tertiary` |
| `border-zinc-200 dark:border-zinc-800` | `border-border-default` |
| `border-zinc-300 dark:border-zinc-600` | `border-border-strong` |
| `text-zinc-900 dark:text-white` | `text-text-primary` |
| `text-zinc-700 dark:text-zinc-300` | `text-text-secondary` |
| `text-zinc-500 dark:text-zinc-400` | `text-text-tertiary` |
| `text-white dark:text-zinc-950` | `text-text-inverse` |
| `divide-zinc-100 dark:divide-zinc-800` | `divide-border-default` |

`text-zinc-600` (47 chỗ) và `text-zinc-200`/`text-zinc-800` là các bậc **ngoài thang** — không có token tương ứng. Khi gặp, chọn về một trong ba bậc ink theo ý nghĩa thật của chỗ đó.
