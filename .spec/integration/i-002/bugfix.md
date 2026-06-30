# Bugfix — i-002 (review-pr-slack-azure)

> `/tn-review` ghi mỗi bug: triệu chứng · nguyên nhân gốc · cách sửa · phòng ngừa. Sửa code SAU khi ghi. Mỗi bug rút 1 rule vào `CLAUDE.md`.

## BUG-09 `[CRITICAL]` — `complete()` chạy TRƯỚC `fanout()` → crash giữa 2 bước làm job mất khả năng reclaim → mất TOÀN BỘ giao kết quả

- **path:** `src/application/reviewOrchestrator.ts:137` (`complete()`) vs `:151` (`fanout()`); `reviewJobRepository.ts` `claimNext` (chỉ claim `queued`/`running` quá lease).
- **Triệu chứng:** Worker lưu history (ADR-010) → `complete()` (đặt `status='completed'`, xoá `leaseUntil`) → rồi mới `fanout()`. Nếu tiến trình bị giết (OOM/deploy/SIGKILL) SAU `complete()` nhưng TRƯỚC khi `fanout()` post xong: job ở `completed` nên **không worker nào reclaim được nữa** (claimNext chỉ lấy queued/running). Mọi `deliveryTarget` ở `pending` **vĩnh viễn không được giao** — người dùng kẹt ở ack "⏳ Đang xử lý…" mãi mãi.
- **Nguyên nhân gốc:** Sai THỨ TỰ — side-effect giao kết quả (`fanout`) nằm SAU bước làm job không-thể-reclaim (`complete`). Guard `hasHistory` (dòng 44, định để reclaim giao lại) **không bao giờ kích hoạt** vì job đã rời trạng thái reclaim-được.
- **Cách sửa:** **Đảo thứ tự**: `save history` → `fanout()` (giao + mark per-target) → `complete()` SAU CÙNG. Khi đó crash trước `complete()` để job ở `running` → hết lease → reclaim → guard `hasHistory` → **re-fanout lấy dữ liệu từ history** (`reviewHistoryRepository.findByJobId`, idempotent per-target) → rồi `complete()`. Guard `hasHistory` cũng phải re-fanout thay vì chỉ `complete()+return`.
- **Phòng ngừa:** Side-effect quan trọng (giao kết quả) phải hoàn tất TRƯỚC khi đánh dấu trạng thái-cuối làm mất khả năng khôi phục/reclaim. "Đánh dấu hoàn tất" là bước CUỐI, sau khi mọi side-effect cần-thiết đã idempotent-commit (i-002).

## BUG-12 `[MEDIUM]` — `fresh` supersede dùng `findCacheEligibleByKey` → mất lineage khi bản trước KHÔNG cache-eligible

- **path:** `src/application/reviewCommandService.ts:139-142`
- **Triệu chứng:** `fresh`/rerun tìm bản trước để gắn `supersededByJobId` qua `findCacheEligibleByKey`. Nhưng hàm này loại job `failed`/lỗi-toàn-phần/empty. Nếu bản completed gần nhất là lỗi-toàn-phần (đúng case hay phải rerun nhất) → trả null → **không ghi lineage supersede** → mất truy vết bản cũ↔mới.
- **Nguyên nhân gốc:** Dùng bộ lọc "đủ điều kiện cache" làm proxy cho "bản completed gần nhất tồn tại" — hai khái niệm khác nhau.
- **Cách sửa:** Thêm `findLatestCompletedByKey(key, excludeId)` (không lọc cache-eligible) dùng riêng cho supersede.
- **Phòng ngừa:** Không tái dùng query có bộ lọc nghiệp vụ (cache-eligible) cho mục đích khác (lineage) — mỗi mục đích một query đúng ngữ nghĩa.

## BUG-13 `[MEDIUM]` — `recordDeliveries` ($set) ghi đè mất bản ghi `appendDelivery` (cache-serve) trong history

- **path:** `src/adapters/mongo/reviewHistoryRepository.ts` `recordDeliveries` (`$set: { deliveries }`) vs `appendDelivery` (`$push`)
- **Triệu chứng:** Re-fanout (sau reclaim — sau khi sửa BUG-09) gọi `recordDeliveries` `$set` ghi đè toàn mảng `deliveries`, **xoá** các bản ghi `mode:'cache'` mà `appendDelivery` đã push từ các lần cache-serve giữa chừng → Admin UI mất audit giao.
- **Nguyên nhân gốc:** `$set` ghi đè mù thay vì hợp nhất.
- **Cách sửa:** `recordDeliveries` hợp nhất theo `(channel,threadTs,mode)` với mảng hiện có (đọc-merge-set hoặc chỉ cập nhật phần worker), không xoá bản ghi cache.
- **Phòng ngừa:** Tránh `$set` mù lên mảng dùng-chung bởi nhiều đường ghi; hợp nhất có khoá.

## BUG-10 `[MEDIUM]` — `race_none` lặp lại trả nhầm `subscribed` → người dùng chờ vô hạn, không có job

