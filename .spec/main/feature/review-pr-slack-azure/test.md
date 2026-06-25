---
feature: review-pr-slack-azure
stage: test
status: approved
source: i-001
updated: 2026-06-25
---

# Phân Tích Requirement

Phạm vi: Slack bot `@tieu-nhi <project> review <pr-url>` + Web Admin UI (ReactJS). Đối tượng: (1) Slack command parse/ack/resolve/validate/async/post; (2) Admin API/UI login PAT + CRUD project owner-scoped + secret write-only + test-connection + validate; (3) Review pipeline fetch/clone/map skill/`claude -p`/aggregate/post; (4) Cross-cutting: idempotency `(project,pr,commit)`, tenant isolation, mã hoá secret, audit, rate-limit, resiliency, prompt/command injection. Mặc định model/effort `claude-sonnet-4-6`/`medium`. *(nguồn i-001)*

# Test Conditions

Parsing (cú pháp/normalize link/thiếu tham số); resolve project (tồn tại/hoa-thường/trùng tên/disabled); validate PR (host/`pullrequest/id`/repo mismatch); auth Admin (PAT hợp lệ/sai; định danh owner ổn định); ownership/IDOR; secret write-only/mã hoá/rotation; validate model/effort/repo/duplicate; idempotency/concurrency (double-submit/2 worker/>5 job/đổi config/crash); file→skill mapping; giới hạn an toàn (≤50 file/≤5000 dòng/rate-limit); integration failure; output Slack; audit & cost; security (injection/XSS/CSRF/mass assignment); data lifecycle; state lifecycle.

# Test Scenarios

SC-1 happy path; SC-2 PR chỉ tài liệu→skill nghiệp vụ/kiến trúc; SC-3 PR code+nhạy cảm→review-code+bao-mat; SC-4 double-submit→1 review; SC-5 nhiều project song song ≤5, token cô lập; SC-6 owner A ⊄ project B; SC-7 PAT hết hạn→lỗi an toàn; SC-8 worker crash→reclaim; SC-9 commit mới sau review→ghi commit đã review; SC-10 prompt injection→không bị điều khiển.

# Test Cases

| ID | Bước | Dữ liệu | Kết quả mong đợi | Kỹ thuật |
|----|------|---------|------------------|----------|
| TC-01 | Gõ lệnh hợp lệ, chờ ack+kết quả | `@tieu-nhi LMS review .../pullrequest/123` | Ack<3s; post tóm tắt theo severity + chi tiết file/skill + commit hash | Use Case |
| TC-02 | Lệnh thiếu pr-url | `@tieu-nhi LMS review` | Hướng dẫn cú pháp, không tạo job | Error Guessing |
| TC-04 | Link bọc `<...>`+query | `...pullrequest/123?_a=files>` | Normalize, parse đúng id 123 | EP |
| TC-05 | Project lạ | `@tieu-nhi XYZ review <link>` | Báo "project chưa cấu hình" | EP |
| TC-06 | Hoa-thường | `@tieu-nhi lms ...` | Resolve case-insensitive/gợi ý | EP |
| TC-07 | PR repo khác project | repo B, project↔repo A | Từ chối mismatch | Decision Table |
| TC-09/10 | Login PAT hợp lệ/sai | PAT | Hợp lệ→chỉ project owner; sai→lỗi an toàn | Use Case/Negative |
| TC-11/12/13 | Tạo project secret+model | model hợp lệ/rỗng/lạ | OK (secret ẩn, test-conn trước lưu); rỗng→default; lạ→chặn | Use Case/Decision |
| TC-14 | GET project có secret | — | Trả cờ "đã cấu hình", KHÔNG trả secret | Security |
| TC-15 | Owner B GET project A | session B | **404**, không lộ tồn tại | BOLA |
| TC-16 | Gõ lại cùng PR/commit đang chạy | cùng lệnh | Không job mới; báo "đang chạy" | Concurrency |
| TC-17 | 6 lệnh khác project | 6 job | ≤5 song song; thứ 6 xếp hàng | Risk-Based |
| TC-18/19 | PR 60 file / 6 lệnh/10’ | — | Cắt 50 file+báo; thứ 6 bị rate-limit | BVA |
| TC-20 | PR rỗng | 0 file | "không có gì để review" | Edge |

# Boundary Values

| Trường | Min | Max | Max+1 | Kết quả |
|--------|-----|-----|-------|---------|
| File/PR | 1 | 50 | 51 | ≤50 đủ; 51→cắt+báo |
| Dòng diff/PR | 1 | 5.000 | 5.001 | >5.000→ưu tiên+báo cắt |
| Rate-limit/người/10’ | 1 | 5 | 6 | thứ 6 chặn |
| Concurrency | 1 | 5 | 6 | thứ 6 xếp hàng |
| Lease timeout | trong hạn | tại hạn | quá hạn | quá hạn→reclaim |

# Equivalence Partitions

