---
name: ux-design
description: Use when designing or redesigning a screen, dialog, flow, or interaction in this app — deciding layout, states, copy, and what the staff sees first at the counter. Covers the mobile-first POS UX rules (one-handed use, state matrix, layout invariants, Vietnamese copy) and how to verify the result. For visual/aesthetic direction use frontend-design; for cutting scope use ponytail.
---

# UX Design — Victoria Archery POS

Người dùng là nhân viên đứng quầy, một tay cầm máy, mắt liếc nhanh giữa khách và màn hình.
Mỗi bước thừa là một khách phải chờ. Thiết kế cho tốc độ và không đoán sai, không phải cho đẹp
trong ảnh chụp.

## Bước 0 — đọc chuẩn trước khi vẽ

Không thiết kế từ trí nhớ. Đọc theo thứ tự:

1. `docs/ui-patterns.md` — component bắt buộc phải dùng lại, không viết mới.
2. `DESIGN.md` — token màu/typo/radius, quy tắc "một điểm vàng mỗi màn".
3. `.commandcode/taste/ui/taste.md` — các quyết định UX đã chốt (rất nhiều luật cụ thể).
4. Màn hình anh em cùng loại (`src/features/**/*-screen.tsx`, `src/components/ui/`) — bám pattern
   đã có. User nói "đồng bộ với cách tôi hay làm" nghĩa là thay bằng component chuẩn, không phải
   polish bản bespoke.
5. Route guard của trang (`src/proxy.ts` / `getBoardAccess`) — biết role nào vào được trước khi
   bày nút.

## Brief 5 dòng trước khi vẽ

Viết ra, đừng nhảy vào code:

- **Ai**: STAFF / MANAGER / ADMIN / TEACHER.
- **Nhiệm vụ**: một câu, động từ + kết quả ("thu tiền cho nhóm 3 người").
- **Tần suất**: mỗi phút / mỗi ca / mỗi tháng — quyết định thứ được to, được to nhất.
- **Môi trường**: đứng quầy, sáng chói, có thể đeo găng, mạng chậm.
- **Ràng buộc nghiệp vụ**: ca đã mở chưa, hội viên còn hạn không, còn hàng trong kho không.

Nếu thiếu một dòng mà tự đoán được từ code thì đọc code; nếu đoán sai sẽ đổi luồng nghiệp vụ thì
hỏi.

## Nguyên tắc bố cục (bất biến của repo)

- **Mobile-first, thật sự**: 390px là màn chính. Desktop chỉ là bản rộng ra, không phải bản chính.
- **Vùng chạm ≥ 44px**, CTA chính nằm cuối màn (ngón cái), hành động phá huỷ đứng cuối cùng.
- **Thông tin quyết định ở trên, hành động ở dưới**: đọc trước, chạm sau. Trên bảng vận hành:
  số liệu → thanh hành động.
- **Một màn một nhiệm vụ**. Flow có màn riêng thì không nhúng vào dialog; mở dialog chỉ để xác
  nhận hoặc chọn, không để chạy cả một nghiệp vụ khác.
- **Không layout shift**: chỗ trống cho nội dung xuất hiện có điều kiện phải được giữ chỗ
  (`invisible`) hoặc gộp vào dòng có sẵn; modal đổi option không được đổi chiều cao.
- **Ưu tiên xếp chồng hơn nhồi ngang**, ưu tiên xuống dòng (`break-words`, `flex-wrap`) hơn
  `truncate`. Không bao giờ cắt cụt nút bấm hay thông tin.
- **Một datum một chỗ**: cùng một số liệu nằm cùng vị trí trên mọi card, mọi trạng thái.
- **Bề rộng nội dung dùng `max-w-content`** (`--container-content`); không hardcode
  `max-w-3xl/5xl`.
- **Cột phụ chỉ tách ở `lg`**, không phải `md` — sidebar chiếm chỗ, `md` sẽ bóp nát cột.
- **Màu chỉ lấy từ token** (`src/app/globals.css`), không hex trong component, kể cả chart.
  Hai theme phải cùng bộ token.
- **Icon `lucide-react`, không emoji**. Icon đã diễn đạt nghĩa thì bỏ chữ đi kèm.

## Ma trận trạng thái — không được thiếu ô nào

Với mỗi màn hình, liệt kê và thiết kế đủ:

