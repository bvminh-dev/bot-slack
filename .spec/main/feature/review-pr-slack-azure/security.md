---
feature: review-pr-slack-azure
stage: security
status: approved
source: i-001
updated: 2026-06-25
---

# Asset Inventory

| Tài sản | Độ nhạy cảm | Nơi lưu | Truy cập |
|---------|-------------|---------|----------|
| Azure PAT / Claude API key (per project) | CRITICAL | MongoDB (AES-256-GCM) | Worker (giải mã), Skill Runner (ENV con) |
| Master encryption key | CRITICAL | ENV/secret file (không ở DB) | Process bot |
| PAT login (tạm), Session JWT, Slack signing secret | HIGH | không lưu PAT / cookie / ENV | Admin API, Gateway |
| Owner identity (Azure userId/email) | MEDIUM (PII) | MongoDB | Registry/Audit |
| PR code/diff + tài liệu khách hàng | HIGH | temp clone (ephemeral) + qua Anthropic | Worker, 3rd party |
| Review history/Finding (trích đoạn code) | HIGH | MongoDB | Owner (UI), Slack thread |

# Threat Model (STRIDE)

| STRIDE | Threat | Tác động | Mitigation | Mức |
|--------|--------|----------|------------|-----|
| S | Giả Slack event | đốt token, đọc code project bất kỳ | verify signing secret + timestamp | `[HIGH]` |
| S | PAT đánh cắp login | chiếm quyền owner | verify PAT Azure, JWT ngắn hạn | `[HIGH]` |
| T | IDOR sửa projectId/ownerId | cross-tenant | ownerId từ session, filter, 404 | `[CRITICAL]` |
| T | Prompt injection từ PR | thao túng review/ẩn lỗ hổng | đóng khung untrusted, tool tối thiểu | `[HIGH]` |
| R | Chối lệnh/đổi config | mất truy vết | audit bất biến (không log secret) | `[HIGH]` |
| I | Lộ secret log/error/UI | chiếm Azure/đốt tiền | mã hoá, write-only, lọc log | `[CRITICAL]` |
| I | Code khách hàng → Anthropic | dữ liệu rời tổ chức | cô lập token, minimization, đồng ý | `[HIGH]` |
| I | Slack lộ output project chéo | lộ code/tài liệu | residual chấp nhận + audit/cảnh báo | `[HIGH]` |
| D | Spam review | DoS + tài chính | rate-limit, concurrency 5, quota, idempotency | `[HIGH]` |
| E | Thao tác project owner khác | cross-tenant/nâng quyền | ownership check mọi tầng | `[CRITICAL]` |

# Attack Surface

Slack Events endpoint (public, spoof/DoS/prompt-injection) `[HIGH]`; Admin API (PAT/IDOR) `[HIGH]`; Admin UI React (XSS/CSRF) `[MEDIUM]`; outbound git clone (SSRF qua repo URL) `[MEDIUM]`; spawn `claude -p` (command/arg + prompt injection) `[HIGH]`; MongoDB (NoSQL injection) `[MEDIUM]`; temp clone (tồn dư) `[MEDIUM]`.

# Authentication Review

- `[HIGH]` Login bằng Azure PAT (A07): verify với Azure profile API; **không lưu/không log PAT**. Self-service (bất kỳ PAT hợp lệ tạo owner) → không allowlist → bù rate-limit+quota+audit.
- `[HIGH]` Owner = Azure `userId/email` (ổn định khi PAT xoay vòng), không dùng chuỗi PAT làm khoá.
- `[MEDIUM]` JWT: ký, `exp` ngắn, httpOnly+Secure+SameSite, logout/thu hồi. Không MFA (PAT là yếu tố Azure).

# SSO Review

Không dùng SSO ở i-001 (PAT thay thế). `[MEDIUM]` Khuyến nghị tương lai: Entra ID OIDC (issuer/audience/nonce/state/redirect validation) thay PAT-login để giảm rủi ro lộ PAT.

# Session Review

`[MEDIUM]` Cấp JWT mới sau login; httpOnly+Secure chống đọc JS; SameSite chống CSRF; `exp` ngắn (revocation khó với JWT stateless → denylist jti khi logout). `[LOW]` concurrent session chấp nhận.

# Authorization Review

- `[CRITICAL]` (A01/API5) Ownership check `project.ownerId===session.ownerId` ở **repository layer**, không chỉ controller.
- `[HIGH]` Slack review authz (chốt: mọi người) qua hàm tập trung `authorizeReviewCommand` (hiện allow-all) để siết sau; actor≠owner vẫn xem output (residual chấp nhận).

# Permission Scope Review

