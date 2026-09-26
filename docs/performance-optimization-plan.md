# Kế hoạch tối ưu hiệu năng nghiệp vụ trên Vercel

Ngày lập: 2026-09-26. Trạng thái: sẵn sàng cho agent triển khai; chưa có baseline production.

## 1. Mục tiêu và phạm vi

Giảm thời gian phản hồi check-in, checkout, bán hàng, gia hạn và tải màn Ca hôm nay; giảm số request, lượt SQL và dữ liệu truyền để tiết kiệm tài nguyên. Giữ modular monolith, Prisma 7 + PostgreSQL, Node.js runtime và SWR hiện có.

Mốc mong muốn ban đầu: p95 API đọc POS và check-in khi hệ thống đã khởi động dưới 500ms ở tải thực tế. Đây là mục tiêu cần kiểm chứng, không phải cam kết. Checkout nhiều mặt hàng phải đo riêng theo kích thước giỏ; không đánh đổi tính đúng để đạt 500ms.

Phân tích hiện tại xác nhận được các mẫu truy vấn/request trong code, chưa xác nhận nguyên nhân chính của độ trễ. Chưa biết region Vercel/DB, endpoint người dùng đo và tỷ lệ cold start/retry.

Agent đọc `AGENTS.md`, `docs/architecture.md`, `docs/business-flow-checkin-playing-checkout.md`, rồi trace code hiện tại. Workspace đang có nhiều thay đổi chưa commit: không reset, stash, ghi đè hoặc đưa thay đổi không liên quan vào commit. Docs có thể chậm hơn code, đặc biệt luồng SessionSellItem/booking; đối chiếu tests và hỏi khi business thực sự mâu thuẫn.

## 2. Ràng buộc bắt buộc

- Tất cả ghi nhiều bảng vẫn qua `runInTransaction()`. Payment, tồn kho, snapshot và audit tài chính phải commit/rollback cùng nghiệp vụ; không chuyển sang background.
- Giữ kiểm tra quyền, ca mở, membership, tồn kho có điều kiện, checkout từng phần và snapshot giá. Không dùng cache client làm nguồn quyết định thanh toán.
- Không mở rộng TTL auth hoặc bỏ kiểm tra user để giảm latency. Không retry mutation mù khi chưa biết transaction đã commit hay chưa.
- Không cache công khai response chứa thông tin khách hàng, quyền hoặc tài chính. Cache client phải được xóa khi logout/đổi tài khoản.
- Không thêm Redis, queue, microservice, ORM mới hoặc cache server phân tán trong vòng tối ưu đầu.
- Không dùng `Promise.all` trong interactive transaction như một cách tăng tốc SQL: transaction vẫn dùng một connection. Batch SQL mới giảm lượt trao đổi.
- Không đổi nghiệp vụ, schema hoặc thêm index theo suy đoán. Mọi SQL tổng hợp phải giữ scope hiện hành, loại hóa đơn hủy và timezone Việt Nam.
- Không sửa UI hình thức. Nếu cần thiết kế lại tương tác, đọc skill Impeccable theo hướng dẫn workspace.

## 3. Thứ tự triển khai

Thực hiện tuần tự: P0 → P1 → P2 → P3. P4 và P5 chỉ làm khi dữ liệu đo chứng minh cần thiết. Sau mỗi bước cập nhật bảng kết quả cuối tài liệu, không tiếp tục mở rộng khi đã đạt mục tiêu và không còn vấn đề đo được.

### P0 — Baseline và xác nhận deployment

**Phạm vi:** `src/lib/infrastructure/`, các route sessions/check-in/checkout/sell, memberships, reports đại diện; `vercel.json` chỉ sửa khi biết region DB.

