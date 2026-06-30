---
integration: i-002
feature: review-pr-slack-azure
stage: tech
status: approved
open_questions: 0
updated: 2026-06-30
---

# Tóm Tắt Kiến Trúc

Delta kiến trúc cho **cách giao kết quả review** trên nền Modular Monolith Node/TS + MongoDB DB-queue (i-001). Ba thay đổi:

1. **Output luôn file `.md`** (toàn bộ review, Markdown chuẩn) **+ 1 dòng tóm tắt inline** (mrkdwn); upload qua luồng Slack mới `files.getUploadURLExternal` + `files.completeUploadExternal`; **fallback chia nhỏ chat** (mrkdwn, <~3000 ký tự) khi upload lỗi.
2. **Fan-out** qua `deliveryTargets[]` trên `ReviewJob`: lệnh trùng khóa `(projectId, prId, commitHash)` lúc job `queued|running` → **đăng ký target** (không reject) + ack chờ; worker khi xong giao kết quả tới **mọi target** với **trạng thái giao per-target** (idempotent khi reclaim).
3. **Cache-serve** (CQRS read-path): khóa đã có job `completed` hợp lệ → đọc kết quả từ History trả ngay, **không enqueue / không tốn token**; cú pháp `fresh`/`rerun` bỏ qua cache, enqueue job mới đánh dấu `supersedes`.

**Container đổi (delta C4):**
```
 Slack Gateway ─ parse(+fresh) ─▶ EnqueueOrSubscribe (atomic upsert theo idempotency key)
                                     ├─ job mới  ─▶ review_jobs (queued)
                                     ├─ job đang chạy ─▶ $push deliveryTargets + ack chờ
                                     └─ đã completed hợp lệ ─▶ ReviewResultQuery (cache-serve)
 Review Worker ─ done ─▶ FanoutDeliverer ─▶ for each target pending:
                          MarkdownReportBuilder → SlackFileUploader (external) → mark delivered
                          └─(upload fail)─▶ ChatFallbackPresenter (chunk) → mark delivered(chat)
                          └─(cả 2 fail)──▶ mark delivery_failed + log/alert
```

**Trọng yếu mới:** `[HIGH]` race *enqueue-or-subscribe* phải atomic (1 upsert) — nếu không sẽ tạo 2 job/khóa; `[HIGH]` fan-out idempotent per-target chống double-delivery khi reclaim; `[HIGH]` fan-out mở rộng bề mặt lộ dữ liệu (→ `/tn-bao-mat`); `[MEDIUM]` `files.upload` đã khai tử → bắt buộc luồng external.

# Domain Model

Kế thừa 7 domain i-001. Delta nằm trong **Review Orchestration (Core)** + **Slack Gateway (Generic)**:

| Domain | Loại | Delta i-002 |
|--------|------|-------------|
| Review Orchestration | **Core** | Thêm sub-component `FanoutDeliverer`, `ReviewResultQuery` (cache read), `MarkdownReportBuilder`; vòng đời job thêm trạng thái giao per-target |
| Slack Gateway | Generic | Thêm `SlackFileUploader` (external upload flow), `ChatFallbackPresenter` (chunk), parse cờ `fresh`; ack subscriber |
| Audit & History | Supporting | History được **đọc lại** cho cache-serve; thêm audit `delivery`/`cache-hit`/`rerun` |

- `[MEDIUM]` (DDD) `SlackPresenter` i-001 nay tách rõ: build báo cáo (`MarkdownReportBuilder`) vs vận chuyển (`SlackFileUploader`/`ChatFallbackPresenter`) vs điều phối giao (`FanoutDeliverer`) — tránh god-component.

# Ubiquitous Language