- **path:** `src/application/reviewCommandService.ts:130-159`
- **Triệu chứng:** Khi job vừa rời trạng thái active (completed/failed) đúng lúc nhận lệnh, `enqueueOrSubscribe` trả `race_none`. Code thử lại 1 lần; nếu lần 2 VẪN `race_none` (job lại đổi trạng thái), `enq.status` rơi xuống nhánh `else` → trả `kind: 'subscribed'`. Gateway ack "⏳ đang review, kết quả sẽ gửi vào đây" nhưng **không có job, không target** → người dùng **không bao giờ nhận kết quả** (im lặng).
- **Nguyên nhân gốc:** Nhánh `else` cuối gom luôn `race_none` (không xử lý tường minh). Chỉ retry 1 lần và không có nhánh an toàn cuối cùng.
- **Cách sửa:** Sau retry, nếu vẫn `race_none` → thử cache-serve lần cuối; nếu vẫn không có → trả `kind: 'rejected'` với thông điệp "đang bận, thử lại" (KHÔNG ngầm báo subscribed). `else` chỉ nhận đúng `subscribed`/`already_subscribed`.
- **Phòng ngừa:** Switch trên union-status phải xử lý TƯỜNG MINH mọi nhánh; cấm `else` gom các trạng thái có ngữ nghĩa khác nhau — đặc biệt khi hậu quả là "ack thành công nhưng không bao giờ phản hồi".

## BUG-14 `[HIGH]` — Redaction sót pattern secret phổ biến → secret rời lên Slack (vĩnh viễn)

- **path:** `src/observability/redact.ts:20-37` (`REPORT_SECRET_PATTERNS`, `redactReport`)
- **Triệu chứng (đã verify bằng chạy thật):**
  1. **GitHub token**: chỉ bắt `ghp_…`; bỏ sót `gho_/ghu_/ghs_/ghr_` và fine-grained `github_pat_…`. Khi bắt được cũng còn để lại prefix `ghp_`.
  2. **`key="value có dấu cách"`**: lớp `[^\s"']{4,}` dừng ở dấu cách đầu tiên → `password = "super secret pw"` **không bị che** (dạng config rất phổ biến). `password: hunter2` (không cách) thì che được.
  3. **AWS tạm thời**: chỉ bắt `AKIA…` (long-term); bỏ sót `ASIA…` (STS) và `AWS_SESSION_TOKEN`.
- **Nguyên nhân gốc:** Bộ pattern hẹp; value-class không xử lý chuỗi có dấu cách trong ngoặc kép.
- **Cách sửa:** Mở rộng pattern: `gh[opusr]_[A-Za-z0-9]{20,}` + `github_pat_[A-Za-z0-9_]{20,}` (che cả prefix); `A[KS]IA[0-9A-Z]{16}`; thêm `AWS_SESSION_TOKEN`; value-class hỗ trợ chuỗi có dấu cách trong ngoặc: `(["'])[^\n]{4,}?\1` HOẶC `\S{4,}` cho dạng không ngoặc. Bổ sung UT data-driven nhiều biến thể.
- **Phòng ngừa:** Redaction là "best-effort" — phải có **bộ test data-driven** liệt kê biến thể token/secret thật (GitHub/AWS/quoted) để đo false-negative mỗi khi đổi pattern (i-002).

## BUG-11 `[LOW]` — Ký tự zero-width vô hình trong source `neutralizeMentions`

- **path:** `src/application/reviewReport.ts` (`neutralizeMentions`, replacement `'@$1​'`)
- **Triệu chứng:** Chuỗi thay thế chứa ký tự U+200B (zero-width space) viết trực tiếp trong source → vô hình với người đọc/diff, dễ bị xoá nhầm hoặc hiểu sai.
- **Nguyên nhân gốc:** Dùng literal ký tự ẩn thay vì escape `​`.
- **Cách sửa:** Thay bằng escape tường minh `'@$1​'`.
- **Phòng ngừa:** Không nhúng ký tự điều khiển/zero-width dạng literal trong source — luôn dùng escape `\uXXXX` để diff/review đọc được.

## Residual đã ghi nhận (KHÔNG sửa ở i-002 — cân nhắc tương lai)

- `[MEDIUM]` **Lease hết hạn giữa lúc chạy skill dài → reclaim song song → chạy skill 2 lần + giao trùng** (concurrency #2/#3). `markTargetDelivered` chỉ atomic ở bước MARK, còn POST xảy ra trước → 2 worker cùng pending có thể post trùng. Đây là **at-least-once chấp nhận** theo ADR-013 (giao trùng 1 lần tốt hơn mất). Khử triệt để cần **lease-heartbeat** (gia hạn lease trong lúc chạy) — đưa vào backlog. KHÔNG đổi sang claim-before-post vì sẽ tạo rủi ro MẤT giao khi crash giữa claim và post.
- `[Residual #8 i-001]` `authorizeReviewCommand` = `return true` (mọi người review mọi project) — i-002 mở rộng bề mặt qua fan-out/cache-serve. Nếu siết chính sách #8 sau này, phải áp cùng gate cho review + subscribe + cache-serve + fresh (đã chuẩn bị: tất cả đi qua 1 `handle()` có gate).
- `[LOW]` `review_history` lưu `findings` **chưa redact** ở DB (chỉ .md outbound mới redact). Trong-tenant, owner-scoped → chấp nhận; ghi nhận để nếu mở API/đồng bộ ngoài thì phải redact.