1. Xác nhận mốc >500ms là browser total, TTFB, Vercel function duration hay log `next dev`. Không so thời gian compile của dev với production.
2. Ghi lại region DB, function region, trạng thái Fluid Compute, runtime, loại connection direct/session/transaction pooler. Chỉ ghi metadata, không in connection string hoặc secret. Không giả định Supabase chỉ từ comment trong code.
3. Nếu khác region, chuẩn bị thay đổi đặt function gần DB. Giữ nguyên cron; không hardcode `sin1` trước khi xác nhận DB ở Singapore. Thiếu quyền Dashboard thì ghi phần còn thiếu và tiếp tục các bước code độc lập.
4. Thêm instrumentation tối thiểu bằng `performance.now()` cho một vài endpoint đại diện: `authMs`, `prepareMs`, `transactionMs`, `totalMs`, `outcome`, route và request ID. Timing transaction phải phân biệt toàn bộ lời gọi với thời gian callback; phần chênh bao gồm acquire/begin/commit, không gọi toàn bộ là pool wait.
5. Log một bản tổng hợp/request được lấy mẫu; cấu hình tắt được. Không log body, tên khách, SQL parameters, token. Có thể trả `Server-Timing` chỉ chứa duration khi bật chẩn đoán. Ghi nhận retry bằng cơ chế hiện có, không tạo hệ thống tracing chung.
6. Đếm SQL và duration bằng khả năng có thật của Prisma/driver phiên bản đang cài, bật tạm trên staging. Nếu không gắn được SQL với request một cách đúng khi concurrent, đo request tuần tự trong staging; không dùng counter global rồi gán nhầm số liệu. Không gọi số repository method là số SQL.
7. Đo 30–50 mẫu warm cho mỗi case, báo p50/p95/max và cỡ mẫu; đánh dấu p95 mẫu nhỏ là sơ bộ. Đo riêng các lần sau idle và xác minh cold start nếu có telemetry, không coi idle luôn đồng nghĩa cold start. Thử 1 và 3–5 request đồng thời theo số quầy thực tế.

**Cases:** check-in vãng lai/hội viên; preview 1/3 nhóm; checkout 1 người không hàng, checkout 5 SKU, thu trước; bán kèm; gia hạn; mở Ca hôm nay; báo cáo 7/30 ngày. Mutation chỉ chạy trên staging với dữ liệu thử, không phát sinh payment vào DB thật để benchmark.

**Nghiệm thu:** có baseline tái lập và cách bật/tắt đo; không đổi response contract, status hoặc error mapping. Nếu chưa có staging, cung cấp hướng dẫn chạy và đánh dấu kết quả chưa đo; không chặn sửa code an toàn vì thiếu số liệu triển khai.

### P1 — Lookup ca tối giản dùng chung

**Files:** `src/lib/shifts/ports.ts`, `helpers.ts`, `src/lib/infrastructure/adapters/shift-adapter.ts` và caller thật sự cần ID ca.

1. Thêm method cụ thể `findOpenIdForStaff(staffId): Promise<{ id: string } | null>` dùng `select: { id: true }`.
2. Giữ nguyên predicate: ca OPEN, staff là người mở hoặc participant chưa rời ca; giữ thứ tự chọn ca. Dùng lại predicate gọn nếu cần tránh hai bản điều kiện lệch nhau, không tạo query builder tổng quát.
3. Rà mọi caller `findOpenForStaff`: check-in, checkout, sell/remove sell items, retail sale, register/renew membership. Chỉ thay caller đọc ID. Giữ phương thức đầy đủ cho UI và open/join nếu cần detail.
4. Giữ vị trí guard trong transaction ở những luồng vốn có guard đó. Không nhân tiện dời validation khỏi transaction.
5. Cập nhật test doubles liên quan, bổ sung test nhỏ cho ca không tồn tại, staff không thuộc ca và selection tối giản.

**Nghiệm thu:** kết quả nghiệp vụ không đổi; lookup nghiệp vụ không tải staff/participants/toolCounts vào response; đo SQL/payload trước–sau. Tests check-in/checkout/guards và các caller đã sửa đều pass.

