---
integration: i-002
feature: review-pr-slack-azure
stage: test
status: approved
open_questions: 0
updated: 2026-06-30
---

> **Test design delta i-002** (mô tả bằng lời: Bước · Dữ liệu vào · Kết quả mong đợi; KHÔNG sinh code Playwright/Cypress). Chỉ phủ phần MỚI/đổi của i-002; phần i-001 giữ nguyên ở `main/feature/.../test.md`. Test case delta đánh số `TC-2xx` để không đụng `TC-01..20` (i-001).

# Phân Tích Requirement

Phạm vi delta: cách **giao kết quả review** về Slack. Đối tượng kiểm thử:
1. **Output file `.md` + tóm tắt inline** (ADR-012): build báo cáo Markdown, upload `files.getUploadURLExternal`→PUT→`files.completeUploadExternal`, kèm 1 dòng tóm tắt mrkdwn (severity + link PR + commit).
2. **Fallback file→chat** (ADR-012): upload lỗi → chunk mrkdwn (<~3000 ký tự, cắt theo section/finding); cả hai fail → `delivery_failed` + alert (không nuốt lặng).
3. **Fan-out** (ADR-013): lệnh trùng khóa `(projectId,prId,commitHash)` lúc `queued|running` → register delivery target + ack chờ; xong → giao tới **mọi** target; **idempotent per-target** khi reclaim; **atomic upsert** enqueue-or-subscribe (race).
4. **Cache-serve** (ADR-014): khóa đã `completed` **hợp lệ** → trả từ History, **0 token**; loại trừ `failed`/lỗi-toàn-phần; lấy bản mới nhất **chưa superseded**.
5. **`fresh`/`rerun`** (ADR-014): bỏ qua cache → job mới `supersedes` bản cũ; `fresh` lúc đang chạy → không nhân đôi (register).
6. **Khóa commit-aware** (ADR-016): commit mới → review mới, không trúng cache cũ.
7. **Cap deliveryTargets** + dedup `(channel,threadTs)` (DoS).
8. **Security delta**: redaction secret-pattern trước upload; vô hiệu mention (`<!channel>`/`@here`) trong fallback; `authorizeReviewCommand` áp cho review+subscribe+cache-serve+`fresh`; cache-serve theo khóa resolve (không BOLA jobId); target từ event đã verify; rate-limit bao gồm `fresh`.

Giả định (kế thừa, đã chốt): khóa = `(projectId,prId,commitHash)`; cú pháp `fresh|rerun` ở cuối lệnh; cap mặc định 50 target/job; "hợp lệ để cache" = `completed` & ≥1 finding & không lỗi-toàn-phần.

# Test Conditions

- **Build report**: nội dung đầy đủ vào file `.md`; tên file `review-<project>-PR<id>-<commit8>.md`; dòng tóm tắt đếm đúng severity + link PR + commitHash.
- **Upload**: 2 bước thành công → mark `delivered(file)` chỉ sau `completeUploadExternal` OK; lỗi giữa 2 bước → coi chưa giao.
- **Fallback**: upload fail → chunk chat; ranh giới chunk (không cắt giữa câu/finding); cả hai fail → `delivery_failed`+alert.
- **Fan-out**: register vs queue vs cache-serve theo trạng thái khóa; giao mọi target pending; dedup target; cap target; reclaim chỉ giao pending.
- **Atomic upsert**: 2 lệnh đồng thời cùng khóa → đúng 1 job + 1 target phụ.
- **Cache-serve**: completed hợp lệ → serve 0-token; failed/lỗi-toàn-phần → không serve (chạy mới); nhiều bản → lấy mới nhất chưa superseded; chú thích commit+thời điểm+gợi ý `fresh`.
- **fresh/rerun**: parse cờ; bypass cache; supersedes; fresh-khi-đang-chạy → register.
- **commit-aware**: commit mới → khóa mới → review mới.
- **Security**: redaction; mention neutralize; authorize mọi entrypoint; BOLA cache theo khóa; target từ event verify; rate-limit fresh; Slack retry không tạo target trùng.

# Test Scenarios

- **SC-2.1** Happy path file: review xong → upload `.md` + tóm tắt inline vào thread.
- **SC-2.2** Upload fail → fallback chunk chat trong cùng thread.
- **SC-2.3** Upload + chat đều fail → `delivery_failed` + alert, không báo "✅ hoàn tất".
- **SC-2.4** Fan-out: 3 lệnh cùng khóa từ 3 thread khác nhau lúc đang chạy → cả 3 nhận file khi xong.
- **SC-2.5** Reclaim giữa fan-out: đã giao target#1, worker chết → reclaim chỉ giao target#2,#3 (không post lại #1).
- **SC-2.6** Race: 2 lệnh cùng khóa đồng thời → 1 job + 1 target phụ (không 2 job).
- **SC-2.7** Cache-serve: khóa đã completed hợp lệ, lệnh mới (không fresh) → trả từ DB, 0 token, chú thích "kết quả cũ".
- **SC-2.8** Job gần nhất `failed` → lệnh mới chạy review mới (không serve lỗi cũ).
- **SC-2.9** `fresh` trên khóa đã completed → job mới, đánh dấu supersedes; cache lần sau trả bản mới.
- **SC-2.10** Commit mới sau completed → lệnh mới (không fresh) vẫn chạy review mới (khóa khác).
- **SC-2.11** PR "hot": vượt cap 50 target → subscriber thứ 51 nhận ack "sẽ trả ở thread gốc", không phình job.
- **SC-2.12** Redaction: review chứa `sk-ant-...`/`password=...` → file `.md` đã che trước khi upload.
- **SC-2.13** Mention injection: snippet PR chứa `<!channel>` → fallback chat vô hiệu mention (không ping toàn kênh).
- **SC-2.14** Bypass: user bị `authorizeReviewCommand` chặn thử subscribe/cache-serve/`fresh` → đều bị chặn.

