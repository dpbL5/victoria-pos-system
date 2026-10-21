# Kế hoạch E2E — Victoria Archery Club

Trạng thái: Phase 1–2 đã triển khai một phần (smoke + danh mục + hai luồng tiền sâu); các phase còn lại vẫn là đề xuất.

> Theo xác nhận của người dùng, E2E chạy trên DB development hiện tại. Mọi dữ liệu E2E mang nhãn `[E2E] ` và được dọn tự động sau mỗi lượt chạy; không reset/seed DB. Trạng thái đã chạy và phát hiện: `docs/e2e-testing.md`.

## 1. Hiện trạng đã kiểm tra

- `package.json`: Vitest 4; chưa có Playwright/Cypress hoặc script E2E.
- `vitest.config.ts`: môi trường Node. Test API như `src/lib/__tests__/api/checkout-api.test.ts` gọi route handler trực tiếp, mock auth và Prisma — chưa kiểm chứng browser → Next server → PostgreSQL thật.
- `.tools/browser/`: Puppeteer cục bộ, bị gitignore; phục vụ chụp/kiểm chứng UI chỉ đọc trên production, không phải bộ regression chạy được trong CI.
- `docker-compose.yml`: đã có PostgreSQL 16 nhưng dùng cổng 5432 và volume bền vững. Không reset hoặc dùng chung DB này cho E2E.
- Chưa thấy workflow CI trong `.github/workflows/`.
- Working tree có thay đổi checkout-quote và test chưa commit từ trước. Không revert, ghi đè hoặc gộp chúng vào thay đổi E2E.

### Nguồn nghiệp vụ đã đọc và đối chiếu

`AGENTS.md`, `docs/business-flow-checkin-playing-checkout.md`, `docs/api-routes.md`, `docs/transactions-state-machine.md`, `docs/pricing-solution.md`, `docs/promotions-solution.md`, `docs/students-solution.md`, cùng schema và code auth/check-in/checkout/bán kèm/booking/void/role guards.

**Không dùng mô tả cũ làm expected result một cách máy móc:**

- Docs luồng POS/API còn nói bán kèm tạo DRAFT/SEL. Schema và `sell-items.ts` hiện lưu `SessionSellItem`, trừ kho lúc bán, checkout mới tạo INV. E2E phải xác nhận không sinh invoice/payment khi bán kèm, không trừ kho hoặc tính tiền lần hai khi thu.
- Quyền truy cập có mô tả lệch nhau giữa các tài liệu. Hiện page `/reports` và `/shifts` cho MANAGER/ADMIN; TEACHER có ngoại lệ `/settings`. Lập ma trận page/API/nav từ guard hiện tại; nếu phát hiện guard trái invariant thì báo rõ, không tự biến lỗi quyền thành expected result.
- Checkout đang có refactor quote chưa commit. Expected money dùng fixture với số tiền tính tay, không lấy kết quả từ chính hàm đang được test. Chốt trạng thái code tại thời điểm bắt đầu triển khai.

## 2. Phương án đề xuất

**Playwright Test + Chromium + PostgreSQL test riêng; giữ nguyên Vitest.**

Lý do thêm một devDependency `@playwright/test`: runner, browser isolation, locator tự chờ, trace/report và CI có sẵn. Không tự xây runner trên Puppeteer cục bộ; không dùng Next experimental test mode.

```text
Playwright browser
  → Next.js server riêng (loopback, cổng 3100)
    → auth JWT + CSRF + route + use-case + Prisma thật
      → PostgreSQL 16 tạm (cổng 55432, DB qltruongcung_e2e)

Fixture setup → chỉ DB test
Assertions   → UI + HTTP + đọc DB để đối chiếu tiền/kho/audit
```

Không mock API nội bộ trong các flow E2E chính. Setup prerequisite bằng fixture/API được phép, nhưng hành động đang được kiểm thử phải thao tác qua UI. Các kiểm tra HTTP trực tiếp cho security/race được ghi rõ là companion API integration checks, không gọi chúng là browser coverage.

### Cô lập và an toàn dữ liệu

