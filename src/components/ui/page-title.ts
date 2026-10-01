// ── Cỡ tiêu đề trang — MỘT nguồn duy nhất ─────────────────────────────────
// DESIGN.md → Typography → Headline: 700, 20px/28px, tracking +0.025em, và mô tả
// ghi rõ đây là cỡ của "tiêu đề màn hình trên mobile (header dán trên cùng) và
// tên màn". Vì vậy mọi `h1` tiêu đề trang ở desktop PHẢI dùng đúng class này, để
// desktop khớp y hệt header dán trên cùng ở mobile.
//
// Cỡ 24px (`text-2xl`) là `Display` của hệ — dành cho con số lớn (StatCard, tổng
// tiền), không dùng cho tiêu đề: một màn chỉ nên có một cụm cỡ đó.
//
// Ràng buộc được khoá bằng test `page-title.test.ts` — đừng hardcode lại cỡ chữ
// trong từng màn.
export const PAGE_TITLE_CLASS = 'text-xl font-bold leading-7 tracking-wide text-text-primary'
