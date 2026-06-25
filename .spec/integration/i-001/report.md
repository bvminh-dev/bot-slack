---
integration: i-001
feature: review-pr-slack-azure
stage: report
status: draft
open_questions: 0
updated: 2026-06-25
---

# Tóm Tắt Lần Chạy

**Phạm vi:** thực thi test cho i-001 (Slack bot review PR Azure + Admin UI). **Ngày chạy:** 2026-06-25 (lần 2 — sau bugfix BUG-01..05 từ `/tn-review`).

Chạy thật **26 unit test logic thuần** (node:test) + **build/typecheck** backend & React (đều EXIT 0). So với lần 1: thêm 5 test (TC-18 giới hạn file/bỏ binary/map skill ở ContextBuilder + cờ `IntegrationError.retryable`). Các luồng phụ thuộc hạ tầng (MongoDB, Azure PAT thật, Claude API, Slack workspace) và **toàn bộ E2E UI** vẫn **BLOCKED** do không có môi trường runtime — đánh dấu trung thực, KHÔNG báo PASS giả.

**Kết luận go/no-go:** ⚠️ **NO-GO cho release** ở thời điểm này. Logic thuần xanh, build sạch, 5 bug từ review đã sửa + tái kiểm bằng test/build; nhưng các đường **IDOR/tenant isolation, idempotency/concurrency, tích hợp Azure/Claude/Slack** CHƯA chạy thật (thiếu hạ tầng) → chưa đủ cơ sở chứng nhận release.

| Chỉ số | Unit | Functional (TC) | E2E | Tổng |
|--------|------|------------------|-----|------|
| Tổng case | 26 | 12 | 24 | 62 |
| PASS | 26 | 9* | 0 | 35 |
| FAIL | 0 | 0 | 0 | 0 |
| BLOCKED (chưa chạy được) | 0 | 3 | 24 | 27 |

> *9 functional "PASS" = TC được phủ bằng unit/logic test thật: TC-01(parse), 02, 03, 04, 08, 12, 13, **18**, 19. Còn lại cần hạ tầng → BLOCKED.

# Môi Trường & Runner

- **Stack:** Node.js + TypeScript (backend), React + Vite (web-admin).
- **Lệnh đã chạy:**
  - `npx tsc -p tsconfig.json` → **EXIT 0** (backend build + emit `dist/`).
  - `npx tsc --noEmit` (web-admin) → **EXIT 0** (React typecheck — không đổi sau bugfix).
  - `node --test dist/__tests__/` → **26 pass / 0 fail** (unit logic thuần).
