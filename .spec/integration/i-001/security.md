---
integration: i-001
feature: review-pr-slack-azure
stage: security
status: approved
open_questions: 0
updated: 2026-06-25
---

# Asset Inventory

| Tài sản | Loại | Độ nhạy cảm | Nơi lưu | Ai truy cập |
|---------|------|-------------|---------|-------------|
| **Azure PAT (per project)** | Secret/credential | CRITICAL | MongoDB (AES-256-GCM) | Worker (giải mã lúc chạy), Skill Runner (qua ENV con) |
| **Claude API key (per project)** | Secret/credential | CRITICAL | MongoDB (AES-256-GCM) | Worker → spawn `claude -p` (ENV) |
| **Master encryption key** | Key | CRITICAL | ENV / secret file (KHÔNG ở DB) | Process bot lúc khởi động |
| **PAT đăng nhập Admin** | Credential tạm | HIGH | Không lưu (chỉ verify) | Admin API lúc login |
| **Session JWT** | Token | HIGH | httpOnly cookie (client) | Admin API |
| **Slack signing secret** | Secret | HIGH | ENV | Slack Gateway |
| **Owner identity (Azure userId/email)** | PII (định danh) | MEDIUM | MongoDB | Registry/Audit |
| **Project config (repo, model, effort, doc sources)** | Config | MEDIUM | MongoDB | Owner, Worker |
| **PR code/diff + tài liệu hệ thống (khách hàng)** | Dữ liệu private bên thứ ba | HIGH | Temp clone (ephemeral) + đi qua Claude | Worker, Skill Runner, Anthropic (3rd party) |
| **Review history / Finding** | Dữ liệu phái sinh (chứa trích đoạn code) | HIGH | MongoDB | Owner (UI), người trong Slack thread |
| **Audit log** | Log | MEDIUM | MongoDB | Nội bộ |

# Threat Model (STRIDE)

