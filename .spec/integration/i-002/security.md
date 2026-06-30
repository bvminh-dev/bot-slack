---
integration: i-002
feature: review-pr-slack-azure
stage: security
status: approved
open_questions: 0
updated: 2026-06-30
---

> **Delta bảo mật i-002** trên nền baseline i-001 (`main/security.md`). Chỉ ghi điểm MỚI/đổi do: giao kết quả dạng **file `.md`** (Slack `files:write`, upload external, file **rời hệ thống không xoá được**), **fan-out** tới nhiều delivery target, **cache-serve** từ History, lệnh **`fresh`/`rerun`**, `deliveryTargets[]` phình. Mục không có delta ghi "Không phát hiện delta (kế thừa i-001)".

# Asset Inventory

| Tài sản | Loại | Độ nhạy cảm | Nơi lưu | Ai truy cập |
|---------|------|-------------|---------|-------------|
| **File `.md` báo cáo review** | Output dẫn xuất (code/finding/tài liệu) | **HIGH** | **Slack workspace** (sau upload, ngoài tầm xoá của bot) + buffer ephemeral khi build | Mọi người trong channel/thread target |
| **Slack Bot Token (scope `files:write`)** | Credential | **HIGH** | ENV/secret store | Slack Gateway/Worker |
| **`deliveryTargets[]`** (channel, threadTs, userId) | Routing + PII nhẹ | MEDIUM | MongoDB (`review_jobs`) | Worker (FanoutDeliverer) |
| **Trạng thái giao per-target** | Metadata | LOW | MongoDB | Observability/Audit |
| `supersedesJobId`/`supersededByJobId` | Lineage | LOW | MongoDB | ReviewResultView |

Kế thừa i-001: PAT/Claude key (CRITICAL, AES-256-GCM), master key (ENV), JWT/signing secret (HIGH), PR code qua Anthropic (HIGH), review history (HIGH).

# Threat Model (STRIDE)