1. Dùng Compose E2E riêng, PostgreSQL disposable, không gắn volume production/dev. Chỉ bind cổng trên loopback.
2. Dùng URL test tường minh; launcher bắt buộc kiểm tra host loopback + cổng 55432 + tên DB `qltruongcung_e2e` trước mọi schema/reset/seed. Không fallback sang `.env`.
3. Override **cả `DATABASE_URL` và `DIRECT_URL`** cho subprocess Prisma và Next. `prisma.config.ts` ưu tiên DIRECT_URL; chỉ đổi DATABASE_URL là chưa đủ an toàn.
4. Server/app dùng secret test riêng, không mang Google OAuth/token thật vào fixture. Không khởi động worker tích hợp bên ngoài.
5. Next dùng output `.next-e2e` riêng, không chiếm `.next` hay tái sử dụng dev server đang chạy. `reuseExistingServer: false`.
6. Ban đầu `workers: 1`, không chạy hai suite trên cùng DB. Reset dữ liệu từng test; mỗi test tự có prerequisite, không phụ thuộc thứ tự test trước. Nếu cần chạy song song sau này, tách DB theo worker trước.
7. Dùng user ID mới khi reset, tránh auth cache 30 giây giữ user cũ; không sửa settings đang cache giữa các test nếu không restart server.
8. Cleanup chỉ tác động container/DB test đã xác thực; đóng server/browser khi kết thúc hoặc lỗi. Không chạy `npm run db:reset`, seed admin có sẵn hoặc `/api/seed` trên môi trường mặc định.

### Chống flaky

- `timezoneId: Asia/Ho_Chi_Minh`, locale tiếng Việt; fixture thời gian tương đối theo ngày VN, rule giá phủ khung test.
- Test tiền chính xác dùng start/end cố định qua input/API hiện có hoặc fixture, cách xa biên ngày/giờ. Browser clock không được coi là clock của server.
- Timer/pause test riêng: chờ điều kiện/giá trị thay đổi có timeout, không sleep tuỳ ý và không đợi chơi đủ một giờ.
- Dùng `getByRole`, `getByLabel`, scope theo dialog/card. Chỉ bổ sung accessible label/test ID hẹp khi thật sự cần; không dùng CSS selector phụ thuộc layout.
- Login thật qua UI cho auth cases; những test khác lấy storage state bằng login API thật. Không ký JWT giả, không bỏ CSRF.
- Mutation limiter hiện là 30/phút/IP: cấp IP test riêng qua header của browser context/API context tới server local theo từng test; không tắt limiter production. Test rate limit có key riêng và kiểm tra riêng.
- Thu trace + screenshot khi fail, retry tối đa 1 lần trong CI; ghi nhận flaky, không coi retry xanh là hết lỗi.

## 3. Các phase và tiêu chí kiểm chứng

### Phase 1 — Hạ tầng + smoke

- Config Playwright, launcher kiểm tra DB an toàn, Compose E2E, fixture reset/seed tối thiểu.
- Đã chạy: ADMIN fixture ngẫu nhiên `e2e_pw_*` (xoá sau suite) hoặc tài khoản `admin` có sẵn qua `E2E_ADMIN_USERNAME`/`E2E_ADMIN_PASSWORD`; hàng hoá/bảng giá/ca `[E2E]` được dọn bằng `e2e/e2e-data.ts`.
- Chưa tạo fixture cho: khuyến mại, gói hội viên, member còn/hết hạn, booking cọc, role STAFF/TEACHER, dữ liệu đào tạo.
- Tách discovery Vitest/E2E; ignore report, trace, storage state và output build test.
- Smoke đầu tiên: chưa login → redirect; login thật → trang đúng role; logout → không mở dashboard được nữa.
- Kiểm chứng: guard từ chối URL thiếu/sai và DIRECT_URL không đồng nhất **trước khi có kết nối/ghi**; chạy smoke hai lần liên tiếp trên DB sạch.

### Phase 2 — POS, tiền và tồn kho (ưu tiên cao nhất)