| Permission | Scope | Rủi ro | Mức |
|------------|-------|--------|-----|
| CRUD project | chỉ owner (filter ownerId) | thiếu filter → cross-tenant | `[CRITICAL]` |
| Đọc secret | không ai (write-only) | trả lại = lộ | `[CRITICAL]` |
| Ra lệnh review Slack | mọi user (chốt) | đọc code/tài liệu chéo | `[HIGH]` residual |
| Xem history UI | owner | trích đoạn code | `[MEDIUM]` |
| PAT Azure project | tối thiểu Code/PR read | lạm dụng nếu quyền rộng | `[MEDIUM]` |

# Multi Tenant Security Review ⚠️

- `[CRITICAL]` Pool + `ownerId` filter bắt buộc; cấm query "all"; compound key gồm ownerId.
- `[HIGH]` Worker 5 job song song phải dùng đúng token project qua biến cục bộ/closure (không global) — chống lẫn token.
- `[MEDIUM]` Mỗi job clone thư mục riêng (theo jobId), dọn sau.
- `[HIGH]` Slack kênh không cô lập tenant (chính sách mở) = điểm yếu isolation lớn nhất — đã chấp nhận.

# API Security Review

| OWASP API | Vấn đề | Mức |
|-----------|--------|-----|
| API1 BOLA | `:id` không kiểm ownerId → cross-tenant | `[CRITICAL]` |
| API2 Auth | PAT/JWT yếu/không verify | `[HIGH]` |
| API3 Excessive/Mass Assign | nhận ownerId/status từ body; trả secret | `[CRITICAL]` |
| API4 Resource | không rate-limit → spam | `[HIGH]` |
| API5 Func Authz | thiếu kiểm session | `[HIGH]` |
| API8 Misconfig | CORS/header | `[MEDIUM]` |

Khắc phục: allowlist field, không serialize secret, ownerId server-side, rate-limit, verify Slack signature.

# Injection Risks

- `[HIGH]` Command/arg injection vào `claude`/`git` → spawn dạng **argv** (không shell), prompt qua stdin/file.
- `[HIGH]` Prompt injection → đóng khung untrusted, CLI quyền tool tối thiểu (đọc-only, không network/ghi tuỳ ý), permission-mode chặt.
- `[MEDIUM]` NoSQL injection Mongo → ép kiểu, cấm toán tử `$` từ input.
- `[MEDIUM]` Path traversal qua project/doc-source → chuẩn hoá, giới hạn trong clone, allowlist glob.

# XSS Risks

- `[HIGH]` Stored XSS Admin UI (tên/mô tả/doc-source) → React auto-escape, cấm `dangerouslySetInnerHTML`, CSP.
- `[MEDIUM]` Finding render code → escape, code block thuần.
- `[LOW]` Slack dùng block-kit/mrkdwn an toàn.

# CSRF Risks

`[MEDIUM]` Cookie JWT → SameSite + anti-CSRF token cho ghi; nếu Bearer header thì CSRF giảm. `[LOW]` Slack endpoint không cookie.

# File Upload Risks

Không phát hiện (không có upload). `[LOW]` Clone repo = nhập file gián tiếp → giới hạn kích thước, bỏ binary/lock, chỉ đọc không thực thi.

# Data Protection Review

- `[CRITICAL]` (A02) Secret mã hoá at-rest, write-only, không log/không trả API.
- `[HIGH]` Code/tài liệu khách hàng qua Claude → minimization (chỉ file liên quan + tài liệu cần), đồng ý hợp đồng.
- `[MEDIUM]` History chứa trích đoạn code → kiểm soát truy cập + retention.

# Encryption Review

- At-rest: AES-256-GCM cho secret (IV riêng + auth tag, lưu `{ciphertext,iv,tag,keyVersion}`).
- In-transit: `[HIGH]` HTTPS/TLS bắt buộc (Admin/Slack/Azure/Anthropic); không nhận PAT qua HTTP.
- Key mgmt: `[MEDIUM]` master key ở ENV/secret file → hạn chế quyền đọc, không in log, `keyVersion` cho rotation thủ công; đường nâng cấp KMS/Vault.

# Secret Management Review

- `[CRITICAL]` Không commit secret; `.env` ngoài VCS.
- `[HIGH]` Write-only qua UI (GET chỉ trả cờ "đã cấu hình"); truyền Claude key qua ENV tiến trình con (không qua arg → tránh lộ `ps`/log).
- `[MEDIUM]` Rotation `SecretRotated` + `keyVersion`; Slack/JWT secret ở ENV.

# Audit Review