### P2 — Giảm tải lại POS và request preview

**Files:** `src/features/pos/today-shift-screen.tsx`, `checkout-drawer.tsx`, `src/hooks/use-api.ts`, các consumer cần thiết. Dùng `apiJson` hiện có, đã nhận `RequestInit.signal`.

1. Thay cơ chế refresh toàn bộ trong `loadData()` bằng SWR hiện có và invalidate theo tài nguyên. Chọn cách sửa ít nhất, không tạo data layer mới. Tránh hai nguồn state độc lập cho cùng server data.
2. Auth dùng cache client chung. Products/tools tải khi dialog cần, có trạng thái loading/error/retry rõ ràng; không âm thầm dùng danh sách rỗng khi tải lỗi. Revalidate khi mở lại theo TTL hợp lý, khi focus/reconnect và sau mutation liên quan; SWR `dedupingInterval` không đồng nghĩa TTL freshness.
3. Không bật skeleton toàn trang khi background refresh. Chỉ báo thanh toán thành công sau khi server xác nhận. Khi ghi thành công nhưng refresh thất bại, phân biệt lỗi refresh để người dùng không bấm thu tiền lại.
4. Quy tắc refresh tối thiểu:

| Thao tác | Dữ liệu cần cập nhật/revalidate |
|---|---|
| Check-in | Sessions; bookings nếu từ booking; summary ca nếu đang hiển thị |
| Pause/resume/đổi tên | Phiên bị thay đổi |
| Bán kèm/xóa hàng | Phiên/giỏ, products, summary liên quan nếu có |
| Checkout | Sessions, summary/giao dịch ca đang hiển thị, products nếu có hàng; bookings nếu bị thay đổi |
| Mở/tham gia/đóng ca | Ca hiện tại và trạng thái thao tác POS; các query đang hiển thị phụ thuộc ca |
| Gia hạn/đăng ký | Membership/customer liên quan và summary ca đang hiển thị |

5. Không tắt toàn bộ focus/reconnect để giảm request vì có nhiều máy thu ngân. Giữ kiểm tra server là quyết định cuối cùng. Xóa cache có scope tài khoản khi logout/đổi người dùng.
6. Preview: mở lần đầu tải ngay; debounce khoảng 250ms cho thay đổi lựa chọn liên tục. Hủy timer/request cũ bằng AbortController, giữ bảo vệ response cũ ghi đè state, không toast khi abort. Không đưa ticker mỗi giây vào dependency gọi preview. Trong lúc quote chưa khớp lựa chọn hiện tại, không hiển thị quote cũ như kết quả hợp lệ; giữ guard submit phù hợp.

**Nghiệm thu:** thao tác thông thường không gọi lại cả 6 API; không refetch auth/tools sau mỗi check-in; ghi rõ số request mỗi case trước–sau. Test response preview trả ngược thứ tự, đổi session/đóng drawer, refresh lỗi sau payment và invalidation liên quan. Dùng test setup đang có, không cài framework mới.

### P3 — Batch đọc bảng giá/sản phẩm, tránh đọc lại session

**Files:** `src/lib/sessions/use-cases/check-out.ts`, `pricing-engine.ts`, `src/app/api/sessions/[id]/checkout-preview/route.ts`, pricing/session ports và adapters; `sell-items.ts` khi cùng pattern.