| Trạng thái | Yêu cầu |
|---|---|
| Loading | `Skeleton`/`AppSkeleton` phản chiếu đúng bố cục thật, không phải khối xám chung |
| Empty | `EmptyState` có lý do + hành động tiếp theo, không chỉ "Không có dữ liệu" |
| Error | Nói chuyện gì hỏng bằng tiếng Việt, có "Thử lại", không nuốt lỗi |
| Partial | Đang tính lại thì **giữ số cũ** (`opacity-60`) + "Đang tính lại...", không xoá trắng |
| Chưa mở ca | Overlay chặn vùng nội dung, vẫn để nav dùng được |
| Read-only (MONITOR) | Không render nút bị cấm; không render nút disable vô nghĩa |
| Không đủ quyền | Ẩn hẳn hành động admin khỏi STAFF, không chỉ disable |
| 0 / 1 / N | Một phần tử thì render phẳng, không bọc accordion; N phần tử mới cần nhóm |
| Nội dung dài | Tên dài, 0đ, số âm, hoá đơn 20 dòng — thử ở 390px |
| Mạng chậm / lỗi mạng | Nút đang gửi thì disable + giữ nhãn rõ, không spinner trần |

## Copy tiếng Việt

- Nhãn nút = động từ + kết quả: "Thu tiền", "Gia hạn", "Đã đếm D.cụ". Không dùng nhãn mô tả cơ
  chế ("Chia nhóm") mà mô tả kết quả ("Nhiều bảng giá").
- **Bỏ văn bản hướng dẫn thừa** dưới form. Lỗi (chữ đỏ) thì giữ.
- Trạng thái mặc định không cần badge; trạng thái khác thường thì mã hoá bằng màu chữ trên chính
  nhãn đó. Dùng badge có chữ khi trạng thái cần đọc thành lời ("Chưa đóng").
- Không in ID máy móc ra UI: dùng helper rút gọn (`shortInvoiceNo`) + `title` chứa mã đầy đủ.
- Tiền: `formatVND()` từ `@/lib/utils`. Số âm hiện đỏ kèm dấu `-`.
- Số điện thoại là `<a href="tel:...">`.
- Nhập tiền VND: chỉ số nguyên, `.` phân cách nghìn, `inputMode="numeric"`, dùng
  `normalizeCashInput`/`cashInputToNumber` sẵn có.

## Tương tác

- Hành động phá huỷ → `ConfirmDialog`, nêu hậu quả cụ thể (xoá hẳn vs ngưng bán), nhãn nút khớp
  hành động.
- **Đừng disable/hide khi còn đường khắc phục**: hội viên hết hạn vẫn chọn được để hiện CTA gia
  hạn; lịch quá giờ vẫn xác nhận được (hiện cảnh báo, không chặn).
- Chỉ chặn khi chuyển trạng thái thật sự không hợp lệ, và phải khớp đúng điều kiện backend trả về
  (`SHIFT_REQUIRED`, `canOperate`) — không render nút enable ở trạng thái API sẽ từ chối.
- Tìm kiếm thực thể: type-ahead debounce ~300ms, dropdown dưới input, không nút "Tìm".
- Chỉnh sửa tại chỗ (inline) hơn mở màn hình edit riêng, hơn modal riêng.
- Modal: focus trap, Esc đóng modal trên cùng, dropdown trong modal phải `createPortal` +
  `position: fixed`.
- Motion: dùng keyframe có sẵn trong `globals.css`, tôn trọng `prefers-reduced-motion` toàn cục,
  stagger theo index chứ không theo `nth-child`.

## Kiểm chứng trước khi báo xong

1. Chạy thật, chụp 390px **và** 1024px, cả light và dark.
2. Đi qua ma trận trạng thái ở trên trên màn vừa sửa.
3. Bàn phím: Tab tới được mọi control, focus ring hiện, thứ tự hợp lý.
4. Đo lại chỗ dễ vỡ: tên dài nhất trong DB, số tiền lớn nhất, danh sách dài nhất.
5. Nếu có logic thuần (tính giá, chia nhóm, build lịch) → tách hàm thuần + test nhỏ.
6. `tsc --noEmit` và lint sạch; xoá import/state chết do thay đổi.

## Định dạng đề xuất UX

```
## Mục tiêu
<một câu: ai làm gì, nhanh hơn/ít sai hơn ở đâu>

## Luồng
1. ... → 2. ... → 3. ...
(wireframe ASCII cho màn chính, 390px)

## Bố cục
- Trên → dưới: ...
- Vùng chạm / CTA: ...
- Tái dùng: <component chuẩn nào>

## Trạng thái
- loading / empty / error / partial / ... : ...

## Copy
- Nút: ...
- Nhãn trạng thái: ...

## Đánh đổi
- Chọn A thay B vì ...; rủi ro còn lại: ...
```

## Anti-pattern đã bị từ chối trong repo này

Nhồi chi tiết đối soát vào danh sách (để lại cho trang chi tiết) · badge cho trạng thái mặc định ·
bảng dữ liệu trên mobile thay vì card-list · popup chứa cả một flow riêng · collapse cho phần
quyết định tiền · helper text giải thích dưới form · số liệu derive từ thông tin đã hiện ·
accordion cho card một phần tử · nút ẩn chữ mà không có `title`/`aria-label` · class Tailwind ghép
chuỗi động (`grid-cols-${n}`).