# Test Cases

| ID | Tiền điều kiện | Bước | Dữ liệu | Kết quả mong đợi | Kỹ thuật |
|----|----------------|------|---------|------------------|----------|
| TC-201 | Project LMS active, PR có ≥1 finding | Gõ lệnh, chờ kết quả | `@tieu-nhi LMS review .../pullrequest/123` | Upload **1 file** `review-LMS-PR123-<commit8>.md` (đủ nội dung) + **1 dòng tóm tắt** (vd "2 CRITICAL, 5 HIGH…" + link PR + commit) vào thread | Use Case |
| TC-202 | Như trên, Slack upload trả lỗi (deprecated/scope/5xx) | Ép upload fail | mock `completeUploadExternal` lỗi | **Fallback**: post nhiều message mrkdwn (<~3000 ký tự) trong thread; có chú thích "⚠️ gửi dạng chat" | Error Guessing |
| TC-203 | Upload fail + postMessage cũng fail | Ép cả 2 fail | mock cả 2 lỗi | Target → `delivery_failed`; log+alert; **không** react ✅/không báo hoàn tất sai | Negative |
| TC-204 | Job đang `running`, đã có target#1 | Gõ lệnh trùng khóa từ thread#2, thread#3 | cùng `(LMS,123,c8)` | thread#2/#3 nhận **ack chờ**; khi xong cả 3 thread đều có file `.md` | Use Case |
| TC-205 | Job có 3 target; đã `delivered` #1 | Worker crash → lease hết → reclaim | — | Reclaim chỉ giao #2,#3 (status pending); **#1 KHÔNG bị post lại** | State Transition |
| TC-206 | Chưa có job cho khóa | 2 lệnh cùng khóa **đồng thời** | 2 request song song | Đúng **1** `ReviewJobQueued` + **1** target phụ; KHÔNG 2 job | Concurrency |
| TC-207 | Khóa đã có job `completed` hợp lệ | Gõ lệnh (không `fresh`) | `@tieu-nhi LMS review .../123` | **Cache-serve**: trả file từ History; **0 token Claude**; chú thích commit+`completedAt`+gợi ý `fresh` | Decision Table |
| TC-208 | Job gần nhất của khóa = `failed` (mọi skill fail) | Gõ lệnh (không fresh) | — | **Không** serve lỗi cũ; **chạy review mới** | Decision Table |
| TC-209 | Khóa có 2 bản completed (B supersedes A) | Cache-serve | — | Trả **bản B** (mới nhất, chưa superseded), không trả A | Decision Table |
| TC-210 | Khóa đã completed | Gõ lệnh kèm `fresh` | `...review .../123 fresh` | Bỏ qua cache → job mới; job cũ gắn `supersededByJobId`; job mới `supersedesJobId=cũ` | Use Case |
| TC-211 | Job cùng khóa đang `running` | Gõ `fresh` | `...123 fresh` | KHÔNG tạo job thứ 2; register target + ack "đang chạy bản mới" | Concurrency |
| TC-212 | Khóa đã completed @commit c8 | PR có commit mới c9; gõ lệnh thường | `...review .../123` | Resolve commit c9 → khóa mới `(LMS,123,c9)` → **review mới** (không trúng cache c8) | EP |
| TC-213 | Job đang chạy, đã 50 target | Subscriber thứ 51 gõ trùng | — | Ack "đã đủ người theo dõi, kết quả ở thread gốc"; job KHÔNG thêm target | BVA |
| TC-214 | Cùng channel+thread đã là target | Gõ trùng lần nữa lúc đang chạy | cùng (channel,thread) | KHÔNG thêm target trùng; chỉ ack lại | EP |
| TC-215 | Review content chứa secret-pattern | Build report | `aws_key=AKIA...`, `sk-ant-...` | File `.md` upload đã **redact** các giá trị secret (che/masked) | Security |
| TC-216 | Snippet PR chứa mention | Fallback chunk chat | `<!channel>`, `@here`, `<http://evil\|x>` | Mention bị **vô hiệu** (không ping); link không auto-render từ nội dung PR | Security |
| TC-217 | Bot bị kick khỏi channel target#2 | Fan-out 3 target | — | #1,#3 giao OK; #2 → `failed` (bỏ qua), không chặn còn lại | Integration |
| TC-218 | Slack gửi lại event (retry 3s) | 2 webhook giống nhau | cùng event id | Idempotent theo `(key,channel,thread)` → **1** target, không trùng | Concurrency |
| TC-219 | File `.md` vượt giới hạn kích thước Slack | Upload | file rất lớn | Chia file / fallback chat; KHÔNG fail câm | BVA |
| TC-220 | Cache-serve | Đọc kết quả | khóa resolve hợp lệ | Đọc **theo khóa resolve**, KHÔNG theo jobId tự do từ input (chống BOLA) | Security |

# Boundary Values