PR URL hợp lệ (`dev.azure.com/.../pullrequest/<id>`) vs sai (host khác/thiếu id/rỗng); project active+owner-scope vs không tồn tại/disabled; model∈catalog vs lạ/rỗng→default; effort low/medium/high vs khác; loại file code/nhạy cảm/test/doc vs binary/lock (bỏ qua); repo URL hợp lệ vs SSRF/không quyền.

# Decision Table

| Rule | Code | Nhạy cảm | Test | Doc NV | Doc KT | Binary | Hành động |
|------|------|----------|------|--------|--------|--------|-----------|
| R1 | Y | N | N | N | N | N | review-code |
| R2 | Y | Y | N | N | N | N | review-code + bao-mat-he-thong |
| R3 | N | N | Y | N | N | N | kiem-thu-phan-mem |
| R4 | N | N | N | Y | N | N | phan-tich-nghiep-vu |
| R5 | N | N | N | N | Y | N | thiet-ke-he-thong |
| R6 | — | — | — | — | — | Y | Bỏ qua (ghi chú) |
| R7 | N | N | N | N | N | N | mặc định review-code |

# State Transition Matrix

| State | Event | Kế tiếp | Hợp lệ? |
|-------|-------|---------|---------|
| none | command hợp lệ | Queued | ✅ |
| Queued | claim | Running | ✅ |
| Queued | trùng đang chạy | DuplicateRejected | ✅ |
| Running | post xong | Completed | ✅ |
| Running | lỗi | Failed | ✅ |
| Running | crash quá lease | Queued (reclaim) | ✅ |
| Completed | lệnh lại cùng commit | Completed mới (supersedes) | ✅ |
| Completed | claim lại | — | ❌ |
| Queued | project xoá/disabled | Cancelled | ✅ |
| Project disabled | ra lệnh | từ chối | ✅(chặn) |

# Permission Matrix

| Role | Create | View | Edit | Delete | Run review | View history | Đọc secret |
|------|--------|------|------|--------|-----------|--------------|-----------|
| Owner (của project) | ✅ | ✅(của mình) | ✅ | ✅ | ✅ | ✅(của mình) | ❌ write-only |
| Owner khác / User Slack | ✅(của họ)/— | ❌ 404 | ❌ | ❌ | ✅(chính sách mở) | ❌ | ❌ |

> `[HIGH]` Run review ✅ cho non-owner = residual risk #8 đã chấp nhận.

# Negative Test Cases

`[CRITICAL]` mass assignment (`ownerId`/`status` trong body→bỏ qua); `[CRITICAL]` IDOR (404 đồng nhất); `[CRITICAL]` NoSQL injection (`{"$ne":null}`→ép string); `[HIGH]` command injection (`; rm -rf`→argv không shell); `[HIGH]` prompt injection (commit/diff chèn chỉ dẫn→không điều khiển/không lộ secret); `[HIGH]` XSS lưu trữ (`<script>`→escape); `[MEDIUM]` Unicode/emoji/khoảng trắng; `[MEDIUM]` PR url cực dài; `[MEDIUM]` secret rỗng→chặn.

# Edge Cases

`[HIGH]` commit mới sau enqueue→giữ commit snapshot; `[HIGH]` đổi config khi job chạy→dùng snapshot; `[MEDIUM]` diff generated/lock/binary→bỏ qua; `[MEDIUM]` thiếu tài liệu→ghi chú "thiếu đối chiếu"; `[MEDIUM]` 2 owner trùng tên LMS→resolve theo #9; `[MEDIUM]` model deprecate→báo lỗi cấu hình; `[LOW]` mention không phải lệnh→help.

# API Test Cases

`[CRITICAL]` GET project owner khác→404, schema không rò ownerId/secret; `[CRITICAL]` response không chứa secret (API3); `[HIGH]` thiếu auth→401; `[HIGH]` Slack thiếu chữ ký→401, challenge đúng; `[HIGH]` idempotency enqueue 2 lần→1 job; `[MEDIUM]` `/reviews` phân trang, không trả project khác; `[MEDIUM]` trùng tên/repo→409; `[MEDIUM]` test-connection pass/fail từng phần không lộ giá trị.

# Security Test Cases

`[CRITICAL]` Broken Access Control mọi endpoint (A01/API1); `[CRITICAL]` secret không xuất hiện ở response/log/error/Slack/arg (A02); `[HIGH]` Slack signature+timestamp chống replay; `[HIGH]` định danh owner ổn định khi PAT xoay vòng (A07); `[HIGH]` prompt injection→tool tối thiểu; `[MEDIUM]` JWT hết hạn/logout; CORS chỉ origin UI; token cô lập 5 job song song.

# Concurrency Test Cases

`[HIGH]` double-submit→1 job (atomic+unique index); `[HIGH]` 2 worker claim→1 thắng; `[HIGH]` crash→reclaim idempotent (không nhân đôi/đốt token đôi); `[MEDIUM]` >5 job→tối đa 5 FIFO; `[MEDIUM]` đổi config→snapshot bảo toàn; `[MEDIUM]` xoá project→huỷ job chờ.

