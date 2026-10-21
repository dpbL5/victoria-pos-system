# E2E với Playwright

Bộ test chạy browser thật → Next.js → PostgreSQL thật (DB dev đang cấu hình trong `.env`).
Nguyên tắc: **không reset, không seed, không xoá dữ liệu có sẵn** — mọi thứ E2E tạo ra đều
mang nhãn `[E2E] ` và được dọn lại sau mỗi lượt chạy.

## Chạy

```bash
# Fixture tự sinh ADMIN ngẫu nhiên rồi xoá sau khi chạy
NODE_ENV=development E2E_ALLOW_DEV_DATABASE=1 npm run test:e2e

# Dùng tài khoản có sẵn (không tạo fixture)
NODE_ENV=development E2E_ALLOW_DEV_DATABASE=1 E2E_ADMIN_USERNAME=admin E2E_ADMIN_PASSWORD=... npm run test:e2e
```

> Nếu shell đang đặt `NODE_ENV=production`, luôn override `NODE_ENV=development` — guard của
> fixture và cleanup sẽ từ chối chạy trên production.

- `E2E_ALLOW_DEV_DATABASE=1` là bắt buộc; thiếu biến này, mọi thao tác fixture/dọn dẹp bị chặn
  ngay trước khi kết nối DB, và `NODE_ENV=production` cũng bị từ chối.
- Server E2E chạy riêng ở `http://127.0.0.1:3100` với output `.next-e2e`, không dùng lại
  server/`.next` của `npm run dev`.
- Browser tải về `.playwright-browsers/` (đã gitignore) qua `PLAYWRIGHT_BROWSERS_PATH` trong npm script.
- `npm test` (Vitest) đã loại `e2e/**`, nên hai bộ chạy độc lập.

## Phạm vi

| File | Nội dung | Project |
|---|---|---|
| `auth-smoke.spec.ts` | Chặn dashboard khi chưa login, login thật, mở `Ca hôm nay`/`Thêm`, logout | mobile + desktop |
| `admin-catalog.spec.ts` | Tạo bảng giá, tạo hàng hoá, nhập/chỉnh tồn kho | desktop |
| `pos-checkout.spec.ts` | Tham gia ca → check-in vãng lai → thêm hàng vào phiếu (chưa trừ kho) → thu tiền → huỷ hoá đơn hoàn kho | desktop |
| `pos-partial-checkout.spec.ts` | Thu trước 1 trong 2 người → phiên giữ `ACTIVE` → thu nốt người còn lại | desktop |

Các assertion tiền/kho đọc chéo ba tầng: con số trên phiếu thu, hoá đơn đã ghi (`grandTotal`,
`invoiceNo`, `sessionClosed`), và tồn kho qua API — không chỉ kiểm tra toast thành công.

## Dữ liệu và dọn dẹp

- Thực thể E2E đặt tên bắt đầu bằng `[E2E] `: khách vãng lai, hàng hoá, bảng giá, ca tự mở.
- `e2e/global-teardown.ts` luôn chạy `e2e/e2e-data.ts cleanup`, kể cả khi test fail giữa chừng:
  xoá theo nhãn `[E2E] ` (invoice item → payment → invoice → session → booking → pricing rule → product),
  rồi gỡ `ShiftParticipant` mà lượt chạy đã thêm vào **ca có sẵn** của môi trường dev
  (ghi trong `.e2e-state.json`), để trạng thái dev trở về như trước khi chạy.
- Kiểm tra còn sót: `E2E_ALLOW_DEV_DATABASE=1 ./node_modules/.bin/tsx e2e/e2e-data.ts inspect`.
- Không dùng `npm run db:reset`, `prisma db push --force-reset`, `POST /api/seed` hay script
  `migrate:*` trong E2E.
- Bảng giá E2E phủ `0–24h` mọi ngày nên sẽ thắng tiebreaker `createdAt desc` khi resolve giá;
  vì vậy nó **phải** bị dọn sau mỗi lượt chạy, không được để lại trong DB dev.

## Lưu ý khi chạy

- Test sâu cần thời gian: `timeout: 120s` và `expect.timeout: 15s` trong `playwright.config.ts`
  vì Next dev còn compile route ở lần chạm đầu và DB là Supabase qua mạng.
- `workers: 1` — các spec dùng chung một DB, chưa tách DB theo worker.
- Dữ liệu tiền cần thời gian chơi thật: phiên vừa check-in có elapsed ≈ 0 nên hoá đơn 0đ là đúng;
  `pos-partial-checkout.spec.ts` lùi giờ check-in (trong cùng ngày) để có tiền giờ.

## Đã phát hiện qua E2E

`SHIFT_OPEN_FAILED` — Prisma hết hạn interactive transaction (mặc định 5000ms):

```
Transaction API error: A query cannot be executed on an expired transaction.
The timeout for this transaction was 5000 ms, however 9129 ms passed since the start of the transaction.
```

- `runInTransaction` (`src/lib/infrastructure/db-helpers.ts`) không truyền `timeout`;
  `openOrJoinShift` (`src/lib/shifts/use-cases/open-or-join.ts:90`) chỉ truyền
  `isolationLevel: Serializable` → dùng mặc định 5s của Prisma.
- Catch ở `open-or-join.ts:106` chỉ retry `P2002`/`P2034`; lỗi hết hạn transaction (P2028)
  rơi thẳng xuống `err('SHIFT_OPEN_FAILED', error.message)`.
- `mapOpenOrJoinShiftError` đưa nguyên message Prisma (kèm đường dẫn file build) vào response 500.
- Tái hiện: 2/3 lượt chạy full suite (workers=1, 3 spec sâu) — nút `Tham gia ca` / `Mở ca`
  trả 500 và các test sau đó đổ theo. Chạy riêng từng spec thì không gặp.

Đã sửa:

- `openOrJoinShift` truyền `timeout: 20_000` + `maxWait: 10_000` cho transaction Serializable.
- P2028 (transaction expired) được thêm vào nhóm retry.
- Catch không còn trả raw message Prisma ra response; stack được log ở server,
  client nhận `SHIFT_OPEN_FAILED` với thông báo chung.