| Trường | Min-1 | Min | Max | Max+1 | Kết quả mong đợi |
|--------|-------|-----|-----|-------|------------------|
| Số delivery target/job | — | 1 | 50 | 51 | ≤50 nhận trực tiếp; 51 → ack "ở thread gốc", không phình |
| Kích thước file `.md` | — | >0 | ≤ giới hạn Slack | > giới hạn | trong hạn upload; vượt → chia/fallback |
| Độ dài 1 message fallback | — | 1 | ~3000 ký tự | >3000 | >3000 → tách message mới (không cắt giữa câu) |
| Số bản completed/khóa (rerun) | — | 1 | n | — | luôn trả bản mới nhất chưa superseded |
| commit8 (prefix hash) | — | 8 ký tự | 8 ký tự | — | tên file dùng đúng 8 ký tự đầu |
| Lease timeout (reclaim giữa fan-out) | trong hạn | tại hạn | — | quá hạn | quá hạn → reclaim, giao tiếp target pending |

# Equivalence Partitions

| Trường | Phân vùng hợp lệ | Phân vùng không hợp lệ |
|--------|------------------|------------------------|
| Trạng thái khóa khi nhận lệnh | chưa-có / đang-chạy / completed-hợp-lệ | (định tuyến: queue / register / cache-serve) |
| Job để cache-serve | `completed` & ≥1 finding & không lỗi-toàn-phần | `failed` / lỗi-toàn-phần / `superseded` (→ không serve) |
| Cờ rerun | `fresh` ‖ `rerun` (cuối lệnh) | thiếu cờ (dùng cache) / cờ giữa lệnh (parse cẩn thận) |
| Kết quả upload file | `completeUploadExternal` OK | lỗi getURL/PUT/complete (→ fallback) |
| Delivery target | từ Slack event đã verify | từ payload tự do (từ chối — không cho chỉ định channel tuỳ ý) |
| Nội dung report | sạch | chứa secret-pattern (→ redact) / chứa mention (→ neutralize ở fallback) |

# Decision Table

Định tuyến lệnh review theo trạng thái khóa + cờ `fresh`:

| Rule | Có job đang chạy? | Có completed hợp lệ? | Cờ `fresh`? | Hành động |
|------|-------------------|----------------------|-------------|-----------|
| R1 | N | N | N | Enqueue job mới (target = nơi gõ) |
| R2 | Y | - | N | **Register** target vào job đang chạy + ack chờ |
| R3 | N | Y | N | **Cache-serve** từ History (0 token) |
| R4 | N | Y | Y | Enqueue job mới `supersedes` bản cũ |
| R5 | Y | - | Y | **Register** (không nhân đôi job) + ack |
| R6 | N | chỉ có `failed`/lỗi-toàn-phần | N | Enqueue job mới (không serve lỗi cũ) |

# State Transition Matrix

Vòng đời **delivery target**:

| State hiện tại | Event | State kế tiếp | Hợp lệ? |
|----------------|-------|---------------|---------|
| (none) | subscribe (lệnh trùng / lệnh đầu) | `pending` | ✅ |
| `pending` | upload file OK | `delivered(file)` | ✅ |
| `pending` | upload fail → chat OK | `delivered(chat)` | ✅ |
| `pending` | upload fail + chat fail | `failed` | ✅ |
| `pending` | cache-serve OK | `delivered(cache)` | ✅ |
| `delivered(*)` | reclaim/retry fan-out | `delivered(*)` (giữ nguyên) | ✅ (idempotent — KHÔNG giao lại) |
| `delivered`/`failed` | sự kiện giao lại | (no-op) | ❌ không chuyển ngược |

Vòng đời **job supersede**:

| State | Event | Kế tiếp | Hợp lệ? |
|-------|-------|---------|---------|
| `completed` (hiện hành) | `fresh`/rerun tạo job mới | `superseded` (gắn `supersededByJobId`) | ✅ |
| `superseded` | cache-serve | (bỏ qua, không trả) | ✅ |
| `running` | `fresh` | giữ `running` (register, không nhân đôi) | ✅ |

# Permission Matrix

| Actor | Review (tạo job) | Subscribe (fan-out) | Cache-serve | Fresh/Rerun | Xem deliveries (Admin UI) |
|-------|------------------|---------------------|-------------|-------------|---------------------------|
| User workspace (đã qua `authorizeReviewCommand`) | ✅ | ✅ | ✅ | ✅ (tính rate-limit) | ❌ |
| User bị `authorizeReviewCommand` chặn | ❌ | ❌ (chống bypass) | ❌ | ❌ | ❌ |
| Owner project (Admin UI) | — | — | — | — | ✅ (chỉ project của mình) |
| Owner khác (Admin UI) | — | — | — | — | ❌ 404 |

# Negative Test Cases