| STRIDE | Threat cụ thể | Phần tử/Trust boundary | Tác động | Mitigation | Mức |
|--------|---------------|------------------------|----------|------------|-----|
| **S** | Giả mạo Slack event POST (không từ Slack) để trigger review | Slack→Gateway boundary | Đốt token Claude, kích đọc code project bất kỳ | Verify **Slack signing secret** + timestamp ±5 phút (chống replay) | `[HIGH]` |
| **S** | Dùng PAT đánh cắp đăng nhập Admin UI | Client→Admin API | Chiếm quyền owner, đọc/sửa project nạn nhân | Verify PAT với Azure; session JWT ngắn hạn; không lưu PAT login | `[HIGH]` |
| **S** | Giả `slack_user_id` trong payload | Slack payload | Mạo danh người ra lệnh trong audit | Tin user id từ payload đã ký của Slack (sau verify signature) | `[MEDIUM]` |
| **T** | Sửa `projectId`/`ownerId` trong request Admin API (IDOR) | Client→Admin API | Truy cập/sửa project owner khác (cross-tenant) | `ownerId` lấy từ session; filter bắt buộc; trả 404 | `[CRITICAL]` |
| **T** | **Prompt injection** qua nội dung PR/diff/commit message | Untrusted data → Claude CLI | Thao túng kết quả review, lệnh ẩn cho tool, ẩn lỗ hổng | Đóng khung nội dung PR là "DỮ LIỆU KHÔNG TIN CẬY"; tách chỉ-dẫn vs dữ liệu; chạy CLI chế độ hạn chế tool (xem #12) | `[HIGH]` |
| **T** | Sửa review history/finding sau khi tạo | DB | Chối/bóp méo kết quả đã trả | History bất biến (append, `supersedes`); audit | `[MEDIUM]` |
| **R** | Chối đã ra lệnh review / đổi cấu hình | Người dùng | Không truy được ai đốt token, ai sửa secret | Audit log bất biến (ai/khi/project/PR/commit), không log giá trị secret | `[HIGH]` |
| **I** | Lộ secret qua log/error/Admin UI | Mọi tầng | Lộ PAT/Claude key → chiếm Azure/đốt tiền | Mã hoá at-rest; **write-only**; lọc secret khỏi log; lỗi an toàn (không stacktrace nhạy cảm) | `[CRITICAL]` |
| **I** | Code/tài liệu private đi qua Claude (Anthropic) | Worker→Anthropic boundary | Dữ liệu khách hàng rời biên giới tổ chức | Cô lập token theo project; thông báo/đồng ý hợp đồng (Open #1); tối thiểu hoá ngữ cảnh gửi đi | `[HIGH]` |
| **I** | Người ngoài kênh đọc kết quả review (code/tài liệu) project khác qua Slack | Slack boundary | Lộ chéo code/tài liệu | **Residual risk đã chấp nhận** (chính sách "mọi người review"); bù bằng audit + (khuyến nghị) cảnh báo owner | `[HIGH]` |
| **D** | Spam lệnh review → đầy queue, cạn token | Slack→queue | DoS dịch vụ + thiệt hại tài chính | Rate-limit per-user/period; concurrency 5; quota token/project; idempotency | `[HIGH]` |
| **D** | PR khổng lồ / repo lớn → ngốn đĩa/CPU/thời gian | Worker | Cạn tài nguyên 1 worker, treo job | Giới hạn file/diff; timeout cứng + kill; fallback diff | `[MEDIUM]` |
| **E** | User thường thao tác project owner khác (vertical/horizontal) | Admin API/Slack | Cross-tenant / nâng quyền | Ownership check mọi endpoint; không có vai trò nâng quyền ở i-001 | `[CRITICAL]` |
| **E** | Lạm dụng PAT cấu hình project để gọi Azure ngoài phạm vi review | Worker→Azure | PAT quyền rộng bị dùng sai | Khuyến nghị PAT scope tối thiểu (Code read); tài liệu hướng dẫn owner | `[MEDIUM]` |

# Attack Surface

- **Slack Events endpoint** (`POST /slack/events`): công khai Internet, nhận event — bề mặt chính cho spoofing/DoS/prompt-injection. `[HIGH]`
- **Admin API** (login + CRUD project): nhận PAT, trả/ghi cấu hình + secret — bề mặt cho IDOR/auth bypass. `[HIGH]`
- **Admin UI (React SPA):** XSS/CSRF, lưu token client. `[MEDIUM]`
- **Outbound → Azure DevOps** (PAT): clone repo (`git`) — bề mặt SSRF/injection qua URL repo cấu hình. `[MEDIUM]`
- **Outbound → spawn `claude -p`**: thực thi tiến trình con với ENV chứa key + cwd=clone — bề mặt command/arg injection + prompt injection. `[HIGH]`
- **MongoDB**: NoSQL injection nếu ghép query từ input. `[MEDIUM]`
- **Temp clone trên đĩa**: dữ liệu private tồn dư. `[MEDIUM]`

# Authentication Review

- `[HIGH]` **Đăng nhập bằng Azure PAT** (OWASP A07): PAT là bearer credential mạnh — phải xác thực qua Azure profile/Connection Data API trước khi cấp session; **không lưu PAT login**, không log. Bất kỳ PAT hợp lệ đều tạo owner (self-service — đã chốt) ⇒ **không có allowlist** → bề mặt lạm dụng rộng hơn, bù bằng rate-limit + audit + quota.
- `[HIGH]` **Định danh owner** suy từ Azure `userId/email` (ổn định khi PAT xoay vòng) — KHÔNG dùng chuỗi PAT/hash PAT làm khoá định danh.
- `[MEDIUM]` JWT session: ký HS256/RS256 với secret riêng, `exp` ngắn (vd 1–4h), `httpOnly`+`Secure`+`SameSite`, hỗ trợ logout/thu hồi.
- `[MEDIUM]` Không có MFA (PAT đã là yếu tố Azure) — chấp nhận; phụ thuộc độ mạnh chính sách PAT của tổ chức Azure.
- `[LOW]` Không có luồng password/reset (không dùng mật khẩu) → giảm bề mặt.

# SSO Review

- Không áp dụng đầy đủ SSO (OIDC/SAML) ở i-001 — đăng nhập bằng **Azure PAT** thay cho SSO.
- `[MEDIUM]` Khuyến nghị tương lai: thay PAT-login bằng **Microsoft Entra ID OAuth/OIDC** (issuer/audience/nonce/state/redirect URI validation) để tránh người dùng phải dán PAT vào UI bên thứ ba (giảm rủi ro lộ PAT). Ghi vào Open #2.

# Session Review

- `[MEDIUM]` Session fixation/hijacking: cấp JWT mới sau login; `httpOnly`+`Secure` chống đọc bằng JS; `SameSite=Lax/Strict` chống CSRF.
- `[MEDIUM]` Session revocation: JWT stateless khó thu hồi tức thời → giữ `exp` ngắn + (tuỳ) denylist jti khi logout.
- `[LOW]` Concurrent session: chấp nhận (1 owner nhiều thiết bị).

# Authorization Review

- `[CRITICAL]` (OWASP A01/API5) **Ownership-based access control**: mọi thao tác project ở Admin API phải kiểm `project.ownerId === session.ownerId`; thiếu ở 1 endpoint = cross-tenant. Bắt buộc kiểm ở **tầng repository** (không chỉ controller).
- `[HIGH]` **Slack review authz** (đã chốt: mọi người workspace): điểm chốt `authorizeReviewCommand(actor, project)` hiện trả `allow-all` — phải tồn tại như một hàm tập trung để sau siết mà không sửa luồng. Hệ quả: actor ≠ owner vẫn xem được output → residual risk chấp nhận.
- `[MEDIUM]` Function-level authz: endpoint quản trị (CRUD project, test-connection) chỉ cho session hợp lệ; Slack endpoint không cần session nhưng phải verify signature.

# Permission Scope Review

| Permission | Scope dự kiến | Scope thực tế | Rủi ro nới quyền | Mức |
|------------|---------------|---------------|------------------|-----|
| CRUD project | Chỉ project của owner | Lọc theo `ownerId` từ session | Thiếu filter → cross-tenant | `[CRITICAL]` |
| Đọc secret | Không ai (write-only) | API không bao giờ trả secret | Trả lại secret = lộ | `[CRITICAL]` |
| Ra lệnh review (Slack) | (chốt) mọi user workspace | mọi user | Đọc code/tài liệu project chéo | `[HIGH]` (residual chấp nhận) |
| Xem output thread | Người trong kênh thread | theo kênh Slack | Kênh public → lộ rộng | `[HIGH]` |
| Xem review history (UI) | Owner của project | lọc ownerId | Người khác xem trích đoạn code | `[MEDIUM]` |
| PAT Azure (project) | Tối thiểu: Code(read) + PR(read) | Do owner cấp | PAT quyền rộng bị lạm dụng | `[MEDIUM]` |

# Multi Tenant Security Review ⚠️

- `[CRITICAL]` (OWASP A01) **Tenant isolation = pool + `ownerId` filter**. Mọi truy vấn Mongo phải nhận `ownerId` bắt buộc; **cấm** query "tất cả project". Cân nhắc index/compound key gồm `ownerId` để không thể quên.
- `[HIGH]` **Shared store/queue**: collection chung (`projects`, `review_jobs`) chứa nhiều tenant → 1 lỗi filter = leak. Khuyến nghị wrapper repository ép `ownerId`, có test cross-tenant tự động.
- `[HIGH]` **Token theo project = cô lập chi phí/ngữ cảnh**: đảm bảo worker dùng ĐÚNG token của project trong job (không lẫn token project khác qua biến dùng lại) — rủi ro race khi 5 job song song. Truyền token qua biến cục bộ/closure, KHÔNG biến toàn cục.
- `[MEDIUM]` **Shared temp clone dir**: mỗi job clone vào thư mục riêng (vd theo jobId) để job này không đọc clone job khác; dọn sau xử lý.
- `[HIGH]` **Slack kênh không cô lập theo tenant**: chính sách "mọi người review" làm Slack thành kênh rò rỉ chéo — đã chấp nhận; ghi rõ là điểm yếu isolation lớn nhất.

# API Security Review

| OWASP API | Endpoint | Vấn đề | Tác động | Mức |
|-----------|----------|--------|----------|-----|
| **API1 BOLA** | `GET/PUT/DELETE /projects/:id` | Nếu không kiểm ownerId → truy cập project người khác bằng đoán id | Cross-tenant read/write | `[CRITICAL]` |
| **API2 Broken Auth** | `/auth/login`, mọi endpoint | PAT/JWT yếu hoặc không verify | Account takeover | `[HIGH]` |
| **API3 Excessive Data / Mass Assignment** | `POST/PUT /projects` | Nhận `ownerId`/`status` từ body; trả secret trong response | Privilege/secret leak | `[CRITICAL]` |
| **API4 Resource Consumption** | `/slack/events`, review | Không rate-limit → spam đốt token | DoS + tài chính | `[HIGH]` |
| **API5 Func Level Authz** | endpoint quản trị | Thiếu kiểm session | Truy cập trái phép | `[HIGH]` |
| **API8 Misconfig** | CORS/headers | CORS mở, thiếu header bảo mật | XSS/CSRF hỗ trợ | `[MEDIUM]` |

- Khắc phục chính: **allowlist field** khi tạo/sửa (không nhận `ownerId`/`status`), **không serialize secret**, ownerId từ session, rate-limit, verify Slack signature.

# Injection Risks

- `[HIGH]` **Command/Argument injection vào `claude -p`** (OWASP A03): nội dung lệnh Slack hoặc URL repo/PR ghép vào dòng lệnh/shell → escape. Khắc phục: spawn dạng **array argv** (KHÔNG qua shell `/bin/sh -c`), không nội suy chuỗi vào shell; prompt truyền qua stdin/file, không qua arg.
- `[HIGH]` **Prompt injection** (xem Threat Model T): nội dung PR điều khiển Claude. Khắc phục: đóng khung untrusted, chạy CLI với quyền tool tối thiểu (chỉ đọc repo, **không** cho phép tool ghi file/chạy lệnh tuỳ ý/network ngoài), `--permission-mode` chặt.
- `[MEDIUM]` **NoSQL injection (Mongo)**: input (tên project, prUrl) ghép vào query → object injection (`$gt`, `$where`). Khắc phục: ép kiểu string, dùng query builder tham số hoá, cấm toán tử `$` từ input.
- `[MEDIUM]` **Path traversal**: `<project>` hoặc đường dẫn doc-source cấu hình dùng để đọc file → `../`. Khắc phục: chuẩn hoá & giới hạn trong thư mục clone; allowlist glob.
- `[MEDIUM]` **Repo URL độc/SSRF** (xem #23): URL repo trỏ host nội bộ.

# XSS Risks

- `[HIGH]` (OWASP A03) **Stored XSS trong Admin UI**: tên project/mô tả/doc-source do owner nhập, hiển thị lại trong React → nếu render `dangerouslySetInnerHTML` thì XSS. Khắc phục: React auto-escape, cấm `dangerouslySetInnerHTML`, CSP.
- `[MEDIUM]` Finding/review chứa trích đoạn code render trong UI → escape, hiển thị dạng code block thuần văn bản.
- `[LOW]` Slack tự escape; dùng block-kit/mrkdwn an toàn, tránh chèn HTML.

# CSRF Risks

- `[MEDIUM]` Admin API dùng cookie JWT → cần chống CSRF: `SameSite=Lax/Strict` + anti-CSRF token cho thao tác ghi (POST/PUT/DELETE). Nếu dùng `Authorization: Bearer` (không cookie) thì CSRF giảm.
- `[LOW]` Slack endpoint không dùng cookie → không CSRF, nhưng cần verify signature.

# File Upload Risks

- Không phát hiện (i-001 không có chức năng upload file của người dùng).
- `[LOW]` Lưu ý: clone repo = "nhập file" gián tiếp → áp giới hạn kích thước, bỏ qua binary/lock/generated, không thực thi file từ repo (chỉ đọc), chống zip/path bomb khi giải nén nếu có.

# Data Protection Review

- `[CRITICAL]` (OWASP A02) **Secret (PAT/Claude key)**: mã hoá at-rest AES-256-GCM; write-only; không log; không trả API.
- `[HIGH]` **Code/tài liệu private khách hàng** đi qua Claude (bên thứ ba): data minimization — chỉ gửi file liên quan PR + tài liệu cần thiết, không gửi toàn repo nếu không cần; tài liệu hoá luồng dữ liệu cho khách (Open #1 — đồng ý/hợp đồng).
- `[MEDIUM]` **Review history chứa trích đoạn code**: kiểm soát truy cập (owner), cân nhắc retention + xoá.
- `[MEDIUM]` PII owner (email): lưu tối thiểu, không lộ qua API công khai.

# Encryption Review

- **At-rest:** `[CRITICAL]→mitigated` AES-256-GCM cho secret trong Mongo (đã chốt). Mỗi secret nên có **IV ngẫu nhiên riêng** + auth tag; lưu `{ciphertext, iv, tag, keyVersion}`.
- **In-transit:** `[HIGH]` Bắt buộc **HTTPS/TLS** cho Admin UI/API (nhận PAT), Slack (Slack yêu cầu HTTPS), Azure & Anthropic (HTTPS sẵn). Không nhận PAT qua HTTP.
- **Key management:** `[MEDIUM]` Master key ở **ENV/secret file** (đã chốt) — rủi ro: lộ ENV = giải mã toàn bộ secret. Khắc phục: hạn chế quyền đọc ENV/file (chỉ process), không in ENV ra log, thêm trường `keyVersion` để **xoay vòng khoá thủ công** (re-encrypt) sau này. Đường nâng cấp: KMS/Vault (Open #3).

# Secret Management Review

- `[CRITICAL]` Không commit secret vào code/repo; `.env` ngoài VCS.
- `[HIGH]` Secret **write-only** qua Admin UI: PUT chỉ ghi khi có giá trị mới; GET không bao giờ trả (kể cả dạng masked có thể suy luận → chỉ trả cờ "đã cấu hình").
- `[HIGH]` Truyền Claude key cho `claude -p` qua **ENV của tiến trình con** (không qua arg dòng lệnh — tránh lộ qua `ps`/log). Xoá biến sau spawn.
- `[MEDIUM]` Rotation: hỗ trợ `SecretRotated` + `keyVersion`; tài liệu quy trình xoay PAT/key khi nghi lộ.
- `[MEDIUM]` Slack signing secret, JWT secret ở ENV; không hardcode.

# Audit Review

- `[HIGH]` (OWASP A09) **Audit log lệnh review** bất biến: ai (slack user + resolved), project, PR, commit, thời điểm, skill chạy, kết quả tóm tắt, **token/chi phí** — phục vụ truy vết & kiểm soát chi phí (FRD). KHÔNG log nội dung secret.
- `[HIGH]` **Audit thay đổi cấu hình/secret** ở Admin UI: ai tạo/sửa/xoá project, rotate secret, khi nào — không log giá trị.
- `[MEDIUM]` Log bất biến (append-only); cân nhắc tách store/quyền ghi để chống tẩy xoá.

# Security Event Catalog

| Sự kiện | Có ghi log? | Có cảnh báo? | Mức |
|---------|-------------|--------------|-----|
| Login (PAT verify) thành công/thất bại | Nên có | Cảnh báo khi nhiều fail (brute PAT) | `[MEDIUM]` |
| Tạo/sửa/xoá project | Có (audit) | — | `[MEDIUM]` |
| Rotate/đổi secret | Có (không giá trị) | Cảnh báo owner | `[MEDIUM]` |
| Ra lệnh review | Có (audit + cost) | Cảnh báo khi vượt quota/rate | `[HIGH]` |
| Review thất bại / token hết credit | Có | Cảnh báo owner | `[MEDIUM]` |
| Truy cập bị từ chối (404 cross-tenant) | Nên có | Cảnh báo khi nhiều lần (dò id) | `[HIGH]` |
| Circuit breaker mở (project) | Có | Cảnh báo | `[MEDIUM]` |

# Monitoring Gaps

- `[HIGH]` Thiếu phát hiện **anomaly chi phí token** (1 user/project đột biến) → cần ngưỡng + alert (DoS tài chính).
- `[HIGH]` Thiếu phát hiện **dò id project** (nhiều 404 cross-tenant từ 1 session) → khoá/cảnh báo.
- `[MEDIUM]` Chưa có SIEM/centralized log; tối thiểu structured log + correlation id (đã nêu tech.md).
- `[MEDIUM]` Cảnh báo project lỗi cấu hình liên tục / secret hết hạn.

# Data Leakage Risks ⚠️

- `[HIGH]` (OWASP API3) **API response lộ secret/ownerId/dữ liệu nội bộ**: chỉ serialize field công khai; không trả secret, không trả project người khác.
- `[HIGH]` **Slack thread lộ code/tài liệu chéo** (chính sách "mọi người review"): residual risk chấp nhận; giảm bằng giới hạn độ dài output + cảnh báo owner khi project bị người ngoài review (khuyến nghị).
- `[HIGH]` **Code khách hàng → Anthropic**: minimization + đồng ý hợp đồng (Open #1).
- `[MEDIUM]` **Error message lộ stacktrace/secret/đường dẫn nội bộ**: lỗi trả ra Slack/UI phải sạch; chi tiết chỉ ở log nội bộ.
- `[MEDIUM]` **Temp clone tồn dư** → dữ liệu private rò qua đĩa; xoá `finally` + dọn rác.
- `[MEDIUM]` **Log chứa trích đoạn code/PII**: cân nhắc mức log + retention.

# Privilege Escalation Risks ⚠️

- `[CRITICAL]` (OWASP A01) **Horizontal**: đoán/sửa `projectId` để thao tác project owner khác (BOLA) → ownerId từ session + filter + 404.
- `[HIGH]` **Mass assignment nâng quyền**: gửi `ownerId` trong body create/update để gán project sang mình hoặc chiếm → allowlist field, gán ownerId server-side từ session.
- `[MEDIUM]` **Vertical**: i-001 không có vai trò admin toàn cục → bề mặt nâng-quyền-dọc thấp; nhưng "system maintainer" cập nhật model catalog phải tách quyền (không qua API owner).
- `[MEDIUM]` Lạm dụng PAT project (quyền rộng) để hành động Azure ngoài review → khuyến nghị PAT scope tối thiểu.

# Security Misconfiguration Risks

- `[MEDIUM]` (OWASP A05/API8) **CORS** Admin API: chỉ allow origin của Admin UI; không `*` khi có cookie credential.
- `[MEDIUM]` **Security headers**: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options/CSP frame-ancestors`, `Content-Security-Policy` cho React UI.
- `[MEDIUM]` **Cookie**: `Secure`+`HttpOnly`+`SameSite`.
- `[LOW]` Tắt verbose error/banner ở production; không expose `/debug`.
- `[MEDIUM]` **MongoDB**: bật auth, không expose ra Internet, TLS kết nối; least-privilege DB user.

# Incident Response Risks

- `[HIGH]` **Thu hồi khi lộ secret**: cần quy trình & nút **rotate PAT/Claude key** nhanh (Admin UI) + `keyVersion` để re-encrypt khi master key nghi lộ.
- `[MEDIUM]` **Emergency disable project**: status=disabled ngừng nhận lệnh ngay (đã có trạng thái) — dùng khi project bị lạm dụng.
- `[MEDIUM]` **Khoá user/kẻ lạm dụng Slack**: cần cơ chế chặn theo slack user id (denylist) khi phát hiện spam.
- `[MEDIUM]` **Breach recovery**: nếu master key lộ → re-encrypt toàn bộ secret với key mới; buộc owner rotate PAT/Claude key.

# Zero Trust Assessment

| Nguyên tắc | Hiện trạng | Khoảng trống | Mức |
|------------|------------|--------------|-----|
| Never Trust | Verify Slack signature, verify PAT, ownerId từ session | Slack "mọi người review" nới tin tưởng ở kênh Slack | `[HIGH]` |
| Always Verify | Mọi Admin request kiểm session+ownership | Cần đảm bảo kiểm ở repository layer, không chỉ controller | `[MEDIUM]` |
| Least Privilege | Token/PAT theo project; PAT scope tối thiểu (khuyến nghị) | Self-service PAT bất kỳ → không gạn lọc người tạo; PAT có thể quyền rộng | `[MEDIUM]` |
| Continuous Validation | Snapshot config + verify mỗi job | Chưa re-verify quyền actor↔project ở Slack (do chính sách mở) | `[MEDIUM]` |

# Open Security Questions

> Các câu hỏi bảo mật thuộc thiết kế (FRD #2, #3) đã **chốt** qua quyết định người dùng ⇒ `open_questions = 0`. Còn lại là **khuyến nghị/định tuyến**, KHÔNG chặn:

**Đã chốt:**
- **#3 Mã hoá secret** → AES-256-GCM, master key từ **ENV/secret file**, có `keyVersion` cho rotation. *(quyết định người dùng)*
- **#2 Định danh & tạo project** → owner = Azure `userId/email` từ profile API; **bất kỳ PAT hợp lệ** đều tạo & sở hữu project (self-service, không allowlist). Bù rủi ro bằng rate-limit + quota + audit. *(quyết định người dùng)*
- **#8 Slack authz** → **mọi người trong workspace** review mọi project; residual data-leakage chéo **được chấp nhận**; điểm chốt `authorizeReviewCommand` giữ sẵn để siết sau. *(quyết định người dùng)*

**Khuyến nghị / chuyển nghiệp vụ (không chặn bảo mật):**
1. `[→ nghiệp vụ/pháp lý]` Đồng ý/hợp đồng cho code & tài liệu khách hàng đi qua Anthropic (bên thứ ba) — FRD #7; data minimization là bắt buộc kỹ thuật.
2. `[→ tương lai]` Thay PAT-login bằng **Entra ID OIDC** để người dùng không dán PAT vào UI (giảm rủi ro lộ PAT).
3. `[→ vận hành]` Nâng cấp master key sang **KMS/Vault** khi lên production diện rộng.
4. `[→ nghiệp vụ #9]` Phạm vi duy nhất tên project: vì Slack cho mọi người resolve `<project>`, khuyến nghị **tên project duy nhất toàn hệ thống** (hoặc resolve theo `owner/project`) để tránh nhầm lẫn/đọc nhầm repo.

# Security Recommendations

- `[Ưu tiên 1 — Broken Access Control / Tenant]` Ép `ownerId` ở **repository layer** cho mọi truy vấn project; 404 cho tài nguyên người khác; test cross-tenant tự động. *(CRITICAL, quick-win)*
- `[Ưu tiên 2 — Data Leakage / Secret]` Secret **write-only** + AES-256-GCM (IV riêng, auth tag, keyVersion); không serialize secret; lọc secret khỏi log; truyền Claude key qua ENV tiến trình con (không qua arg). *(CRITICAL, quick-win)*
- `[Ưu tiên 3 — Privilege Escalation / API3]` Allowlist field create/update (không nhận `ownerId`/`status`); gán ownerId server-side. *(CRITICAL, quick-win)*
- `[Ưu tiên 4 — Injection]` Spawn `claude`/`git` dạng argv (không shell); prompt qua stdin/file; CLI chạy quyền tool tối thiểu (đọc-only, không network/ghi tuỳ ý) chống prompt injection; query Mongo tham số hoá. *(HIGH)*
- `[Ưu tiên 5 — Auth/Transport]` Verify Slack signing secret + timestamp; HTTPS bắt buộc; JWT ngắn hạn httpOnly+Secure+SameSite; verify PAT với Azure, không lưu/không log. *(HIGH)*
- `[Ưu tiên 6 — DoS / Cost]` Rate-limit per-user/period + quota token/project + concurrency 5 + idempotency; alert anomaly chi phí & dò id project. *(HIGH)*
- `[Ưu tiên 7 — Data Lifecycle]` Xoá temp clone trong `finally` + dọn rác mồ côi; mỗi job clone thư mục riêng; minimization dữ liệu gửi Claude. *(MEDIUM, long-term hoá: KMS/Vault, Entra OIDC)*
</content>