| Khái niệm | Tên hiện tại | Vấn đề | Khuyến nghị |
|-----------|--------------|--------|-------------|
| Nơi cần trả kết quả (channel+thread+user) | "thread"/"nơi gõ" | mơ hồ | **DeliveryTarget** (channel, threadTs, userId) |
| Trả kết quả tới tất cả nơi đã hỏi | "post nhiều thread" | — | **Fan-out** |
| Lấy kết quả cũ từ DB thay vì chạy lại | "trả DB" | — | **Cache-serve** (đọc History) |
| Ép chạy lại bỏ qua cache | "fresh/rerun" | 2 tên | **Rerun** (cú pháp `fresh` ‖ `rerun`) |
| Bản review bị thay bởi rerun | "supersedes" | i-001 khai báo suông | **supersededByJobId / supersedesJobId** (ghi thực) |
| File báo cáo `.md` | "đính kèm" | — | **ReviewReport (.md)** dựng từ History |

# Bounded Context

Không thêm context mới. Quan hệ delta:
- `Review Orchestration` ⇆ `Slack Gateway` qua **`ISlackPort` mở rộng** (thêm `uploadFile()` + `postChunked()`), giữ ACL (ADR-011 i-001).
- `Review Orchestration` đọc `Audit & History` qua read model `ReviewResultQuery` (CQRS nhẹ) cho cache-serve.
- `[MEDIUM]` Context Coupling: `MarkdownReportBuilder` phụ thuộc cấu trúc `Finding[]`/`SkillRun[]` của History → đổi schema finding phải đồng bộ builder.

# Aggregate Design

`ReviewJob` (Aggregate Root) **mở rộng** (vẫn bounded theo 1 PR):

| Thành phần | Loại | Ghi chú |
|------------|------|---------|
| `deliveryTargets[]` | Entity-in-aggregate | mỗi phần tử: `{channel, threadTs, userId, requestedAt, status: pending\|delivered\|failed, mode: file\|chat\|cache, deliveredAt, error?}` |
| `supersedesJobId` / `supersededByJobId` | VO (ObjectId ref) | ghi thực khi rerun (kích hoạt field i-001 còn suông) |
| `cacheEligible` | VO (bool, dẫn xuất) | true khi `completed` & có ≥1 finding hợp lệ & không phải lỗi-toàn-phần |

- `[MEDIUM]` (Aggregate size) `deliveryTargets[]` **bounded có chủ đích**: cap mặc định (vd 50 target/job); vượt → ngừng nhận thêm subscriber, ack "đã có quá nhiều người theo dõi, sẽ trả ở thread gốc". Tránh aggregate phình do PR "hot".
- `[LOW]` `ReviewReport (.md)` **KHÔNG** lưu trong aggregate — dựng on-demand từ History (xem ADR-015).

# Domain Events

| Command | Event | Policy | Vấn đề |
|---------|-------|--------|--------|
| `ReceiveSlackMention(+fresh?)` | `ReviewCommandReceived` | resolve khóa → định tuyến enqueue/subscribe/cache | OK |
| `EnqueueOrSubscribe` | **`ReviewJobQueued`** ‖ **`DeliveryTargetRegistered`** | atomic upsert: job active có sẵn → register; else queue | `[HIGH]` thay `ReviewJobDuplicateRejected` (i-001) bằng `DeliveryTargetRegistered` |
| `ServeFromCache` | **`ReviewResultServedFromCache`** | khóa completed hợp lệ & không `fresh` → đọc History, giao 1 target | `[MEDIUM]` cần phân biệt completed hợp lệ |
| `RequestRerun(fresh)` | **`ReviewRerunRequested`** → `ReviewJobQueued(supersedes=oldId)` | đánh dấu job cũ `supersededByJobId` | `[MEDIUM]` rerun khi đang chạy → không nhân đôi (register thay vì queue) |
| `DeliverResult(target)` | **`ResultDelivered`** ‖ **`ResultDeliveryFailed`** | per-target; file→fallback chat→failed | `[HIGH]` phải idempotent (chống double khi reclaim) |
| `FanoutCompleted` | `ReviewJobDelivered` | mọi target ở trạng thái cuối | OK |

- `[HIGH]` (Event) **Bỏ** `ReviewJobDuplicateRejected` khỏi luồng chính (mâu thuẫn yêu cầu mới) — giữ lại CHỈ cho trường hợp lỗi hệ thống, không cho duplicate hợp lệ.
- Không phát hiện circular event.