- `[HIGH]` Cờ `fresh` viết sai/biến thể (`--fresh`, `FRESH`, `fresh` ở giữa) → parse không nhầm thành phần link; chỉ nhận cờ hợp lệ ở cuối, còn lại hướng dẫn.
- `[HIGH]` Lệnh trùng khi job vừa chuyển `running→completed` (đua trạng thái) → không "rơi": hoặc register kịp, hoặc đi cache-serve; không mất kết quả.
- `[MEDIUM]` File `.md` rỗng (PR 0 finding/0 file) → không upload file rỗng; báo "không có gì để review".
- `[MEDIUM]` Nội dung review chứa ` ``` ` lồng nhau / ký tự mrkdwn → chunk fallback không vỡ định dạng, không cắt giữa code block.
- `[MEDIUM]` Tên project chứa ký tự đặc biệt/khoảng trắng → filename `.md` được sanitize (không path traversal `../`).
- `[LOW]` Unicode/emoji trong finding → file `.md` UTF-8 đúng; tóm tắt mrkdwn không vỡ.

# Edge Cases

- `[HIGH]` Reclaim xảy ra **đúng lúc** đang upload target#2 (đã PUT bytes, chưa `complete`) → không mark delivered; reclaim giao lại #2 an toàn (không double trên Slack hoặc chấp nhận 1 file thừa nhưng không mark sai).
- `[HIGH]` Subscriber đăng ký **sau khi** worker bắt đầu vòng fan-out → target mới được giao ở vòng quét tiếp / hoặc cache-serve khi job đã completed (không bị bỏ sót).
- `[MEDIUM]` 50 target cùng lúc + Slack 429 rate-limit → tôn trọng `Retry-After`, giao tuần tự, không bỏ target.
- `[MEDIUM]` `fresh` liên tiếp nhiều lần → mỗi lần supersedes bản trước; rate-limit chặn đốt token; cache luôn trả bản hiện hành.
- `[MEDIUM]` Commit hash chỉ có <8 ký tự (rất hiếm) → filename xử lý không cắt lỗi.
- `[LOW]` DM (không thread) làm target → giao vào DM đúng, không cần thread_ts.

# API Test Cases

- `[HIGH]` Slack `files.getUploadURLExternal` → PUT → `completeUploadExternal`: chỉ coi thành công khi bước cuối 200 OK; lỗi giữa chừng → idempotent retry/fallback, không mark delivered sai.
- `[MEDIUM]` Admin `GET /api/v1/.../reviews`: response chứa `deliveries[]` (mode/status/time) + `supersededByJobId`; **không** serialize secret/PII userId thừa; phân trang giữ nguyên.
- `[MEDIUM]` Admin xem review của project người khác → **404** (owner-scoped, kế thừa i-001).
- `[MEDIUM]` Idempotency Slack-retry: cùng event id/`(key,channel,thread)` gọi 2 lần → 1 target.

# Security Test Cases

- `[CRITICAL]` **Subscribe/cache-serve/`fresh` bypass**: user bị `authorizeReviewCommand` chặn thử cả 3 entrypoint → đều **bị chặn** (không hứng được kết quả).
- `[HIGH]` **BOLA cache-serve**: cố ép trả job của project khác bằng id tự do → chỉ trả theo **khóa resolve**; không truy cập jobId tuỳ ý.
- `[HIGH]` **Spoof delivery target**: payload cố chỉ định channel khác channel gõ lệnh → bỏ qua, target lấy từ event đã verify signing secret.
- `[HIGH]` **Redaction**: secret-pattern (`sk-ant-`, `AKIA`, `password=`, `.env` value) trong report → bị che trước upload; không lọt vào file/Slack.
- `[MEDIUM]` **Mention injection**: `<!channel>`/`@here`/`@user` từ snippet PR trong fallback chat → vô hiệu, không ping/nhiễu.
- `[MEDIUM]` **DoS `fresh`**: spam `fresh` → rate-limit chặn; alert spike; cap deliveryTargets chặn phình.
- `[MEDIUM]` Audit delivery/cache-hit/rerun ghi đủ (correlationId+targetId), không log nội dung/secret.

# Concurrency Test Cases

- `[CRITICAL]` **Atomic upsert race**: N lệnh cùng khóa đồng thời → đúng 1 job, N-1 target; không tạo trùng job (findOneAndUpdate atomic).
- `[HIGH]` **Idempotent fan-out khi reclaim**: 2 worker hoặc reclaim → mỗi target giao đúng 1 lần (cập nhật status atomic, arrayFilters status=pending).
- `[HIGH]` **Đăng ký muộn vs fan-out**: target subscribe khi worker đang giao → không bị mất (vòng quét sau / cache-serve).
- `[MEDIUM]` **fresh-khi-đang-chạy**: 2 lệnh fresh đồng thời lúc running → không nhân đôi job; cùng register.

# Integration Test Cases

- `[HIGH]` Slack upload API lỗi/timeout/deprecated → fallback chat (retry idempotent theo target).
- `[HIGH]` Slack postMessage (fallback) lỗi → `delivery_failed` + alert.
- `[MEDIUM]` Slack 429 khi fan-out nhiều target/part → tôn trọng `Retry-After`.
- `[MEDIUM]` MongoDB lỗi khi set status target → không double/không sót (retryWrites; status nguồn sự thật).
- `[MEDIUM]` Bot bị kick khỏi channel → target failed, không chặn target khác.

# Regression Risks

| Hạng mục bị ảnh hưởng | Lý do | Regression Risk |
|-----------------------|-------|-----------------|
| Dedup/idempotency i-001 (ADR-007 reject "đang chạy") | i-002 đổi reject→subscribe; TC-16 i-001 (double-submit "đang chạy") **phải cập nhật** | `[HIGH]` |
| Output Slack i-001 (tóm tắt + đính kèm khi dài) | i-002 đổi → luôn file `.md`; test output i-001 đổi kỳ vọng | `[HIGH]` |
| ReviewJob schema | thêm `deliveryTargets[]`/supersede → migration/đọc cũ | `[HIGH]` |
| Slack Gateway parse | thêm cờ `fresh` → không phá parse lệnh cũ | `[MEDIUM]` |
| `supersedes` (i-001 khai báo suông) | nay ghi thực → đảm bảo không phá history cũ | `[MEDIUM]` |
| Worker fan-out loop | thay post đơn → vòng nhiều target | `[HIGH]` |
| Slack scope | thêm `files:write` → cấu hình app | `[MEDIUM]` |

# Missing Test Coverage

- `[MEDIUM]` Hiệu năng fan-out với cap-max (50 target) thực tế (thời gian giao, rate-limit) — cần load test riêng (ngoài test mô tả-bằng-lời).
- `[MEDIUM]` Độ chính xác **redaction**: bộ pattern secret đủ phủ (false negative = lọt secret) — cần bộ dữ liệu mẫu secret để đánh giá.
- `[LOW]` Hành vi DM vs channel vs private channel cho target (locator/quyền bot khác nhau).
- `[LOW]` Tương tác với retention i-001 khi nhiều bản supersede (dọn bản cũ có ảnh hưởng cache?).

# Dự Đoán Bug Tiềm Ẩn

- `[CRITICAL]` (Concurrency) Upsert enqueue-or-subscribe **không atomic** → 2 job cùng khóa chạy song song, double token + 2 file. *(TC-206)*
- `[CRITICAL]` (Security) Quên gắn `authorizeReviewCommand` ở **subscribe/cache-serve** → bypass quyền. *(Security TC)*
- `[HIGH]` (Concurrency) Mark `delivered` **trước** khi `completeUploadExternal` OK → reclaim tưởng đã giao, target mất kết quả (lost delivery). *(TC-205, Edge)*
- `[HIGH]` (Data) Cache-serve trả nhầm bản `superseded`/`failed` do thiếu cờ lọc → kết quả sai/cũ. *(TC-208/209)*
- `[HIGH]` (Security) Redaction sót pattern → secret rời lên Slack vĩnh viễn. *(TC-215)*
- `[HIGH]` (Integration) Lỗi giữa 2 bước upload không fallback → target treo, user chờ mãi. *(TC-202)*
- `[MEDIUM]` (Data) `deliveryTargets[]` không dedup → phình + post trùng cùng thread. *(TC-214)*
- `[MEDIUM]` (Validation) Parse `fresh` nuốt nhầm phần link / không nhận → hành vi sai. *(Negative)*
- `[MEDIUM]` (Security) Mention không neutralize trong fallback → ping toàn workspace. *(TC-216)*
- `[MEDIUM]` (Workflow) Subscriber đăng ký muộn bị bỏ sót khi job vừa completed. *(Edge)*

# Khuyến Nghị Kiểm Thử

- `[Ưu tiên 1 — Risk-Based]` Concurrency: atomic upsert (TC-206) + idempotent fan-out khi reclaim (TC-205) — must-pass trước release (CRITICAL/HIGH, dễ sai khi tự viết).
- `[Ưu tiên 2 — Security]` Bypass authorize ở subscribe/cache-serve/`fresh` (CRITICAL) + BOLA cache + redaction secret + neutralize mention.
- `[Ưu tiên 3 — Decision]` Định tuyến R1–R6 (Decision Table) + cache "hợp lệ" (TC-207/208/209/210/212) phủ đủ nhánh.
- `[Ưu tiên 4 — Integration]` Fallback file→chat→fail (TC-202/203) + 429/kick (TC-217).
- `[Lỗ hổng spec — không chặn]` Bộ pattern redaction cụ thể (để đo false-negative) và giới hạn kích thước file Slack chính xác nên chốt ở `/tn-code` (giá trị cấu hình) — đã có hướng xử lý, không chặn thiết kế test.
- **Cập nhật regression i-001**: TC-16 (double-submit "đang chạy") đổi kỳ vọng thành subscribe; test output i-001 đổi thành file `.md`.

# E2E Locators

> i-002 chủ yếu là hành vi Slack/worker (backend) — Slack không dùng `data-testid`. E2E UI áp dụng cho **Admin UI: màn hình lịch sử review** nay hiển thị **deliveries + trạng thái superseded** (thay đổi UI do i-002). Ưu tiên `data-testid` ổn định.

| Element / Mục đích | data-testid đề xuất | Màn hình / Ngữ cảnh | Ghi chú |
|--------------------|---------------------|---------------------|---------|
| Bảng lịch sử review của project | `review-history-table` | Admin UI > Project > Reviews | owner-scoped |
| Dòng 1 review (job) | `review-row-{jobId}` | bảng lịch sử | chứa commit8 + status |
| Badge "đã giao" theo target | `delivery-status-{jobId}` | dòng review | hiển thị delivered/failed + mode (file/chat/cache) |
| Danh sách delivery targets | `delivery-targets-list-{jobId}` | chi tiết review | channel/thread/time; KHÔNG lộ userId thừa |
| Badge "superseded" | `superseded-badge-{jobId}` | dòng review | bản cũ bị `fresh` thay |
| Link tới bản mới (supersededBy) | `superseded-by-link-{jobId}` | chi tiết review | điều hướng bản hiện hành |
| Chỉ báo cache-hit (tiết kiệm token) | `cache-hit-indicator-{jobId}` | chi tiết review | phân biệt run mới vs cache-serve |
| Filter theo trạng thái giao | `filter-delivery-status` | toolbar lịch sử | delivered/failed |
| Nút xem nội dung report (.md) | `view-report-btn-{jobId}` | chi tiết review | mở nội dung dựng từ History |

---

# Phân Tầng Test Case (Test Pyramid)
> Nguồn: `i-002/test.md` (delta). Đặt mỗi assertion ở tầng rẻ nhất kiểm được nó. ID `UT-2xx/FT-2xx/E2E-2xx` để không đụng i-001. Append cùng stage `test`.

# Tổng Quan Kim Tự Tháp
| Tầng | Số case | Tỉ lệ | Ghi chú hình dạng |
|------|---------|-------|-------------------|
| Unit | 18 | 41% | (đáy) build filename/report/summary, redaction, neutralize mention, chunk, parse fresh, cache-eligible, route R1–R6, dedup/cap target, status transition |
| Functional | 19 | 43% | (giữa) atomic upsert/register/fan-out/reclaim, cache-serve vs failed/superseded, fresh/supersedes, fallback file→chat→fail, authorize bypass, BOLA, audit |
| E2E | 7 | 16% | (đỉnh) UI Admin (deliveries/superseded/cache-hit) + luồng Slack đầu-cuối (mô phỏng event): fan-out, cache-serve, fallback+reclaim |

> **Nhận xét hình dạng:** delta i-002 **thiên về tích hợp/đồng thời** (atomic upsert, fan-out, reclaim, cache-serve qua DB) nên tầng **Functional nhỉnh hơn Unit một chút** — đây là bản chất của delta (không thể unit-test cô lập race/giao nhiều target). E2E vẫn nhỏ nhất (16%), **không** ice-cream cone. Gộp với pyramid i-001 (Unit 54%/Func 34%/E2E 12%) thì tổng thể vẫn khỏe mạnh.

# 1. Unit Test Cases
> Logic thuần, không I/O.

| ID | Hàm/Đơn vị (SUT) | Input | Expected output | Kỹ thuật | Map test.md |
|----|------------------|-------|-----------------|----------|-------------|
| UT-201 | `buildReportFilename` | project=`LMS`, prId=123, commit=`abc12345...` | `review-LMS-PR123-abc12345.md` (commit8) | EP | TC-201 |
| UT-202 | `sanitizeFilename` chống path traversal | project=`../../etc`, ` a/b ` | tên file an toàn (không `../`, không `/`) | Error Guessing | Negative (filename) |
| UT-203 | `buildMarkdownReport` từ `Finding[]` | findings mẫu cố định + metadata commit/skillVersion | nội dung `.md` đủ section (tóm tắt→theo severity→theo file/skill→metadata) | Error Guessing | TC-201 |
| UT-204 | `buildSummaryLine` (mrkdwn) | counts {C:2,H:5,M:3}, prUrl, commit | `*2 CRITICAL, 5 HIGH, 3 MEDIUM* …` + link + commit; không `#`/`**` | Error Guessing | TC-201 |
| UT-205 | `redactSecrets` | `sk-ant-api03-xxx`, `AKIA...`, `password=123`, `.env` value | các giá trị secret bị che (masked), giữ ngữ cảnh | Error Guessing | TC-215 |
| UT-206 | `neutralizeMentions` | `<!channel>`, `<!here>`, `@U123`, `<http://evil\|x>` | mention vô hiệu (không ping); link không auto-render | Error Guessing | TC-216 |
| UT-207 | `chunkMrkdwn` | text dài, có code block ` ``` ` | tách ≤~3000 ký tự, không cắt giữa câu/code block, cap số message | BVA | TC-202, Boundary (msg) |
| UT-208 | `parseFreshFlag` | `…/123 fresh`, `…/123`, `--fresh`, `FRESH`, `fresh` giữa link | nhận `fresh|rerun` ở cuối; biến thể/giữa link → không nhầm | EP | TC-210, Negative (flag) |
| UT-209 | `buildIdempotencyKey` commit-aware | (LMS,123,c8) vs (LMS,123,c9) | khóa khác nhau theo commit | EP | TC-212, ADR-016 |
| UT-210 | `isCacheEligible(job)` | completed+≥1 finding; failed; lỗi-toàn-phần; superseded | true cho case 1; false cho 3 case còn lại | Decision Table | TC-207, TC-208, TC-209 |
| UT-211 | `selectLatestNonSuperseded(jobs)` | A(completed,superseded), B(completed,null) | trả B | Decision Table | TC-209 |
| UT-212 | `routeCommand` (R1–R6) | tổ hợp {running?, completed-hợp-lệ?, fresh?} | đúng action: enqueue/register/cache-serve/supersede | Decision Table | Decision Table R1–R6 |
| UT-213 | `dedupTarget` | targets có (chA,th1); thêm (chA,th1) | không thêm trùng | EP | TC-214 |
| UT-214 | `withinTargetCap` | size 49,50,51 | 49/50→cho thêm; 51→chặn (ack thread gốc) | BVA | TC-213, Boundary (target) |
| UT-215 | `targetStatusTransition` | pending→delivered; delivered→giao lại | pending chuyển hợp lệ; delivered→no-op (idempotent) | State Transition | TC-205, State Transition |
| UT-216 | `pickDeliveryMode` theo kết quả upload | upload OK; upload fail+chat OK; cả 2 fail | delivered(file); delivered(chat); failed | Decision Table | TC-202, TC-203 |
| UT-217 | `buildStaleNote` (cache-serve) | completedAt, commit | chú thích "kết quả cũ lúc … commit …" + gợi ý `fresh` | Error Guessing | TC-207 |
| UT-218 | `isFileWithinSlackLimit` | size dưới/tại/trên giới hạn | trên giới hạn → cờ cần chia/fallback | BVA | TC-219, Boundary (file size) |

# 2. Functional Test Cases
> Qua handler/service; DB in-memory; Slack/Azure/Claude mock. Không lặp assertion đã phủ ở Unit.

| ID | Tính năng / Endpoint | Tiền điều kiện | Bước | Dữ liệu vào | Kết quả mong đợi | Mock/Stub | Kỹ thuật | Map test.md |
|----|----------------------|----------------|------|-------------|------------------|-----------|----------|-------------|
| FT-201 | EnqueueOrSubscribe atomic upsert | Chưa có job khóa K | 2 request cùng K **đồng thời** | cùng `(LMS,123,c8)` | Đúng **1** job Queued + **1** target phụ; không 2 job | DB-queue in-mem | Concurrency | TC-206 |
| FT-202 | Register target khi running | Job K đang `running` | Gõ trùng từ thread#2 | cùng K | Thread#2 nhận **ack chờ**; target#2 thêm vào job | DB in-mem, mock Slack | Use Case | TC-204 |
| FT-203 | Fan-out giao mọi target (file) | Job K có 3 target pending | Job completed → fan-out | — | Cả 3 nhận upload file `.md` + tóm tắt | mock Slack files | Use Case | TC-204, TC-201 |
| FT-204 | Reclaim giữa fan-out idempotent | Job 3 target, #1 delivered | Worker crash → reclaim | — | Chỉ #2,#3 được giao; #1 **không** post lại | DB-queue, mock Slack | Concurrency | TC-205 |
| FT-205 | Cache-serve completed hợp lệ (0 token) | Job K completed, ≥1 finding | Gõ lệnh (không fresh) | K | Trả file từ History; **Claude runner KHÔNG được gọi** (0 token) | DB in-mem, spy Claude | Decision Table | TC-207 |
| FT-206 | Cache-serve loại job failed | Job gần nhất K = failed | Gõ lệnh | K | Không serve lỗi; enqueue job mới | DB in-mem | Decision Table | TC-208 |
| FT-207 | Cache-serve bản mới nhất chưa superseded | 2 bản completed (B supersedes A) | Cache-serve | K | Trả B, không A | DB in-mem | Decision Table | TC-209 |
| FT-208 | `fresh` trên completed → supersedes | Job A completed | Gõ `fresh` | `…/123 fresh` | Job B mới; A.`supersededByJobId=B`; B.`supersedesJobId=A` | DB in-mem | Use Case | TC-210 |
| FT-209 | `fresh` lúc đang chạy | Job K running | Gõ `fresh` | — | Không tạo job 2; register target + ack | DB in-mem | Concurrency | TC-211 |
| FT-210 | Commit-aware enqueue | K@c8 completed; PR có c9 | Gõ lệnh thường | resolve c9 | Khóa (LMS,123,c9) → **review mới**, không cache c8 | stub Azure, DB | EP | TC-212 |
| FT-211 | Fallback file→chat | Job completed | Upload file lỗi | mock complete lỗi | Post chunked mrkdwn trong thread + chú thích "gửi dạng chat" | mock Slack (upload fail) | Error Guessing | TC-202 |
| FT-212 | Cả file+chat fail → delivery_failed | Job completed | Ép upload+post fail | mock cả 2 lỗi | Target `delivery_failed`; alert; **không** react ✅/báo hoàn tất | mock Slack | Negative | TC-203 |
| FT-213 | Bot bị kick channel target | Job 3 target | Channel#2 bị kick | mock Slack 403 channel#2 | #1,#3 OK; #2 failed; không chặn còn lại | mock Slack | Integration | TC-217 |
| FT-214 | Slack retry event idempotent | Job K | 2 webhook giống nhau | cùng event id | 1 target (idempotent theo key,channel,thread) | mock Slack | Concurrency | TC-218 |
| FT-215 | File vượt giới hạn Slack | Job completed | Upload file lớn | file > giới hạn | Chia file/fallback chat; không fail câm | mock Slack | BVA | TC-219 |
| FT-216 | Authorize mọi entrypoint (chống bypass) | User bị `authorizeReviewCommand` chặn | Thử review/subscribe/cache-serve/`fresh` | user bị chặn | Cả 4 đều bị chặn; không hứng kết quả | mock authz | Security | Permission Matrix, Security TC |
| FT-217 | BOLA cache-serve theo khóa | History có job project khác | Cố ép trả qua id/khóa lạ | input độc | Chỉ trả theo **khóa resolve**; không truy cập jobId tự do | DB in-mem | Security | TC-220 |
| FT-218 | Rate-limit gồm `fresh` | User gửi nhiều `fresh` | Spam fresh trong 10' | 6 fresh | Vượt ngưỡng bị chặn; alert spike | mock Slack | BVA | Security (DoS) |
| FT-219 | Admin `/reviews` có deliveries | Owner có review | GET `/projects/:id/reviews` | — | Trả `deliveries[]`+`supersededByJobId`; owner-scoped; không PII/secret thừa | DB in-mem | Security | API TC |
| FT-220 | Audit delivery/cache-hit/rerun | Các hành động giao/cache/fresh | Quan sát audit | — | Ghi đủ (correlationId+targetId+mode), không log nội dung/secret | DB in-mem | Use Case | Audit |

# 3. E2E Test Cases
> Luồng đầu-cuối: UI Admin (`data-testid`) hoặc mô phỏng event Slack (không-DOM). KHÔNG sinh code automation.

| ID | Luồng | Tiền điều kiện | Bước (qua UI/event) | Dữ liệu vào | Kết quả mong đợi | data-testid dùng | Kỹ thuật | Map test.md |
|----|-------|----------------|---------------------|-------------|------------------|------------------|----------|-------------|
| E2E-201 | Fan-out đầu-cuối (không-DOM) | Project LMS active, PR hợp lệ | Mô phỏng lệnh review + 2 lệnh trùng từ thread#2,#3 lúc đang chạy → chờ xong | cùng `(LMS,123,c8)` | Cả 3 thread nhận **file `.md`** + tóm tắt; không chạy 2 job | (không-DOM) | Use Case + Concurrency | TC-204, SC-2.4 |
| E2E-202 | Cache-serve đầu-cuối (không-DOM) | Khóa đã completed hợp lệ | Mô phỏng lệnh mới (không fresh) | K | Trả file từ DB; **0 token**; chú thích "kết quả cũ" + gợi ý fresh | (không-DOM) | Decision Table | TC-207, SC-2.7 |
| E2E-203 | Fallback + reclaim (không-DOM) | Job 3 target; upload fail | Mô phỏng upload fail (→chat) rồi worker crash giữa fan-out → reclaim | — | Target nhận chat fallback; reclaim không post trùng target đã giao | (không-DOM) | Risk-Based | TC-202, TC-205 |
| E2E-204 | Admin UI — trạng thái giao | Owner login, project có review | Mở Detail review → xem badge giao theo target | — | Hiển thị delivered/failed + mode (file/chat/cache) | `review-history-table`, `delivery-status-{jobId}`, `delivery-targets-list-{jobId}` | Use Case | E2E Locators |
| E2E-205 | Admin UI — superseded | Có job bị `fresh` thay | Mở Detail → xem badge superseded + link bản mới | — | Badge superseded; link điều hướng bản hiện hành | `superseded-badge-{jobId}`, `superseded-by-link-{jobId}` | State Transition | TC-210 |
| E2E-206 | Admin UI — cache-hit + report | Có review cache-serve | Mở Detail → thấy chỉ báo cache-hit + nút xem report | — | Chỉ báo cache-hit; mở nội dung `.md` dựng từ History | `cache-hit-indicator-{jobId}`, `view-report-btn-{jobId}` | Use Case | TC-207 |
| E2E-207 | Admin UI — filter trạng thái giao | Nhiều review delivered/failed | Lọc theo trạng thái giao | filter=failed | Chỉ hiển thị review có target failed | `filter-delivery-status`, `review-history-row-{jobId}` | EP | E2E Locators |

# Ma Trận Truy Vết (Traceability)
> Mỗi yêu cầu i-002 (FRD/tech/security) có ≥1 tầng phủ.

| Yêu cầu / Business Rule (i-002) | Unit | Functional | E2E | Ghi chú |
|---------------------------------|------|------------|-----|---------|
| Output file `.md` + tóm tắt inline (ADR-012) | UT-201/203/204 | FT-203 | E2E-201/204 | tên file, nội dung, tóm tắt mrkdwn |
| Fallback file→chat (ADR-012) | UT-207/216 | FT-211 | E2E-203 | chunk không vỡ định dạng |
| Cả file+chat fail → không nuốt lặng | UT-216 | FT-212 | E2E-203 | delivery_failed + alert |
| Fan-out tới mọi target (ADR-013) | UT-215 | FT-202/203 | E2E-201 | register + giao tất cả |
| Idempotent per-target khi reclaim (ADR-013) | UT-215 | FT-204 | E2E-203 | không double-delivery |
| Atomic upsert enqueue-or-subscribe (ADR-013) | UT-212 | FT-201 | E2E-201 | chống race 2 job |
| Cache-serve completed hợp lệ, 0 token (ADR-014) | UT-210/211/217 | FT-205/206/207 | E2E-202/206 | loại failed/superseded |
| `fresh`/`rerun` + supersedes (ADR-014) | UT-208 | FT-208/209 | E2E-205 | không nhân đôi khi running |
| Khóa commit-aware (ADR-016) | UT-209 | FT-210 | — | commit mới → review mới |
| Cap deliveryTargets + dedup | UT-213/214 | FT-201 (target phụ) | — | chống phình/post trùng |
| Redaction secret trước upload | UT-205 | FT-219 (không PII thừa) | — | che secret-pattern |
| Vô hiệu mention trong fallback | UT-206 | FT-211 | E2E-203 | chống ping toàn kênh |
| Authorize mọi entrypoint (chống bypass) | — | FT-216 | — | review/subscribe/cache/fresh |
| BOLA cache theo khóa resolve | — | FT-217 | — | không jobId tự do |
| Rate-limit gồm `fresh` (DoS/cost) | UT-214 (cap) | FT-218 | — | spam fresh bị chặn |
| Audit delivery/cache-hit/rerun | — | FT-220 | E2E-204/206 | không log nội dung/secret |
| Slack retry idempotent target | UT-213 | FT-214 | — | 1 target |
| Bot kick / 1 target lỗi | — | FT-213 | — | không chặn target khác |

# Khoảng Trống & Khuyến Nghị Đặt Tầng
- `[MEDIUM]` **Độ chính xác redaction** (false-negative = lọt secret) chỉ phủ logic ở UT-205 — cần **bộ dữ liệu mẫu secret** đánh giá độ phủ pattern; chốt bộ pattern ở `/tn-code`, bổ sung Unit data-driven khi có.
- `[MEDIUM]` **Hiệu năng fan-out ở cap-max** (50 target, Slack 429/Retry-After) là phi-chức-năng → cần **load/timing test** riêng, không phủ bằng test mô-tả-bằng-lời.
- `[MEDIUM]` **Giới hạn kích thước file Slack chính xác** (UT-218/FT-215) phụ thuộc giá trị cấu hình thực tế — chốt số ở `/tn-code` rồi cố định boundary.
- `[LOW]` Hành vi **DM vs channel vs private channel** cho target chỉ phủ gián tiếp; cân nhắc 1 Functional bổ sung khi hiện thực.
- `[LOW]` Tương tác **retention i-001 ↔ supersede i-002** (dọn bản cũ có ảnh hưởng cache?) chưa có case riêng — theo dõi ở report.
- **Không có khoảng trống CRITICAL**: mọi yêu cầu i-002 (gồm bảo mật: authorize/BOLA/redaction/mention) đều có ≥1 tầng phủ ⇒ giữ `open_questions = 0`.