1. Tìm helper batch sẵn có. Nếu thiếu, bổ sung `findManyByIdsWithTiers(ids)` trong pricing repository: deduplicate ID, query một batch, tạo Map để truy cập theo ID và giữ thứ tự nhóm đầu vào.
2. Dùng cho cả resolve checkout và preview. Giữ validation missing/inactive/effective/day/hour theo business đã xác định; không âm thầm thay rule hoặc fallback giá. Nếu hai flow đang có rule khác nhau, ghi nhận và giải quyết rõ trước khi hợp nhất business logic.
3. Tái sử dụng session đã tải qua helper `calculateSessionPriceFromLoaded` khi tương đương về shape và semantics; giữ các lần revalidation membership/promotion cần thiết. Không cache session giữa các request thanh toán.
4. Gom tập product ID cần đọc trong transaction, gọi `findManyByIds` một lần nếu projection đủ; dùng bản đồ sản phẩm để kiểm tra tồn tại/trạng thái. Giữ update giảm kho có điều kiện trên từng sản phẩm, StockMovement, unitCost và audit. Không tin tồn kho từ batch read để thay thế atomic stock guard.
5. Không gộp dòng bán kèm và hàng mới nếu làm mất giá snapshot/metadata. Kiểm tra rõ thời điểm trừ kho của code hiện hành thay vì giả định từ docs cũ.
6. Chỉ batch ghi invoice items/stock movements nếu sau batch đọc, số liệu vẫn cho thấy phần ghi chiếm đáng kể. Dùng `createMany` cho các bản ghi độc lập; nếu cần ID thì chuẩn bị ID trước với cơ chế hiện có. Không viết raw SQL mutation lớn ngay vòng đầu.

**Nghiệm thu:** đọc bảng giá không tăng theo số nhóm; đọc kiểm tra sản phẩm không còn một query mỗi dòng. Đo SQL thật, không hứa toàn transaction O(1) vì cập nhật kho vẫn theo sản phẩm.

**Regression bắt buộc:** member còn/hết hạn, không có giá phù hợp, progressive tiers và promotion, pause từng người, thu trước nhiều nhóm, parking giảm tổng, booking deposit/refund nếu có, hàng bán kèm/hàng mới, thiếu tồn rollback, payment/audit không ghi một phần. So sánh giá và metadata trước–sau trên dữ liệu giống nhau.

### P4 — Báo cáo, chỉ sau khi đo

**Files:** `src/lib/infrastructure/adapters/reporting-adapter.ts`, reports ports/routes nếu cần; giữ response contract.

1. Loại aggregate/count trùng với `groupBy` đã trả cả `_sum` và `_count`, chỉ khi predicate hoàn toàn tương đương. Áp dụng cho ngày và ca.
2. Với revenue/trends/top-products đang đọc nhiều rows để reduce ở JS, đo rows/bytes và execution plan. Nếu thực sự lớn, tổng hợp tại DB theo ngày Việt Nam/sản phẩm. Dùng Prisma aggregate/groupBy khi đủ; SQL tham số hóa trong adapter khi cần timezone/expression, không nối chuỗi user input.
3. Giữ đúng scope nhân viên theo nghiệp vụ và hóa đơn hủy; không đơn giản hóa công thức lợi nhuận làm mất quantity, unitCost snapshot hoặc discount.
4. Chỉ đẩy pagination ca/ngày xuống DB khi vẫn giữ đúng thứ tự, tổng số ngày và summary toàn khoảng. Không lấy một page rồi tính summary toàn kỳ từ page đó.
5. Không cache server báo cáo ngay. Trước tiên giảm query, giới hạn khoảng thời gian và dùng cache client phù hợp.

**Nghiệm thu:** số liệu trước–sau giống nhau, gồm giao dịch sát 00:00 Việt Nam, hóa đơn hủy, STAFF/ADMIN, ngày rỗng, membership và cost snapshot. Báo cáo chạy đồng thời không làm p95 checkout tệ hơn baseline ở cùng tải thử.

### P5 — Pool/index, chỉ khi có bằng chứng