# Event Storming

Command → Event → Policy → Read Model (delta):
```
ReviewCommandReceived
   ├─[Policy: route by key state]
   │     ├─ no/failed job  → ReviewJobQueued            [RM: JobQueue]
   │     ├─ active job      → DeliveryTargetRegistered   [RM: Job.deliveryTargets]  + ack chờ
   │     └─ completed hợp lệ→ ReviewResultServedFromCache [RM: ReviewResultView]     (no token)
ReviewJobCompleted
   └─[Policy: fan-out]→ for each target pending:
         ResultDelivered | ResultDeliveryFailed          [RM: DeliveryStatusView]
```
- `[HIGH]` Read Model mới **`ReviewResultView`** (đọc History theo khóa, lấy bản mới nhất `cacheEligible && !superseded`) — phục vụ cache-serve.
- `[MEDIUM]` Read Model **`DeliveryStatusView`** (target nào đã giao) để quan sát & idempotent.
- `[MEDIUM]` Read Model "đang chạy" (i-001 đã nêu) nay **tái dùng** để định tuyến register vs queue.

# Data Ownership Matrix

| Data Item | Owner | Master | Consumer | Quyền sửa | Vấn đề |
|-----------|-------|--------|----------|-----------|--------|
| `deliveryTargets[]` | Review Orchestration | MongoDB (`review_jobs`) | Worker (FanoutDeliverer), Slack | hệ thống (append khi subscribe; set status khi giao) | `[HIGH]` cập nhật status phải atomic theo từng target |
| Trạng thái giao per-target | Orchestration | MongoDB | Observability/Audit | hệ thống | `[MEDIUM]` ghi sau khi Slack API xác nhận thành công |
| `ReviewReport (.md)` | dẫn xuất | **không lưu** (dựng từ History) | Slack target | — (build-on-read) | `[LOW]` giảm bề mặt lưu data nhạy cảm |
| `supersedes/supersededBy` | Orchestration | MongoDB | ReviewResultView | hệ thống khi rerun | `[MEDIUM]` ghi thực, không suông (Rule i-001) |
| Audit delivery/cache-hit/rerun | Audit | MongoDB | nội bộ | append-only | OK |

# Source Of Truth Matrix

| Data Item | Ứng viên | SoT | Quy tắc conflict |
|-----------|----------|-----|------------------|
| Kết quả review trả lại (cache) | History job nào | **Job `completed` mới nhất, `cacheEligible`, chưa bị superseded** theo khóa | nhiều bản completed (nhiều rerun) → lấy bản `completedAt` lớn nhất chưa superseded |
| "Đã giao cho target này chưa" | trạng thái target trong job | **`deliveryTargets[i].status` trong MongoDB** | reclaim chỉ giao target `pending`; không đọc Slack để suy ra |
| Nội dung file `.md` | History (findings) vs artifact lưu sẵn | **History (dựng on-demand)** | không lưu artifact (ADR-015) |
| Khóa "cùng yêu cầu" | tên người gõ / commit | **`(projectId, prId, commitHash)`** resolve lúc nhận lệnh | commit mới → khóa mới (không tái dùng) |

# Historical Data Analysis

- **Current**: job đang chạy + `deliveryTargets` đang cập nhật.
- **Historical/Snapshot**: mỗi `completed` job giữ `Finding[]` + commit + skill version (i-001) → **đủ để dựng lại file `.md`** bất cứ lúc nào (cache-serve & fan-out lần sau).
- **Rerun** tạo job mới `supersedes` job cũ; bản cũ vẫn giữ (immutable) nhưng `ReviewResultView` chỉ trả bản mới nhất chưa superseded.
- `[HIGH]` (Temporal) Nếu cache-serve trả job cũ trong khi commit PR đã đổi → người dùng tưởng là code hiện tại. Giảm thiểu: file/summary **ghi rõ `commitHash` + `completedAt`** + gợi ý `fresh`. (Khóa commit-aware đã đảm bảo commit mới không trúng cache cũ.)
- `[MEDIUM]` Nhiều rerun tích luỹ → cần index `(projectId, prId, commitHash, status, completedAt)` + cờ `supersededByJobId=null` để lấy bản hiện hành nhanh.