| Nhóm | Kịch bản | Điều phải chứng minh |
|---|---|---|
| Ca | Mở ca, nhân viên thứ hai tham gia | Một ca dùng chung, đúng participant/staffId; chưa tham gia thì không thao tác tiền; ADMIN/MANAGER chỉ xem khi chưa vào ca |
| Vãng lai | Check-in tên/SĐT, reload, checkout | Không sinh Customer rác; giá chưa chốt khi check-in; chọn giá lúc thu; INV/Payment/shift khớp; phiên COMPLETED |
| Bán kèm | Thêm hàng + dịch vụ, sửa/xoá số lượng, đóng/mở drawer, thu tiền | Chưa có invoice/payment trước thu; tồn thay đổi đúng delta; không tính tiền/trừ kho hai lần |
| Drawer | Sửa rồi thoát, ở lại, lưu lỗi/chậm | Hỏi xác nhận đúng; dữ liệu sau reload đúng; không bị response cũ ghi đè. Ca lỗi mạng là test resilience có fault injection tách riêng |
| Tiền | Tier + khuyến mại + phí gửi xe | Giảm chỉ tiền giờ; gửi xe là khoản trừ, hiển thị dấu âm/đỏ; số UI/preview/INV/Payment khớp với expected fixture |
| Thu trước | Chọn một số người, nhiều nhóm giá, thu phần còn lại bằng giá khác | ACTIVE tới người cuối; không underflow counts; không thu lại người/hàng đã trả; không khoá giá người còn chơi |
| Pause | Nghỉ/tiếp tục một người và cả phiên, đổi tên rồi reload | Không đổi thứ tự người; trừ thời gian nghỉ đúng; timer phản ánh trạng thái server |
| Guard | Thiếu bảng giá tại checkout, vượt tồn, thu lại phiên hoàn tất | Thông báo rõ; DB không có invoice/payment/movement rác, không âm kho |
| Race | Hai request thu cùng người hoặc tranh sản phẩm cuối | Companion HTTP test với DB thật: tổng thu/kho không nhân đôi; nếu phát hiện lỗi thì báo đỏ, không nới assertion |
| Đóng ca | Thu CASH/TRANSFER/CARD, đối soát và đóng | Expected cash chỉ lấy thành phần tiền mặt hợp lệ; participants kết thúc; không nhận thêm giao dịch vào ca đóng |

Kiểm chứng: flow trên mobile Chromium; đọc DB đối chiếu invoice items, payment, stock movements và audit. Không chỉ assert toast thành công.

### Phase 3 — Hội viên, cọc, void và báo cáo

| Nhóm | Kịch bản | Điều phải chứng minh |
|---|---|---|
| Hội viên | Đăng ký; gia hạn còn hạn/hết hạn; member check-in/checkout có mua hàng | Một lần thu phí tạo đúng một payment; nối kỳ đúng; tiền giờ 0 nhưng hàng vẫn tính; hết hạn bị chặn |
| Void membership | Huỷ invoice phí hội viên | Kỳ gắn invoice hết hiệu lực, không xoá lịch sử/payment gốc, không huỷ nhầm kỳ khác |
| Booking | Đặt lịch có cọc khi chưa có ca, ghi chú trống; xác nhận khi có ca; checkout/thu trước | Không tạo session ngay khi đặt; cọc quy về ca thu; trừ cọc đúng một lần, đối chiếu tổng doanh thu không đếm đôi |
| Cọc dư | Checkout tổng nhỏ hơn cọc | Phần áp cọc và refund theo code/nghiệp vụ đã chốt, không tạo số dư hoặc tiền thu sai |
| No-show | Lịch cũ không cọc/còn cọc, huỷ giữ cọc | GET chỉ auto-cancel lịch không còn cọc; lịch có cọc phải xử lý rõ bởi người trong ca, DEP và audit đúng |
| Void invoice | Huỷ hoá đơn có sản phẩm, huỷ lần hai | Hoàn kho đúng một lần; giữ payment gốc; báo cáo loại invoice CANCELLED; audit tồn tại |
| Báo cáo | Giao dịch ca, tổng doanh thu, payment breakdown, lọc ngày VN, export | Khớp fixture và DB; không cộng từ Session.totalAmount; CSV chỉ role được phép |

Kiểm chứng: chạy độc lập và chạy cùng Phase 2; reload UI sau mutation để xác nhận persistence. Void ca đã đóng kiểm theo correction flow thực tế, không tự sửa snapshot đối soát đã chốt.

### Phase 4 — Quyền, đào tạo và giao diện

- Ma trận ADMIN/MANAGER/STAFF/TEACHER: menu + mở URL trực tiếp + HTTP API trái quyền. TEACHER vào được Thêm, không gọi API ca/settings trái quyền; không chỉ test ẩn nút.
- CSRF thiếu/sai và session hết hạn bị từ chối, không ghi DB; login sai/rate limit ở case riêng.
- Học viên → gói buổi → lớp/khung lịch → buổi lẻ → điểm danh + ghi chú → kiểm tra used count và persistence. Điểm danh lại không trừ buổi hai lần; chặn xếp học viên vào hai lớp.
- Không test OAuth Google thật trong suite mặc định. Không seed CalendarConnection; test trạng thái chưa kết nối. Đồng bộ bên ngoài cần contract/integration suite riêng nếu yêu cầu sau.
- Toàn bộ flow chính: mobile light. Smoke chọn lọc trên mobile dark, desktop light/dark: navigation, modal/drawer, không tràn ngang, thao tác chính truy cập được. Không nhân cả bộ financial test lên bốn cấu hình ở giai đoạn đầu.
- CRUD quản trị (bảng giá, khuyến mại, kho, dụng cụ, gói hội viên, nhân viên, thu chi): mỗi nhóm một happy path + chặn trái quyền. Chi tiết tổ hợp validation tiếp tục để Vitest.