| STRIDE | Threat cụ thể (delta i-002) | Phần tử/Trust boundary | Tác động | Mitigation | Mức |
|--------|------------------------------|------------------------|----------|------------|-----|
| I | **File `.md` rời lên Slack không xoá được** — chứa snippet code/finding/secret vô tình | Worker→Slack files API | dữ liệu nhạy cảm tồn vĩnh viễn trên Slack, ngoài kiểm soát bot | best-effort redaction secret-pattern trong builder; minimization; classification; chính sách workspace retention (→nghiệp vụ) | `[HIGH]` |
| I | **Fan-out khuếch đại lộ chéo** — kết quả đẩy đồng thời tới nhiều channel/thread/DM | Worker→nhiều target | tăng phạm vi & tốc độ lan dữ liệu project chéo | target = nguồn-event đã verify; `authorizeReviewCommand` áp cho subscribe; cap target | `[HIGH]` residual (kế thừa #8) |
| S/T | **Spoof delivery target** — chèn channel/thread người khác để hứng kết quả | Slack event → register | nhận review PR mình không nên thấy | target lấy từ **event đã verify signing secret**, KHÔNG từ payload tự do; không cho chỉ định channel tuỳ ý | `[HIGH]` |
| D | **`fresh`/`rerun` đốt token** | Slack command | chi phí Claude tăng đột biến | rate-limit/quota i-001 **bao gồm** fresh; mỗi rerun tính 1 lần chạy | `[HIGH]` |
| D | **`deliveryTargets[]` phình** (spam subscribe PR "hot") | Worker/Mongo | doc job phình (giới hạn 16MB Mongo), DoS aggregate | **cap số target/job** (mặc định 50) + dedup `(channel,threadTs)` | `[MEDIUM]` |
| T | **Double-delivery khi reclaim** | Worker fan-out | post trùng / nhiễu thread | trạng thái per-target + cập nhật **atomic** (arrayFilters status=pending) | `[MEDIUM]` |
| I | **Cache-serve trả bản stale** | ReviewResultView | hiểu nhầm code cũ là hiện tại | khóa **commit-aware** (commit mới không trúng cache); ghi rõ commit+thời điểm | `[MEDIUM]` |
| T | **Mention injection qua nội dung PR vào chunked fallback** (`<!channel>`,`@here`) | PR (untrusted)→Slack message | ping toàn kênh / nhiễu | escape/vô hiệu mention & link khi post text; **file `.md` không bị Slack parse mention** (an toàn hơn) | `[MEDIUM]` |

# Attack Surface

Delta: **(1) Slack files endpoint outbound** (`getUploadURLExternal`→PUT→`completeUploadExternal`) — token `files:write` mở rộng quyền; **(2) Subscribe path** (đăng ký delivery target qua lệnh trùng) — bề mặt nhận dữ liệu chéo; **(3) Cache-serve read path** — đọc History trả cross-owner; **(4) `fresh` command** — kích hoạt chạy tốn tiền. Kế thừa i-001: Slack Events (spoof/DoS/prompt-injection) `[HIGH]`, Admin API/UI, git clone SSRF, spawn `claude`, MongoDB.
- `[LOW]` Upload URL từ Slack API (không phải input người dùng) → SSRF không phát sinh; PUT tới host Slack trả về.

# Authentication Review

Không phát hiện delta (kế thừa i-001: PAT→AzureIdentity→JWT; Slack verify signing secret+timestamp).
- `[MEDIUM]` Slack Bot Token nay có thêm scope `files:write` → nếu token lộ, attacker upload file vào mọi channel bot hiện diện. Bảo vệ token như secret (mã hoá/secret store, không log), least-privilege (chỉ `files:write`, không `files:read` nếu không cần).

# SSO Review

Không phát hiện delta (kế thừa i-001: chưa dùng SSO; khuyến nghị tương lai Entra ID OIDC).

# Session Review

Không phát hiện delta (kế thừa i-001).

# Authorization Review

- `[HIGH]` (A01/API5) **`authorizeReviewCommand` phải áp cho TẤT CẢ entrypoint mới**: ra lệnh review, **subscribe** (đăng ký fan-out), **cache-serve** (nhận kết quả cũ), **`fresh`** (ép chạy lại). Nếu chỉ gắn ở "tạo job" mà bỏ qua subscribe/cache-serve → bypass: người không qua authorize vẫn hứng được kết quả.
- `[HIGH]` residual (kế thừa #8): actor≠owner vẫn nhận output. Fan-out **không cấp quyền mới** — target chỉ là channel/thread mà chính actor đã gõ lệnh (họ vốn có thể tự chạy review vào đó). Do đó **không phát sinh leo quyền ngang mới**, chỉ khuếch đại residual đã chấp nhận.

# Permission Scope Review

| Permission | Scope dự kiến | Scope thực tế | Rủi ro nới quyền | Mức |
|------------|---------------|---------------|------------------|-----|
| Subscribe (đăng ký fan-out) | như ra lệnh review | per (key, channel, thread) lấy từ event verify | nếu lấy channel từ payload tự do → nhận PR chéo | `[HIGH]` (kiểm soát: event-verified) |
| Cache-serve (nhận kết quả cũ) | như ra lệnh review | per command, resolve project theo registry | đọc History project resolve được | `[MEDIUM]` residual |
| `fresh`/`rerun` | như ra lệnh review | per command | đốt token nếu không rate-limit | `[HIGH]` |
| Nhận file `.md` trong channel | mọi người trong channel target | per channel | lộ code/tài liệu | `[HIGH]` residual |

# Multi Tenant Security Review

- `[HIGH]` ⚠️ **Fan-out & cache-serve KHÔNG được phá `ownerId` isolation**: khóa resolve `projectId` qua registry như i-001; cache-serve chỉ trả History của đúng `(projectId,prId,commitHash)` mà lệnh resolve được. Không cho cache-serve "đoán" job project khác (BOLA): truy vấn theo khóa đã resolve, không theo id job tự do.
- `[HIGH]` residual (kế thừa): Slack kênh không cô lập tenant (chính sách mở) — fan-out khuếch đại điểm yếu này; đã chấp nhận, bù audit + cap + cảnh báo.
- `[MEDIUM]` `deliveryTargets[]` chứa channel/userId nhiều owner-context trong 1 doc job — không lẫn dữ liệu project (job thuộc đúng 1 project); chỉ là routing, không phá isolation.

# API Security Review

| OWASP API | Endpoint/Flow | Vấn đề | Tác động | Mức |
|-----------|---------------|--------|----------|-----|
| API1 BOLA | Cache-serve đọc History | nếu đọc theo jobId tự do thay vì khóa resolve → đọc job project khác | cross-tenant leak | `[HIGH]` → đọc theo khóa resolve + ownerId-aware |
| API4 Resource Consumption | `fresh`/subscribe | spam đốt token / phình targets | DoS + chi phí | `[HIGH]` → rate-limit bao gồm fresh; cap targets |
| API6 (Unsafe Consumption) | Slack files API 2 bước | tin response Slack mù | giao sai/treo | `[MEDIUM]` → check status `completeUploadExternal` trước khi mark delivered |
| API3 Excessive Exposure | response Admin `/reviews` thêm `deliveries[]` | lộ channel/userId người khác? | PII routing | `[MEDIUM]` → chỉ owner xem, không serialize userId thừa |

# Injection Risks

- `[MEDIUM]` (A03) **Mention/link injection** vào **chunked chat fallback**: nội dung review chứa snippet PR (untrusted) có thể chứa `<!channel>`,`<!here>`,`@user`,`<http://evil|click>` → ping/nhiễu/phishing trong Slack. Khắc phục: khi post text mrkdwn, **vô hiệu hoá mention** (thay `<!`→escape) và **không render link tự động** từ nội dung PR; ưu tiên file `.md` (file đính kèm **không** bị Slack parse mention → an toàn hơn — thêm lý do file-first).
- `[LOW]` Path traversal qua tên file `.md`: tên do hệ thống sinh (`review-<project>-PR<id>-<commit8>.md`), sanitize ký tự đặc biệt từ project name (đã có thể chứa input owner) trước khi đưa vào filename.
- Kế thừa i-001: command/arg injection (`claude`/`git` argv), NoSQL injection (tham số hoá) — không đổi.

# XSS Risks

- `[LOW]` File `.md` xem trong Slack/qua preview — Slack render an toàn; không phát sinh XSS phía bot. Admin UI hiển thị `deliveries[]` → React auto-escape (kế thừa i-001). Không phát hiện delta nghiêm trọng.

# CSRF Risks

Không phát hiện delta (Slack endpoint không cookie; Admin API kế thừa i-001).

# File Upload Risks

> i-001 ghi "không có upload". i-002 **thêm upload OUTBOUND** (bot→Slack), không phải inbound user upload → mô hình rủi ro khác (data exfiltration, không phải malware nhận vào).
- `[HIGH]` **Outbound data exfiltration**: file `.md` mang dữ liệu nhạy cảm rời tổ chức tới Slack, **không thu hồi được**. Khắc phục: best-effort redaction (pattern secret: API key, PAT, `password=`, `.env` value, token `sk-…`), data minimization (chỉ finding + trích đoạn cần), classification cảnh báo, chính sách đồng ý (→nghiệp vụ/pháp lý).
- `[MEDIUM]` File quá lớn (Slack giới hạn) → chia/fallback; không upload fail câm. Không có double-extension/zip-bomb (file `.md` text do bot sinh).
- `[LOW]` Buffer file ephemeral khi build → giải phóng sau upload (try/finally như temp clone i-001).

# Data Protection Review

- `[HIGH]` (A02) **Dữ liệu nhạy cảm trong file `.md` rời hệ thống vĩnh viễn**: builder phải **redact secret-pattern** + minimization trước khi upload; đây là điểm rời tổ chức không thể đảo ngược (mạnh hơn rủi ro thread i-001 vì file là artifact tải về được, lưu trên Slack theo retention workspace).
- `[MEDIUM]` Cache-serve dựng lại file từ History → cùng yêu cầu redaction/minimization (không "tái lộ" qua đường cache).
- Kế thừa i-001: code khách hàng qua Anthropic (minimization + đồng ý); history trích đoạn code (retention + truy cập owner).

# Encryption Review

- `[HIGH]` In-transit: upload Slack 2 bước phải qua **HTTPS/TLS** (getUploadURL + PUT bytes + complete) — không downgrade.
- Không phát hiện delta at-rest: file `.md` **không persist** ở bot (ADR-015 dựng từ History) → không cần khoá riêng. `deliveryTargets[]` không nhạy cảm tới mức mã hoá (routing); userId là PII nhẹ.

# Secret Management Review

- `[MEDIUM]` **Slack Bot Token** (nay có `files:write`) quản như secret: ENV/secret store, không log, không commit; least-privilege scope. Rotation khi nghi lộ.
- `[MEDIUM]` **Redaction secret trong builder**: chính builder phải biết pattern secret để che — cẩn thận không log nội dung đã trích trước khi che (tránh secret lọt vào log build).
- Kế thừa i-001: PAT/Claude key AES-256-GCM write-only, master key ENV.

# Audit Review

- `[HIGH]` (A09) **Audit delivery bất biến**: mỗi lần giao ghi `{jobId, targetId(channel/thread/user), mode: file|chat|cache, status, timestamp, correlationId}` — truy vết "ai nhận kết quả nào, ở đâu, bằng cách nào". KHÔNG log nội dung file/secret.
- `[HIGH]` Audit **cache-hit** (tiết kiệm token — KPI) & **rerun/`fresh`** (phát hiện lạm dụng/đốt token).
- `[MEDIUM]` Audit **redaction event** (đã che secret-pattern nào, đếm) để giám sát rò rỉ tiềm năng — không log giá trị bị che.

# Security Event Catalog

| Sự kiện | Có ghi log? | Có cảnh báo? | Mức |
|---------|-------------|--------------|-----|
| Delivery thất bại (file+chat đều fail) | có | tỉ lệ fail cao → cảnh báo (Slack/scope hỏng) | `[HIGH]` |
| Spike `fresh`/rerun từ 1 user | có + cost | vượt ngưỡng → cảnh báo (abuse/đốt token) | `[HIGH]` |
| `deliveryTargets` chạm cap (PR hot) | có | nhiều job chạm cap → cảnh báo | `[MEDIUM]` |
| Cache-hit | có | (metric, không alert) | `[LOW]` |
| Redaction kích hoạt (secret-pattern trong output) | có (đếm) | nhiều lần → soi rò rỉ | `[MEDIUM]` |
| Mention bị vô hiệu trong fallback | nên | — | `[LOW]` |

# Monitoring Gaps

- `[HIGH]` Thiếu metric `delivery_success/fail by mode` + alert khi `delivery_failed` tăng (dấu hiệu token/scope Slack hỏng hoặc bị kick).
- `[HIGH]` Thiếu anomaly `fresh`/rerun (đốt token) — gắn vào anomaly chi phí i-001.
- `[MEDIUM]` Thiếu giám sát `deliveryTargets` size (phình → DoS aggregate).
- `[MEDIUM]` Correlation id phải xuống `targetId` (kế thừa observability i-001, mở rộng cho fan-out).

# Data Leakage Risks ⚠️

- `[HIGH]` **File `.md` rời lên Slack vĩnh viễn** (API3-like excessive exposure ra ngoài): redaction + minimization + classification; chính sách workspace.
- `[HIGH]` **Fan-out khuếch đại lộ chéo** (residual #8 i-001): không cấp quyền mới nhưng tăng phạm vi → cap target + audit + cảnh báo owner (tuỳ chọn).
- `[HIGH]` **Cache-serve cross-owner**: người khác owner hỏi lại nhận kết quả từ History — nhất quán residual i-001; chỉ trả theo khóa resolve (không BOLA theo jobId).
- `[MEDIUM]` Admin `/reviews` thêm `deliveries[]` chứa channel/userId → chỉ owner xem, không serialize userId/PII thừa; lọc field công khai.
- `[MEDIUM]` Error/thông báo fallback không lộ stacktrace/secret (kế thừa i-001).

# Privilege Escalation Risks ⚠️

- `[HIGH]` **Subscribe-bypass**: nếu subscribe/cache-serve KHÔNG qua `authorizeReviewCommand` → người bị chặn review vẫn hứng kết quả bằng cách gõ lệnh trùng. Khắc phục: cùng gate cho mọi entrypoint.
- `[MEDIUM]` Không phát sinh leo quyền **dọc** mới (không có role admin toàn cục mới). Leo quyền **ngang**: fan-out chỉ tới channel actor đã gõ lệnh (vốn có quyền) → không vượt residual đã chấp nhận.
- `[LOW]` `fresh` không nâng quyền, chỉ tốn tài nguyên (xếp vào DoS/cost).

# Security Misconfiguration Risks

- `[MEDIUM]` Slack app scope: chỉ thêm `files:write` cần thiết; không bật `files:read`/`channels:history` nếu không dùng (least-privilege, A05).
- `[MEDIUM]` Cap `deliveryTargets` & rate-limit `fresh` phải **bật mặc định** (fail-safe), không để cấu hình trống = vô hạn.
- Kế thừa i-001: CORS/header/cookie/TLS/Mongo auth — không đổi.

# Incident Response Risks

- `[HIGH]` **File nhạy cảm đã lên Slack không xoá được từ bot** → IR cần quy trình thủ công: gọi Slack `files.delete` (cần scope/quyền tương ứng) hoặc admin workspace xoá; tài liệu hoá runbook khi lộ secret qua file.
- `[MEDIUM]` Khi Slack token lộ: rotate token + thu hồi; emergency disable upload (fallback chat-only) như feature toggle.
- Kế thừa i-001: rotate PAT/Claude key + keyVersion; emergency disable project; denylist slack user lạm dụng.

# Zero Trust Assessment

| Nguyên tắc | Hiện trạng | Khoảng trống | Mức |
|------------|------------|--------------|-----|
| Never Trust | nội dung PR untrusted; nay vào cả file & chunked chat | mention injection trong fallback chat | `[MEDIUM]` (escape mention; file an toàn hơn) |
| Always Verify | target lấy từ event verify; cache-serve theo khóa resolve | đảm bảo subscribe/cache-serve cùng qua authorize gate | `[HIGH]` |
| Least Privilege | Slack token thêm `files:write` | chỉ scope cần; không files:read | `[MEDIUM]` |
| Continuous Validation | re-verify actor↔project ở mọi entrypoint mới (subscribe/cache/fresh) | chưa siết (chính sách mở) | `[MEDIUM]` residual |

# Open Security Questions

Đã chốt trong i-002 (⇒ open_questions = 0), nhất quán quyết định i-001:
- **Fan-out leak amplification**: chấp nhận như **residual nối tiếp #8 i-001** (mọi người review mọi project). Lý do: fan-out **không cấp quyền mới** — chỉ giao tới channel/thread mà actor đã gõ lệnh (vốn có thể tự chạy review). Kiểm soát: `authorizeReviewCommand` áp cho subscribe/cache-serve/`fresh`; target lấy từ event đã verify; cap target; audit/alert.
- **Cache-serve cross-owner**: chấp nhận residual như i-001; chỉ trả theo **khóa resolve** (không BOLA theo jobId tự do).
- **File `.md` rời hệ thống**: kiểm soát bằng **best-effort redaction secret-pattern + minimization + classification** trong builder; cùng lớp với rủi ro thread i-001 (cùng dữ liệu, container khác) → không nâng thành câu hỏi chặn.

Định tuyến (KHÔNG chặn):
- `[→nghiệp vụ/pháp lý]` Chính sách **file đã lên Slack không xoá được** + workspace retention + đồng ý dữ liệu khách hàng (nối FRD #7 i-001).
- `[→vận hành]` Runbook IR xoá file lộ secret trên Slack; feature toggle "chat-only" khi token/scope sự cố.
- `[→tương lai]` Cân nhắc giới hạn fan-out theo kênh/owner nếu chính sách siết lại (hiện mở theo i-001).

# Security Recommendations

1. `[Broken Access Control]` **`authorizeReviewCommand` áp cho mọi entrypoint mới**: review + subscribe + cache-serve + `fresh`; cache-serve đọc theo **khóa resolve** (không jobId tự do) tránh BOLA. *(HIGH, quick-win)*
2. `[Data Leakage]` **Redaction secret-pattern + minimization** trong `MarkdownReportBuilder` trước upload; áp cả đường cache-serve dựng lại từ History. *(HIGH)*
3. `[Spoofing/Tenant]` Delivery target lấy từ **Slack event đã verify signing secret**, KHÔNG từ payload tự do; không cho chỉ định channel tuỳ ý. *(HIGH)*
4. `[DoS/Cost]` Rate-limit/quota i-001 **bao gồm `fresh`/rerun**; **cap `deliveryTargets`/job** (mặc định 50, fail-safe) + dedup `(channel,threadTs)`. *(HIGH)*
5. `[Injection]` **Vô hiệu mention/link** (`<!channel>`,`@here`,link tự động) khi post **chunked fallback**; ưu tiên file `.md` (không bị parse mention). *(MEDIUM)*
6. `[Secret Mgmt/Least Privilege]` Slack Bot Token chỉ scope `files:write` cần thiết; bảo vệ + rotation; không log. *(MEDIUM)*
7. `[Reliability/Integrity]` Trạng thái giao **per-target atomic** (arrayFilters status=pending) chống double-delivery khi reclaim; chỉ mark `delivered` sau khi Slack API xác nhận. *(MEDIUM)*
8. `[Audit/Monitoring]` Audit delivery/cache-hit/rerun/redaction (không log nội dung/secret) + alert `delivery_failed` & spike `fresh`. *(MEDIUM)*
9. `[Incident Response]` Runbook xoá file lộ secret trên Slack + toggle "chat-only" khi sự cố token/scope. *(MEDIUM; long-term)*