# Data Lifecycle Analysis

- `deliveryTargets[]`: create (subscribe) → delivered/failed (terminal) → theo retention của job.
- `ReviewReport (.md)`: **không persist** (ephemeral, dựng-giao-xong-bỏ); file đã upload tồn trên Slack theo chính sách workspace (ngoài tầm kiểm soát hệ thống — ghi nhận ở `/tn-bao-mat`).
- Rerun/supersede: bản cũ giữ theo retention job (i-001 ~180 ngày).
- `[MEDIUM]` File `.md` chứa code nhạy cảm **đã rời hệ thống** lên Slack (nhiều channel) → bề mặt lưu trữ mở rộng, không xoá được từ phía bot. → đánh giá `/tn-bao-mat`.
- `[LOW]` Temp buffer file `.md` trong RAM/đĩa khi build → giải phóng sau upload (try/finally như clone i-001).

# Architecture Pattern Review

- Giữ Modular Monolith + DB-queue. Thêm **CQRS nhẹ** cho cache-serve (read path `ReviewResultQuery` tách khỏi write path enqueue).
- **Enqueue-or-subscribe** = một `findOneAndUpdate` **upsert có điều kiện** trên unique key — pattern "atomic claim" mở rộng từ ADR-004.
- Fan-out = vòng lặp giao tuần tự/giới hạn nhỏ với cập nhật trạng thái atomic per-target (outbox-lite trong cùng aggregate).
- `[MEDIUM]` (Under-engineering có chủ đích) Fan-out tuần tự trong worker, không tách queue giao riêng — đủ cho tải hiện tại; PR "hot" nhiều target → throttle, chưa cần job giao riêng.
- `[LOW]` (Over-engineering tránh) Không thêm artifact store/CDN cho file `.md` — dựng từ History.

# API Review

- **Slack command parse**: thêm token tuỳ chọn cuối lệnh `fresh` (alias `rerun`); normalize, không nhầm với link/tham số. Cú pháp: `@tieu-nhi <project> review <pr-url> [fresh|rerun]`.
- **`ISlackPort` mở rộng** (ACL, không phải REST công khai): `uploadMarkdown(channel, threadTs, filename, content)` (dùng `files.getUploadURLExternal`→PUT→`files.completeUploadExternal`); `postChunked(channel, threadTs, parts[])`; `postSummary(channel, threadTs, text)`.
- Admin API `/api/v1/.../reviews`: thêm trường `deliveries[]` + `supersededByJobId` trong response history (paginate giữ nguyên).
- `[MEDIUM]` (Idempotency) Slack có thể **retry event** (3s timeout) → ack nhanh + xử lý nền; `EnqueueOrSubscribe` phải idempotent theo `(key, channel, threadTs)` để Slack-retry không tạo target trùng.
- `[LOW]` Đặt tên file: `review-<project>-PR<prId>-<commit8>.md` (commit8 = 8 ký tự đầu hash) để truy vết & tránh trùng.

# Integration Review

| Hệ ngoài | Retry | Timeout | Fallback | Circuit Breaker | Rủi ro |
|----------|-------|---------|----------|-----------------|--------|
| **Slack files (external upload 2 bước)** | có (idempotent theo target) | có | **→ chat chunked** | theo workspace token | `[HIGH]` deprecated nếu dùng `files.upload`; 2 bước nên nhiều điểm lỗi |
| **Slack postMessage (chunked)** | có | có | nếu cũng fail → `delivery_failed` + alert | — | `[MEDIUM]` rate-limit khi nhiều part/nhiều target |
| Slack getUploadURLExternal | có | có | coi như upload fail → chat | — | `[MEDIUM]` |
| MongoDB (upsert target, set status) | retryWrites | có | — | — | `[HIGH]` mất cập nhật status → double/khoảng trống giao |