1. Giữ module-scoped Prisma instance hiện có. Không gọi `$disconnect()` sau mỗi request.
2. Xác nhận connection pooler dành cho serverless theo nhà cung cấp. `max: 5` hiện tại là mỗi instance; không xem là tổng deployment. Đo saturation/connections/retry trước khi thử pool khác; không tăng hoặc hạ về 1 theo cảm tính.
3. Nếu lifecycle khi suspend gây vấn đề và Fluid Compute đang dùng, kiểm tra API thực tế của adapter-pg rồi cân nhắc `pg.Pool` + `attachDatabasePool`. Đây là thay đổi có dependency, chỉ thêm nếu giải quyết vấn đề đã xác nhận; không thêm sẵn ở P0.
4. Chọn index từ truy vấn thực, `EXPLAIN (ANALYZE, BUFFERS)` của SELECT đại diện trên staging và index hiện có. Ghi dung lượng/chi phí ghi, migration và cách rollback. Không dùng `db:push --accept-data-loss` để triển khai tối ưu.
5. Không tăng timeout để coi là sửa hiệu năng. Không ping định kỳ giữ nóng: tăng invocation và tải DB mà không giải quyết lượt SQL dư.

## 4. Kiểm tra và phát hành

- Sau từng bước: chạy tests liên quan bằng Vitest có sẵn, typecheck và lint phạm vi sửa. Phân biệt lỗi nền đã tồn tại với lỗi mới; không sửa lan toàn repo.
- Trước bàn giao toàn đợt: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` khi môi trường đáp ứng. Nếu bị thiếu biến môi trường hoặc lỗi nền, ghi rõ command/kết quả, không tuyên bố pass.
- Giữ mỗi bước thành diff review được; không commit thay đổi có sẵn của người dùng. Không tự deploy production chỉ vì tài liệu này có checklist phát hành.
- Triển khai staging trước, đo cùng dữ liệu/tải/region/công cụ với baseline. Thay đổi region/pool phải ghi riêng để không nhầm hiệu quả với thay đổi code.
- Rollback từng bước bằng diff/commit của chính bước đó; hoàn nguyên cấu hình nếu error rate, retry hoặc p95 tăng. Index có migration riêng. Không rollback bằng thao tác xóa dữ liệu.
- Nếu mục tiêu đạt sau P3, dừng P4/P5 trừ điểm nghẽn đã đo còn tồn tại. Không triển khai toàn bộ lựa chọn chỉ để hoàn thành checklist.

## 5. Bảng bàn giao agent phải điền

| Case / kích thước dữ liệu | Region / concurrency | Số mẫu | p50/p95 trước → sau | SQL trước → sau | Request UI trước → sau | Lỗi/retry | Kết luận |
|---|---|---|---|---|---|---|---|
| Chưa đo | Chưa xác nhận | — | — | — | — | — | Không suy diễn số liệu |

### Kết quả rà soát/triển khai lần đầu — 2026-09-26

- P0: đã thêm chẩn đoán bật/tắt cho `GET/POST /api/sessions`, checkout preview/checkout, bán kèm, gia hạn hội viên và dashboard. Log JSON chỉ có route cố định, request ID, status, thời lượng pha và SQL count/duration tùy cấu hình; không ghi body, SQL, tham số, tên khách hay token. Khi diagnostics bật, response có `X-Request-Id`; sample rate mặc định 10%, đặt `API_PERF_SAMPLE_RATE=1` để lấy toàn bộ mẫu staging.
- Bật trên staging bằng `API_PERF_DIAGNOSTICS=1`, `API_PERF_SAMPLE_RATE=1`; bật `API_PERF_SERVER_TIMING=1` nếu cần header duration và `API_PERF_SQL_DIAGNOSTICS=1` để nhận Prisma query events. Đổi biến SQL diagnostics cần khởi động lại/redeploy để cấu hình Prisma singleton nhận flag mới. SQL event chỉ tăng counter trong request context; nếu không xác nhận được ALS attribution với Prisma driver trên staging, chạy phép đếm SQL tuần tự, không dùng kết quả concurrent.
- `authMs` tính đoạn `requireAuth()`; `prepareMs` là tổng handler trừ auth và lời gọi transaction; `transactionMs` gồm toàn bộ `$transaction` call (callback, acquire/begin/commit), còn `transactionCallbackMs` là phần con nằm trong transaction. Không suy diễn riêng pool wait từ hai số này.
- Metadata triển khai chưa xác nhận: `vercel.json` chỉ khai báo cron, không có region; mã nguồn không xác nhận region DB, connection pooler, Fluid Compute hay region của function. Runtime API đang dùng mặc định Node.js theo cấu hình Next.js. Không đọc/in `DATABASE_URL`, không giả định nhà cung cấp từ comment trong code và không đặt region khi chưa biết vị trí DB.
- Chưa có quyền Dashboard/staging trong workspace này nên chưa chạy 30–50 mẫu warm, idle/cold-start hoặc concurrency; latency, retry rate và request/SQL trước–sau vẫn chưa đo. Bảng kết quả giữ nguyên là “Chưa đo”.
- P1: đã thêm shift lookup chỉ select ID và chuyển các caller chỉ cần `shiftId`; lookup chi tiết tiếp tục phục vụ UI và luồng mở/tham gia ca. Chưa có phép đo SQL/payload staging trước–sau.
- P2: đã chuyển dữ liệu màn Ca hôm nay sang SWR, chỉ tải products/tools khi mở dialog, cập nhật cache theo tài nguyên sau mutation (kể cả xóa dòng bán kèm/hoàn kho) và thêm debounce/hủy request checkout preview. Chưa ghi nhận số request thực tế trước–sau.
- P3: đã batch pricing rules theo ID cho resolve/preview; dùng session đã tải để tính giá; batch đọc sản phẩm trong transaction cho checkout, bán kèm và bán lẻ. Guard trừ kho có điều kiện, stock movement, giá snapshot và thứ tự dòng giữ nguyên.
- P4/P5 chưa làm vì chưa có số liệu báo cáo, execution plan, connection saturation hoặc vị trí region làm căn cứ.

Kèm danh sách file đã sửa, commands kiểm tra, phần chưa thực hiện và lý do, cấu hình cần chủ dự án xác nhận. Nếu chưa có quyền production, hoàn thành code/checks độc lập rồi bàn giao cách đo; không bịa benchmark.

## 6. Tham chiếu deployment

- [Vercel function region](https://vercel.com/docs/functions/configuring-functions/region): ưu tiên gần nguồn dữ liệu.
- [Vercel pooling](https://vercel.com/kb/guide/connection-pooling-with-functions): quản lý pool và lifecycle trên Fluid Compute.
- [Vercel resource accounting](https://vercel.com/docs/functions/usage-and-pricing): thời gian chờ I/O và active CPU được tính khác nhau; giảm request và memory lifetime vẫn có ích.
- [Prisma transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions): semantics của interactive transaction và Promise.all.
- [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres): chỉ áp dụng nếu xác nhận đang dùng Supabase.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): dành cho mục đích cá nhân, phi thương mại; hệ thống phục vụ kinh doanh phải chọn gói phù hợp. Tối ưu quota không thay đổi điều kiện sử dụng.

Kiểm tra lại tài liệu chính thức khi triển khai vì cấu hình/gói dịch vụ có thể thay đổi.

## 7. Prompt giao việc

> Đọc AGENTS.md và docs/performance-optimization-plan.md. Triển khai P0–P3 theo thứ tự, dùng code hiện tại làm điểm xuất phát và bảo toàn thay đổi có sẵn trong workspace. Không thay nghiệp vụ, không thêm dịch vụ hạ tầng, không tự deploy production. Hoàn thành code và tests độc lập ngay cả khi thiếu telemetry deployment; ghi rõ phép đo chưa có. Chỉ làm P4/P5 khi có bằng chứng và nêu bằng chứng trước khi sửa. Bàn giao diff, kết quả kiểm tra và bảng đo trước–sau; không coi số repository call là số SQL, không tuyên bố đạt latency khi chưa đo.
