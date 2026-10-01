// ── Brand mark ───────────────────────────────────────────
// Dựng inline thay vì <Image src="/victoria_logo.svg">: SVG nạp qua <img> là
// một document riêng, nên `prefers-color-scheme` bên trong nó bám theo OS chứ
// không bám class `.dark` của app — mực logo sai màu mỗi khi theme app khác
// theme hệ điều hành (đen trên nền tối, trắng trên nền sáng).
// Mực lấy `currentColor` để theo token text-*; vàng theo token --color-yellow.
// File public/victoria_logo.svg vẫn giữ cho favicon (ở đó OS là đúng).

const INK =
  'M492 552 445 527 195 579l57 21 27 7 183-47-21-10h-8l-153 26v-2l163-35 35 17zM504 458l14 31 16 26 8 8 14 7h18l98-23-2-7zM471 376l19 44 12 12 164 57-8-21zM434 287l17 42 13 18 189 106-12-29zM402 215l15 31 11 12 208 146-52-150-7-11-16-8zM1103 215H936L830 481 534 551 292 612l7 37 276-71 530-130-102-7z'

const GOLD =
  'm1354 411-179 48-586 138-118 34 97-4 100 262 8 12 9 4h114l9-4 9-12 153-342 109-27 109-23-24 66 87-66zm-538 172-18 47-56 127-53-144zm480-142-55 48-40 30-1-2 51-53-88 10z'

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1536 1024"
      className={`text-text-primary ${className ?? ''}`}
      aria-hidden="true"
    >
      <path fill="currentColor" d={INK} />
      <path className="text-yellow" fill="currentColor" d={GOLD} />
    </svg>
  )
}