- `[HIGH]` Upload `.md` 2 bước (get URL → PUT bytes → complete): lỗi giữa chừng (đã PUT, chưa complete) → coi như chưa giao, fallback/retry; **không** mark delivered trước khi `completeUploadExternal` trả OK.
- `[MEDIUM]` Slack rate-limit (HTTP 429) khi fan-out nhiều target/part → tôn trọng `Retry-After`, giao tuần tự + backoff.

# Integration Failure Analysis

| Kịch bản | Còn chạy? | Mất data? | Xử lý mong đợi | Mức |
|----------|-----------|-----------|----------------|-----|
| Upload file fail (deprecated/scope/timeout/5xx) | có | không | fallback chat chunked cùng target | `[HIGH]` |
| Cả file lẫn chat fail | có (target khác vẫn giao) | không (History còn) | mark `delivery_failed` + log + alert + báo lỗi ngắn | `[HIGH]` |
| Worker crash giữa fan-out | có (reclaim) | không | reclaim → chỉ giao target `pending`; không post lại `delivered` | `[HIGH]` |
| 2 lệnh cùng khóa enqueue đồng thời | — | không | atomic upsert: 1 queue job, 1 register target | `[HIGH]` |
| Target đăng ký ngay khi job vừa `completed` | có | không | upsert thấy completed → đi nhánh cache-serve (không "rơi") | `[HIGH]` |
| Slack retry event (double webhook) | có | không | idempotent theo `(key,channel,threadTs)` → không trùng target | `[MEDIUM]` |
| File `.md` vượt giới hạn kích thước Slack | có | không | chia file / fallback chat; không upload fail câm | `[MEDIUM]` |
| Bot bị kick khỏi channel 1 target | có | không | mark target failed, giao target còn lại | `[MEDIUM]` |
| Cache-serve lúc DB chậm | có | không | timeout → coi cache-miss, xử lý như lệnh mới | `[MEDIUM]` |

# Multi Tenant Review