# Integration Test Cases

`[HIGH]` Azure timeout/500→retry→fail+báo; `[HIGH]` clone fail/repo lớn→fallback diff; `[HIGH]` Claude treo→kill+partial; `[HIGH]` token hết credit→báo+CB theo project; `[MEDIUM]` Slack post fail→history trước, retry; `[HIGH]` Mongo gián đoạn→ack fail an toàn; `[MEDIUM]` repo URL nội bộ (SSRF)→chặn.

# Regression Risks

| Hạng mục | Lý do | Risk |
|----------|-------|------|
| `.claude/skills/*` | đổi skill→đổi output | `[HIGH]` pin+snapshot version |
| Registry + mã hoá secret | mọi review+Admin | `[HIGH]` |
| Slack parser | mọi lệnh tương lai | `[MEDIUM]` |
| Azure client (PAT) | PR+clone+login | `[HIGH]` |
| Claude CLI version | mọi skill run | `[HIGH]` pin version |
| DB-queue claim/lease | toàn bộ async | `[HIGH]` test kỹ |

# Missing Test Coverage

`[MEDIUM]` #9 tên project duy nhất chưa chốt (test 2 nhánh); `[MEDIUM]` token tối đa/PR cụ thể; `[MEDIUM]` đồng ý dữ liệu qua Anthropic (#7) là pháp lý (checklist); `[MEDIUM]` retention history/audit; `[LOW]` lệnh phụ help/status/cancel.

# Dự Đoán Bug Tiềm Ẩn

`[CRITICAL]` quên filter ownerId 1 endpoint→leak; `[CRITICAL]` secret lọt log/error/arg; `[HIGH]` idempotency check-then-insert thay unique index→trùng; `[HIGH]` token mix-up qua biến global; `[HIGH]` không snapshot config/skill version; `[HIGH]` clone không xoá khi lỗi; `[MEDIUM]` parse markdown skill sai severity; `[MEDIUM]` normalize link sai id; `[MEDIUM]` rate-limit bypass biến thể.

# Khuyến Nghị Kiểm Thử

1. `[Risk-Based]` Ưu tiên bảo mật cô lập tenant + secret (IDOR/write-only/mass assignment/token mix-up) — CRITICAL chặn release.
2. Concurrency & idempotency (double-submit/2 worker/reclaim/>5).
3. Integration resiliency + lưu history trước post Slack.
4. Parsing & resolve project.
5. Giới hạn an toàn & cost.
Lỗ hổng spec (không chặn): #9 tên project, token tối đa/PR, retention, lệnh phụ.

# E2E Locators

> Mục tiêu auto e2e: Web Admin UI (ReactJS). Ưu tiên `data-testid` ổn định. Không sinh code Playwright/Cypress.

| Element / Mục đích | data-testid | Màn hình | Ghi chú |
|--------------------|-------------|----------|---------|
| Ô nhập PAT | `login-pat-input` | Login | password, no autocomplete |
| Nút đăng nhập | `login-submit-btn` | Login | |
| Lỗi đăng nhập | `login-error-msg` | Login | không lộ PAT |
| Danh sách project | `project-list` | Dashboard | chỉ của owner |
| Dòng project | `project-row-{projectId}` | Dashboard | |
| Nút tạo project | `project-create-btn` | Dashboard | |
| Form project | `project-form` | Tạo/Sửa | |
| Ô tên project | `project-name-input` | Form | |
| Ô repo URL | `project-repo-input` | Form | |
| Ô Azure PAT | `project-pat-input` | Form | write-only |
| Ô Claude key | `project-claudekey-input` | Form | write-only |
| Chọn model | `project-model-select` | Form | từ catalog |
| Chọn effort | `project-effort-select` | Form | low/medium/high |
| Nguồn tài liệu bổ sung | `project-docsources-input` | Form | |
| Nút test-connection | `project-testconn-btn` | Form | trước khi lưu |
| Kết quả test-connection | `project-testconn-result` | Form | pass/fail từng phần |
| Nút lưu | `project-save-btn` | Form | |
| Nút xoá | `project-delete-btn-{projectId}` | Dashboard | confirm |
| Cờ secret đã cấu hình | `project-secret-configured-flag` | Form sửa | thay giá trị |
| Lỗi validation | `project-form-error-{field}` | Form | model/effort/repo/duplicate |
| Bảng lịch sử review | `review-history-table` | Detail | phân trang |
| Dòng lịch sử | `review-history-row-{jobId}` | Detail | commit hash + severity |
| Badge trạng thái | `review-status-badge-{jobId}` | Detail | Queued/Running/Completed/Failed |
| Thông báo 404/từ chối | `access-denied-msg` | Mọi trang | đồng nhất |
</content>