- **E2E:** **chưa thực thi** — Admin UI chưa khởi chạy trên trình duyệt (không có môi trường + backend cần MongoDB). Đánh giá locator ở mức **đối chiếu mã nguồn**.
- **Thiếu để chạy đầy đủ:** MongoDB đang chạy; `.env` (`SECRET_MASTER_KEY`, `JWT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `MAX_ATTEMPTS`, `RETRY_BACKOFF_MS`); Azure PAT + Claude API key thật; Claude Code CLI cài đặt.

# Kết Quả Theo Test Case

| Case ID | Loại | Bước tóm tắt | Dữ liệu vào | Expected | Actual | Trạng thái | Mức |
|---------|------|--------------|-------------|----------|--------|------------|-----|
| TC-01 (parse) | unit | parse lệnh hợp lệ | `LMS review .../pullrequest/123` | project=LMS, prId=123 | đúng | **PASS** | — |
| TC-01 (full review flow) | func | review E2E qua Slack | PR thật | ack<3s + post severity | chưa chạy (cần Slack/Azure/Claude/Mongo) | **BLOCKED** | `[HIGH]` |
| TC-02 | unit | thiếu pr-url | `LMS review` | ném lỗi cú pháp | đúng | **PASS** | — |
| TC-03 | unit | sai cú pháp | `review LMS <link>` | hướng dẫn cú pháp | đúng | **PASS** | — |
| TC-04 | unit | link bọc `<...>`+query | `<...pullrequest/123?_a=files\|PR>` | parse prId=123 | đúng | **PASS** | — |
| TC-05 | func | project lạ | `XYZ review <link>` | báo "chưa cấu hình" | logic có; chưa chạy (cần Mongo) | **BLOCKED** | `[MEDIUM]` |
| TC-06 | func | hoa-thường | `lms ...` | resolve case-insensitive | **đã sửa BUG-04** (nameLower); chưa chạy (cần Mongo) | **BLOCKED** | `[MEDIUM]` |
| TC-07 | func | PR repo khác project | repo B/project A | từ chối mismatch | logic so repoUrl (mã); chưa chạy | **BLOCKED** | `[HIGH]` |
| TC-08 | unit | sai host | `github.com/...` | ném lỗi | đúng | **PASS** | — |
| TC-09/10 | func | login PAT hợp lệ/sai | PAT | session/lỗi an toàn | verifyPatIdentity (mã); chưa chạy (cần Azure) | **BLOCKED** | `[HIGH]` |
| TC-11 | func | tạo project | secret+model | tạo OK, secret ẩn | logic (mã); chưa chạy (cần Mongo) | **BLOCKED** | `[HIGH]` |
| TC-12 | unit | model/effort rỗng | "","" | default sonnet/medium | đúng | **PASS** | — |
| TC-13 | unit | model không hợp lệ | gpt-4 | ném lỗi | đúng | **PASS** | — |
| TC-14 | func | GET project có secret | — | KHÔNG trả secret | toPublicView không serialize secret (mã); chưa chạy | **BLOCKED** | `[CRITICAL]` |
| TC-15 | func | owner B GET project A | session B | 404 đồng nhất | getOwned ràng buộc ownerId (mã); chưa chạy | **BLOCKED** | `[CRITICAL]` |
| TC-16 | func | double-submit | cùng PR/commit | 1 job, lần 2 "đang chạy" | unique partial index + enqueue (mã); chưa chạy | **BLOCKED** | `[HIGH]` |
| TC-17 | func | 6 job đồng thời | 6 job | tối đa 5 song song | worker concurrency 5 + **max-attempts (BUG-01)**; chưa chạy | **BLOCKED** | `[HIGH]` |
| TC-18 | unit | PR 60 file | 60 file | cắt 50 + báo | **PASS** (buildSkillMap: truncated.files=10, bỏ binary) | **PASS** | — |
| TC-19 | unit | rate-limit | 6 lệnh/10’ | thứ 6 chặn | đúng | **PASS** | — |
| TC-20 | func | PR rỗng | 0 file | "không có gì review" | finishEmpty (mã); chưa chạy | **BLOCKED** | `[LOW]` |
| SEC signature/crypto/redact | unit | HMAC/AES-GCM/redact | — | true/false; round-trip; «redacted» | đúng | **PASS** | — |
| Decision-Table file→skill | unit | R1/R2/R3/R6/R7 | path mẫu | đúng skill/skip | đúng | **PASS** | — |
| BUG-02 retryable flag | unit | IntegrationError | — | retryable mặc định true | đúng | **PASS** | — |
| E2E-Admin-UI (24 locator) | e2e | login/CRUD/secret/history | — | thao tác theo data-testid | app chưa chạy trên trình duyệt | **BLOCKED** | `[HIGH]` |

# Defect Phát Hiện

**Không phát hiện defect mới** từ test ĐÃ CHẠY THẬT (26/26 unit PASS, build EXIT 0).

**Defect từ `/tn-review` đã được sửa + tái kiểm** (chi tiết `bugfix.md`):
- `[HIGH]` BUG-01 max-attempts + dead-letter → **đã sửa** (`claimNext(maxAttempts)`, `deadLetterExhausted`).
- `[HIGH]` BUG-02 requeue lỗi tạm thời + backoff → **đã sửa** (kiểm bằng test cờ `retryable`).
- `[MEDIUM]` BUG-03 idempotency guard theo jobId → **đã sửa** (`hasHistory`).
- `[MEDIUM]` BUG-04 resolve case-insensitive nhất quán → **đã sửa** (`nameLower` unique index).
- `[MEDIUM]` BUG-05 set `supersedesJobId` → **đã sửa** (`findLatestByPr`).
- `[LOW]` BUG-06 regex parser → ghi nhận, chưa sửa.

> Lưu ý: BUG-01/02/03/05 sửa ở tầng tích hợp Mongo/worker — **đã verify build + logic test**, nhưng hành vi end-to-end (requeue/reclaim/dead-letter thật) vẫn cần test tích hợp với MongoDB (BLOCKED).

# E2E & Locator

E2E chưa chạy trên trình duyệt → đối chiếu mã nguồn `web-admin/src/App.tsx` với bảng E2E Locators: **khớp 100% 24 `data-testid`**, KHÔNG lệch.

| Element/Mục đích | data-testid test.md | Thực tế code | Cần cập nhật? |
|------------------|---------------------|--------------|----------------|
| login/CRUD/secret/test-conn/history/access-denied (24 locator) | (đầy đủ) | khớp toàn bộ | **Không** |

**Back-prop:** KHÔNG cần — không lệch locator.

# Coverage & Khoảng Hở

- `[CRITICAL]` Tenant isolation / IDOR (TC-14/15) chưa chạy thật — chỉ verify đọc mã. **Phải chạy với MongoDB trước release.**
- `[HIGH]` Idempotency & concurrency (TC-16/17) + **bugfix BUG-01/02/03 (dead-letter/requeue/reclaim)** chưa test tích hợp với Mongo.
- `[HIGH]` Tích hợp Azure/Claude/Slack chưa chạy (retry/timeout/fallback/circuit breaker/post).
- `[HIGH]` Prompt/command injection — chống ở thiết kế; chưa test chạy CLI thật.
- **Cải thiện so với lần 1:** TC-18 (giới hạn file) đã có unit test thật (trước là BLOCKED).
- **Coverage số liệu:** chưa bật reporter; unit phủ: parser, catalog, fileSkillMap, contextBuilder(buildSkillMap), crypto, slack signature, rate-limiter, redact, idempotency/severity, IntegrationError.

# Case Chưa Chạy Được (BLOCKED)

- **TC-05/06/07/09/10/11/14/15/16/17/20** + **TC-01 full flow** — cần MongoDB + dữ liệu; một số cần Azure PAT/Claude/Slack thật.
- **E2E Admin UI (24 locator)** — cần khởi chạy app trên trình duyệt + backend + MongoDB.
- **Tích hợp Azure/Claude/Slack + bugfix end-to-end (dead-letter/requeue)** — cần credential thật + Claude Code CLI + MongoDB.

# Kết Luận & Khuyến Nghị

- **Đề xuất: KHÔNG release** cho tới khi chạy thật nhóm rủi ro cao với hạ tầng đầy đủ.
- **Việc cần làm trước khi pass (Risk-Based):**
  1. Dựng MongoDB + `.env` → chạy functional **TC-14/15 (IDOR/secret)**, **TC-16/17 (concurrency)** + **kiểm bugfix end-to-end** (double-submit, reclaim sau crash, dead-letter sau MAX_ATTEMPTS, requeue backoff).
  2. Credential test (Azure/Claude/Slack) → **TC-07/09/10/11** + 1 luồng review E2E thật.
  3. Khởi chạy Admin UI → **E2E 24 locator**.
  4. (LOW) Sửa BUG-06 parser delimiter khi tối ưu.
- **Điểm tích cực:** 26/26 unit PASS; build backend & UI EXIT 0; 5 bug review đã sửa + tái kiểm; locator khớp 100% test.md.
- **Liên kết ngược:** `test.md` (thiết kế), `bugfix.md` (BUG-01..06), `plan.md` (T2/T12/T14 tiêu chí Done).
</content>