- Pool + `ownerId` filter giữ nguyên (i-001). Delta: **fan-out & cache-serve KHÔNG được bỏ qua ràng buộc isolation** — kết quả thuộc project của owner nào thì nội dung là của project đó.
- `[HIGH]` (Isolation/Leak) Fan-out đẩy nội dung review (code/tài liệu) tới **nhiều channel/thread/DM** cùng lúc; bất kỳ ai "đăng ký" được (kế thừa quyết định i-001 "mọi người review được", FRD #8) → **mở rộng bề mặt lộ dữ liệu chéo**. Điểm chốt `authorizeReviewCommand` (i-001) **áp dụng cho cả subscribe & cache-serve & fresh**. Đánh giá ranh giới ở `/tn-bao-mat`.
- `[MEDIUM]` Cache-serve cho người khác owner: người B hỏi lại PR project người A → nhận kết quả từ History. Nhất quán i-001 nhưng là điểm leak; cần xác nhận chủ đích ở bảo mật.

# Authentication Review

Không đổi so với i-001 (Admin: PAT→AzureIdentity→JWT; Slack: verify signing secret + timestamp).
- `[MEDIUM]` Slack scope mở rộng **`files:write`** cho upload `.md` → cấp least-privilege; bảo vệ Slack bot token (mã hoá/secret store như i-001).

# Authorization Review

- Ownership-based giữ nguyên cho Admin. Delta cho Slack:
- `[HIGH]` Lệnh `fresh`/`rerun` **đốt token** → cùng điểm chốt phân quyền review (`authorizeReviewCommand`) + rate-limit i-001 phải bao phủ `fresh` (mỗi rerun = 1 lần chạy thật).
- `[MEDIUM]` Subscribe (đăng ký nhận fan-out) cũng phải qua `authorizeReviewCommand` — không cho người không được phép "hứng" kết quả PR người khác chỉ bằng cách gõ lệnh trùng.

# Permission Scope Matrix

| Permission | Scope | Boundary | Vấn đề |
|------------|-------|----------|--------|
| Ra lệnh review (tạo job) | mọi user workspace (giả định i-001) | per command | `[HIGH]` #8 |
| **Subscribe (đăng ký fan-out)** | như ra lệnh review | per (key, channel, thread) | `[HIGH]` mở rộng bề mặt #8 — qua `authorizeReviewCommand` |
| **Cache-serve (nhận kết quả cũ)** | như ra lệnh review | per command | `[MEDIUM]` leak chéo owner |
| **Rerun (`fresh`)** | như ra lệnh review | per command | `[HIGH]` đốt token → rate-limit |
| Nhận file `.md` trong channel | mọi người trong channel target | per channel | `[HIGH]` lộ code/tài liệu |
| Xem history+deliveries (UI) | owner | per project | `[MEDIUM]` |

# Security Threat Model

| STRIDE | Threat (delta i-002) | Tài sản | Biện pháp | Mức |
|--------|----------------------|---------|-----------|-----|
| Tampering | giả `(channel,threadTs)` để chèn target nhận kết quả người khác | nội dung review | target lấy từ Slack event đã verify signature, không từ payload tự do; `authorizeReviewCommand` | `[HIGH]` |
| Info Disclosure | fan-out/cache-serve lộ code project khác tới channel/người ngoài | code/tài liệu private | điểm chốt authorize; đánh giá ranh giới `/tn-bao-mat` (#8) | `[HIGH]` |
| Info Disclosure | file `.md` chứa secret/snippet rời lên Slack, không xoá được | dữ liệu nhạy cảm | lọc nội dung; cảnh báo; chính sách workspace | `[HIGH]` |
| DoS | spam `fresh` đốt token + spam subscribe phình `deliveryTargets` | token/chi phí, DB | rate-limit (i-001) bao gồm fresh; cap số target/job | `[HIGH]` |
| Repudiation | chối đã nhận/đã rerun | truy vết | audit delivery/cache-hit/rerun (không log nội dung secret) | `[MEDIUM]` |
| Tampering | double-delivery khi reclaim | tính nhất quán | trạng thái per-target + cập nhật atomic | `[MEDIUM]` |

> Chi tiết & ranh giới fan-out leak: `/tn-bao-mat`.

# Performance Risks

- `[MEDIUM]` Build file `.md` từ `Finding[]` lớn + upload 2 bước cho nhiều target → giao **tuần tự** có thể chậm; build 1 lần, **tái dùng nội dung** cho mọi target (chỉ upload/đối tượng khác nhau).
- `[MEDIUM]` Cache-serve phải nhanh (đọc 1 doc History + build file) — index theo khóa; tránh full scan.
- `[LOW]` Chunk fallback nhiều part → tôn trọng rate-limit, không post bùng nổ.

# Scalability Risks

- `[MEDIUM]` PR "hot" → `deliveryTargets[]` lớn: cap số target + fan-out tuần tự; vượt cap → chỉ giao thread gốc + thông báo.
- `[MEDIUM]` Nhiều rerun/supersede tích luỹ History → index + cờ `supersededByJobId` lấy bản hiện hành; retention dọn bản cũ.
- `[LOW]` 10.000+ job/ngày: fan-out tuần tự trong worker có thể thành điểm nóng → tách job giao riêng (đường mở rộng, chưa làm).

# Observability Gaps

- `[HIGH]` Correlation id (i-001) phải bao **mọi delivery**: 1 job → N target → N kết quả giao, gắn `targetId` để truy vết "ai nhận, bằng cách nào (file/chat/cache), thành công/lỗi".
- `[MEDIUM]` Metrics mới: `cache_hit_rate`, `tokens_saved` (KPI), `fanout_target_count`, `delivery_success/fail by mode`, `rerun_count` (phát hiện lạm dụng).
- `[MEDIUM]` Alert: tỉ lệ `delivery_failed` cao (Slack/scope hỏng); spike `fresh`/subscribe (abuse).
- `[LOW]` Log lý do fallback file→chat để chẩn đoán deprecated/scope.

# Technical Debt Risks

- `[MEDIUM]` Tự viết upsert *enqueue-or-subscribe* + per-target idempotent delivery dễ sai cạnh tranh → test kỹ (concurrency tests, reclaim mid-fanout).
- `[MEDIUM]` Coupling `MarkdownReportBuilder` với schema `Finding[]` → đổi schema phải đồng bộ builder + chunker.
- `[MEDIUM]` Slack upload 2 bước (external) là API mới, dễ đổi → bọc trong `ISlackPort`, pin SDK; có integration test mock cả 2 bước.
- `[LOW]` Chunker (cắt theo section/finding, không cắt giữa câu, cap số message) — logic dễ vỡ định dạng mrkdwn, cần test bảng.

# ADR Recommendations

| ID | Decision | Reason | Alternative | Trade-Off | Consequence |
|----|----------|--------|-------------|-----------|-------------|
| **ADR-012** | **Output luôn file `.md` (Markdown chuẩn) + 1 dòng tóm tắt inline (mrkdwn)**; upload qua `files.getUploadURLExternal`+`completeUploadExternal`; **fallback chunk chat** khi lỗi | review dài vượt trần Slack; `files.upload` đã khai tử (Rule i-001) | luôn post text; chỉ đính kèm khi dài (i-001) | thêm bước build file + 2-bước upload | **override quy tắc output i-001**; cần scope `files:write`; `ISlackPort` thêm `uploadMarkdown/postChunked` |
| **ADR-013** | **Fan-out qua `deliveryTargets[]` + trạng thái giao per-target**; lệnh trùng lúc active → **register (không reject)** + ack chờ; **atomic upsert enqueue-or-subscribe** | yêu cầu: cùng 1 review trả mọi nơi; chống race tạo 2 job; idempotent khi reclaim | reject duplicate (ADR-007 i-001); queue giao riêng | tự viết upsert + per-target status phức tạp | **override ADR-007** (reject→subscribe); cap target/job; cập nhật status atomic |
| **ADR-014** | **Cache-serve từ History** (CQRS read) khi khóa có job `completed` **hợp lệ** & không `fresh`; **`fresh`/`rerun` bỏ qua cache + enqueue job `supersedes`** | tiết kiệm token/thời gian; vẫn cho ép mới | luôn chạy lại; luôn dùng cache | cần định nghĩa "completed hợp lệ" + ghi supersedes thực | `ReviewResultView`; "hợp lệ" = `completed` & ≥1 finding & không lỗi-toàn-phần; rerun đốt token → rate-limit |
| **ADR-015** | **KHÔNG lưu artifact file `.md`** — dựng on-demand từ History mỗi lần giao | giảm bề mặt lưu dữ liệu nhạy cảm; History đã đủ dữ kiện | lưu blob/CDN | tốn CPU build lại mỗi lần | builder dựng từ `Finding[]`; ephemeral, giải phóng sau upload |
| **ADR-016** | **Khóa fan-out/cache = `(projectId, prId, commitHash)`** (commit-aware) | phản ánh đúng code tại commit; commit mới = review mới | bỏ qua commit (PR-level) | commit mới không trúng cache cũ (đúng ý) | tái dùng unique index ADR-007; resolve commit lúc nhận lệnh |

# Quality Attribute Assessment

| Thuộc tính (ISO 25010) | Đánh giá | Kịch bản chất lượng | Mức |
|------------------------|----------|---------------------|-----|
| Security | fan-out/cache mở rộng bề mặt lộ dữ liệu chéo; scope `files:write` | người ngoài subscribe PR người khác → authorize chốt | `[HIGH]` |
| Performance | build+upload nhiều target; cache-serve nhanh | PR vừa, 5 target < vài giây giao | `[MEDIUM]` |
| Reliability | per-target idempotent + reclaim + fallback | worker chết giữa fan-out → không double, không sót | `[HIGH]` |
| Availability | 1 target lỗi không chặn target khác | bot bị kick 1 channel → vẫn giao nơi khác | `[MEDIUM]` |
| Scalability | PR hot nhiều target; nhiều rerun | cap target + index supersede | `[MEDIUM]` |
| Maintainability | tách builder/uploader/fallback/fanout | đổi định dạng không đụng vận chuyển | `[MEDIUM]` |
| Testability | mock `ISlackPort` 2-bước; concurrency tests | reclaim mid-fanout test được | `[MEDIUM]` |
| Operability | metrics cache-hit/delivery/rerun | thấy delivery_failed tăng → cảnh báo | `[MEDIUM]` |
| Observability | correlation id xuống tới từng target | truy vết "ai nhận gì, cách nào" | `[HIGH]` |

# Open Questions

Câu hỏi **thiết kế** đã chốt trong i-002 (⇒ open_questions = 0):
- Khóa fan-out/cache → **ADR-016** (commit-aware, tái dùng index ADR-007).
- Định dạng/đặt tên file + cách upload → **ADR-012** (`review-<project>-PR<id>-<commit8>.md`; external 2-bước; fallback chunk).
- Hành vi lệnh trùng + chống race + idempotent giao → **ADR-013** (atomic upsert; per-target status; override ADR-007).
- Cache-serve + "completed hợp lệ" + rerun/supersedes → **ADR-014**.
- Lưu artifact hay dựng lại → **ADR-015** (dựng từ History).
- Cờ `fresh`/`rerun` cú pháp → đặt cuối lệnh, alias `fresh|rerun` (ADR-012/014 ghi chú).
- Chunking fallback: cắt theo section/finding, không cắt giữa câu, cap số message (≤ ~20), giữ mrkdwn hợp lệ.
- Cap số `deliveryTargets`/job: mặc định 50 (cấu hình).

Chuyển bước sau (KHÔNG chặn thiết kế):
- `[→bảo mật]` Ranh giới fan-out leak (FRD #5 i-002 / #8 i-001): có giới hạn subscribe/cache-serve theo owner/kênh không? Scope `files:write` & secret token Slack. Nội dung file `.md` có cần lọc secret/PII trước khi rời hệ thống không.
- `[→bảo mật]` Chính sách dữ liệu: file `.md` đã lên Slack không xoá được từ bot — ràng buộc/đồng ý.

# Architecture Recommendations

1. `[Concurrency]` **Atomic upsert enqueue-or-subscribe** (1 `findOneAndUpdate` theo unique key) + **per-target delivery status** cập nhật atomic (`arrayFilters` status=pending) — chống race tạo 2 job & double-delivery khi reclaim. *(ADR-013)*
2. `[Boundary/Output]` Tách `MarkdownReportBuilder` / `SlackFileUploader` / `ChatFallbackPresenter` / `FanoutDeliverer`; bọc upload 2-bước trong `ISlackPort`. *(ADR-012)*
3. `[SoT/Temporal]` Cache-serve đọc `ReviewResultView` (bản `completed` hợp lệ, mới nhất, chưa superseded); file/summary ghi rõ `commitHash`+`completedAt`+gợi ý `fresh`. *(ADR-014/016)*
4. `[Data Lifecycle]` KHÔNG lưu artifact `.md` — dựng từ History, giải phóng buffer sau upload. *(ADR-015)*
5. `[Security]` `authorizeReviewCommand` áp cho **review + subscribe + cache-serve + fresh**; rate-limit bao gồm `fresh`; least-privilege scope `files:write`; → đánh giá ranh giới leak ở `/tn-bao-mat`.
6. `[Observability]` Correlation id xuống `targetId`; metrics `cache_hit/tokens_saved/fanout_count/delivery_by_mode/rerun_count` + alert delivery_failed/abuse.
7. `[Scalability]` Cap `deliveryTargets`/job; index `(projectId,prId,commitHash,status,completedAt)` + `supersededByJobId` để lấy bản hiện hành nhanh.