- `[HIGH]` (A09) Audit lệnh review bất biến: ai/project/PR/commit/skill/kết quả/**chi phí token**; không log secret.
- `[HIGH]` Audit thay đổi cấu hình/secret (không giá trị).
- `[MEDIUM]` Append-only, cân nhắc tách store/quyền chống tẩy xoá.

# Security Event Catalog

| Sự kiện | Log | Cảnh báo | Mức |
|---------|-----|----------|-----|
| Login PAT thành/bại | nên | nhiều fail (brute PAT) | `[MEDIUM]` |
| CRUD project / rotate secret | có | cảnh báo owner (rotate) | `[MEDIUM]` |
| Ra lệnh review | có + cost | vượt quota/rate | `[HIGH]` |
| 404 cross-tenant (dò id) | nên | nhiều lần từ 1 session | `[HIGH]` |
| Circuit breaker mở | có | cảnh báo | `[MEDIUM]` |

# Monitoring Gaps

`[HIGH]` anomaly chi phí token; `[HIGH]` phát hiện dò id project (nhiều 404); `[MEDIUM]` thiếu SIEM (tối thiểu structured log + correlation id); `[MEDIUM]` cảnh báo config lỗi/secret hết hạn.

# Data Leakage Risks ⚠️

- `[HIGH]` (API3) Response lộ secret/ownerId/project khác → serialize field công khai.
- `[HIGH]` Slack thread lộ chéo (chính sách mở) → residual + giới hạn output + cảnh báo owner.
- `[HIGH]` Code → Anthropic → minimization + đồng ý.
- `[MEDIUM]` Error message sạch (không stacktrace/secret); temp clone xoá finally; log code/PII có retention.

# Privilege Escalation Risks ⚠️

- `[CRITICAL]` Horizontal BOLA (đoán projectId) → ownerId session + filter + 404.
- `[HIGH]` Mass assignment gửi ownerId → allowlist field, gán server-side.
- `[MEDIUM]` Vertical thấp (không role admin toàn cục); maintainer catalog tách quyền; PAT scope tối thiểu.

# Security Misconfiguration Risks

`[MEDIUM]` CORS chỉ origin UI (không `*` với cookie); security headers (HSTS/CSP/X-Frame/X-Content-Type); cookie Secure+HttpOnly+SameSite; MongoDB bật auth+TLS+least-privilege, không expose Internet. `[LOW]` tắt verbose error production.

# Incident Response Risks

`[HIGH]` Nút rotate PAT/Claude key nhanh + `keyVersion` re-encrypt khi master key lộ; `[MEDIUM]` emergency disable project; denylist slack user lạm dụng; breach recovery (re-encrypt + buộc rotate).

# Zero Trust Assessment

| Nguyên tắc | Khoảng trống | Mức |
|------------|--------------|-----|
| Never Trust | Slack "mọi người review" nới tin tưởng ở kênh | `[HIGH]` |
| Always Verify | đảm bảo kiểm ownership ở repository layer | `[MEDIUM]` |
| Least Privilege | self-service PAT bất kỳ; PAT có thể quyền rộng | `[MEDIUM]` |
| Continuous Validation | chưa re-verify actor↔project ở Slack (chính sách mở) | `[MEDIUM]` |

# Open Security Questions

Đã chốt (⇒ open_questions=0): **#3** AES-256-GCM + master key ENV + keyVersion; **#2** owner=Azure userId/email, self-service bất kỳ PAT hợp lệ (không allowlist, bù rate-limit/quota/audit); **#8** mọi người review mọi project (residual data-leakage chấp nhận, giữ `authorizeReviewCommand`).

Khuyến nghị/định tuyến (không chặn): `[→nghiệp vụ/pháp lý]` đồng ý dữ liệu qua Anthropic (#7) + minimization; `[→tương lai]` Entra ID OIDC thay PAT-login; `[→vận hành]` nâng KMS/Vault; `[→nghiệp vụ #9]` tên project duy nhất toàn hệ thống (Slack mọi người resolve).

# Security Recommendations

1. `[Access Control/Tenant]` ép ownerId ở repository layer; 404 cross-tenant; test cross-tenant. *(CRITICAL, quick-win)*
2. `[Data Leakage/Secret]` write-only + AES-256-GCM (IV/tag/keyVersion); không serialize secret; lọc log; Claude key qua ENV con. *(CRITICAL)*
3. `[Priv Esc/API3]` allowlist field create/update; ownerId server-side. *(CRITICAL)*
4. `[Injection]` spawn argv (không shell); prompt stdin/file; CLI quyền tool tối thiểu; Mongo tham số hoá. *(HIGH)*
5. `[Auth/Transport]` verify Slack signature+timestamp; HTTPS; JWT ngắn hạn; verify PAT không lưu/log. *(HIGH)*
6. `[DoS/Cost]` rate-limit+quota+concurrency 5+idempotency; alert anomaly cost & dò id. *(HIGH)*
7. `[Lifecycle]` xoá clone finally + dọn mồ côi; clone riêng theo job; minimization gửi Claude. *(MEDIUM; long-term: KMS/Vault, Entra OIDC)*
</content>