### Phase 5 — CI + tài liệu chạy

- GitHub Actions: npm ci → Prisma generate → typecheck/lint → Vitest → production build → Playwright trên PostgreSQL service riêng; upload HTML report/trace khi lỗi.
- Guard DB CI cho phép đúng hostname/port/db của service được cấu hình tường minh, không mở allowlist host tuỳ ý.
- Local cung cấp lệnh smoke/full/UI/report. CI pull request chạy smoke; full chạy thủ công/nightly trước, nâng thành gate khi ổn định.
- Không triển khai production hoặc push commit trong phạm vi này.

## 4. Files dự kiến

### Tạo mới

| File/nhóm | Vì sao cần |
|---|---|
| `playwright.config.ts` | Runner, project browser, timeout, report và server test |
| `docker-compose.e2e.yml` | DB disposable độc lập, không reset volume dev |
| `scripts/e2e.ts` | Một entry point kiểm tra env/DB rồi điều phối schema, build/server/test và cleanup; dùng lại từ CI |
| `src/lib/__tests__/e2e/fixtures.ts` | Fixture users/data, kiểm tra DB đích và helpers nhỏ dùng chung; không xây page-object framework |
| `src/lib/__tests__/e2e/*.spec.ts` | Chia theo domain: auth/roles, shifts, checkout, memberships, bookings, invoices/reports, training, admin, responsive |
| `.github/workflows/e2e.yml` | CI tái lập được, report khi lỗi |
| `docs/e2e-testing.md` | Hướng dẫn prerequisites, chạy/debug, dữ liệu an toàn, giới hạn coverage |

### Sửa có giới hạn

- `package.json`, `package-lock.json`: dependency và scripts test E2E.
- `vitest.config.ts`: exclude thư mục E2E, giữ nguyên unit/API suite.
- `next.config.ts`: output directory test riêng qua biến môi trường, mặc định production/dev không đổi.
- `.gitignore`: artifacts test, auth state, `.next-e2e`.
- `AGENTS.md`/`CLAUDE.md`/`docs/directory-structure.md`: cập nhật index/cách chạy khi hạ tầng đã có. Chỉ sửa đoạn docs nghiệp vụ lỗi thời trực tiếp ảnh hưởng expected E2E.
- Component: chỉ accessible label/test ID thật sự cần cho locator, không redesign UI.

Không đổi schema nghiệp vụ, không refactor checkout, không sửa lỗi nghiệp vụ ngoài phạm vi một cách âm thầm. Test phơi bày bug sẽ được báo riêng cùng reproduction.

## 5. Definition of done

- Một lệnh chạy lại được trên DB test sạch; test không phụ thuộc thứ tự và không kết nối production.
- Kiểm chứng safety guard bằng test; cả runtime lẫn Prisma CLI trỏ cùng DB.
- Browser coverage thật cho luồng vận hành, assertion tài chính dựa trên dữ liệu đã lưu và expected cố định.
- Full suite chạy xanh hai lần liên tiếp; ghi rõ case chạy, skipped, flaky và lỗi baseline, không chỉ báo số file tạo mới.
- Thứ tự xác minh: `tsc --noEmit` + ESLint → Vitest → production build → E2E; không sửa thay đổi checkout đã có từ trước để làm xanh test.
- Báo cáo cuối nêu test nào thực sự đã chạy, môi trường nào, bug còn mở; không cam kết coverage 100%.

## 6. Chờ duyệt

Đề xuất triển khai lần lượt Phase 1 → 2 → 3 → 4 → 5, ưu tiên POS/tiền/kho trước độ rộng CRUD. Dừng tại kế hoạch này cho tới khi người dùng duyệt. Việc cài browser/Docker nếu môi trường thiếu sẽ cần quyền hoặc cấu hình tương ứng, không được giải quyết bằng cách dùng DB production.
