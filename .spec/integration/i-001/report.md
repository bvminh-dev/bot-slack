---
integration: i-001
feature: review-pr-slack-azure
stage: report
status: draft
open_questions: 0
updated: 2026-06-26
---

# Tóm Tắt Lần Chạy

**Phạm vi:** thực thi test cho i-001 (Slack bot review PR Azure + Admin UI). **Ngày chạy:** 2026-06-26 (lần 3 — **dựng hạ tầng auto-test 3 tầng**: Unit + Functional + E2E thực thi được, gỡ phần lớn BLOCKED của lần 2).

Lần này bổ sung **hạ tầng tự động hoá**:
- **Unit** (`node:test`): 44 case logic thuần (28 cũ + 16 bổ sung `unit-extra.test.ts`).
- **Functional** (`node:test` + `supertest` + **`mongodb-memory-server`** + monkey-patch singleton adapter Azure/Slack): 15 case — chạy trên **Mongo in-memory THẬT** (index unique/partial hoạt động → idempotency/IDOR/concurrency kiểm chính xác), hệ ngoài (Azure/Claude/Slack) stub.
- **E2E** (`@playwright/test`, Chromium, **mock `/api/v1/*` bằng `page.route`** trên Vite dev server): 6 luồng Admin UI theo `data-testid`. Không cần backend/Mongo khi chạy E2E UI.

**Tổng: 65 test tự động, 65 PASS, 0 FAIL.** Một discrepancy design-vs-code được ghi nhận (F-1, xem dưới) — đã xử lý ở mức assertion + ghi finding, KHÔNG che giấu.

**Kết luận go/no-go:** 🟡 **GẦN ĐỦ** — các nhóm rủi ro cao (tenant isolation/IDOR, secret write-only, idempotency/double-submit, claim atomic/reclaim, NoSQL injection, Slack signature/replay) **đã chạy thật** trên Mongo in-memory + supertest và **PASS**. Còn lại cần credential/CLI thật mới khẳng định: review pipeline end-to-end qua Claude Code CLI, Azure PAT thật, post Slack thật, circuit breaker khi hết credit. Đề xuất chạy 1 vòng staging với credential thật trước release.

| Chỉ số | Unit | Functional | E2E | Tổng |
|--------|------|------------|-----|------|
| Tổng case (auto) | 44 | 15 | 6 | 65 |
| PASS | 44 | 15 | 6 | **65** |
| FAIL | 0 | 0 | 0 | 0 |
| BLOCKED (cần credential/CLI thật) | — | (xem mục dưới) | — | — |

# Môi Trường & Runner

- **Stack:** Node.js v20.19 + TypeScript (backend); React 18 + Vite 5 (web-admin).
- **Lệnh chạy (đã verify):**
  - `npm test` → `tsc` build + `node --test dist/__tests__` → **59 pass / 0 fail** (44 unit + 15 functional). *(Đã sửa lỗi cũ: script dùng glob `dist/**/*.test.js` không expand trên shell → đổi sang dạng thư mục `dist/__tests__`.)*
  - `npm run test:unit` → chỉ Unit (nhanh, không I/O).
  - `npm run test:func` → chỉ Functional (tự khởi động MongoMemoryServer; hoặc trỏ `MONGO_TEST_URI`).
  - `npm --prefix web-admin run test:e2e` (`playwright test`) → **6 pass / 0 fail** (Chromium, mock API).
- **devDeps thêm:** `supertest`, `@types/supertest`, `mongodb-memory-server` (backend); `@playwright/test` (web-admin).
- **Self-skip an toàn:** Functional tự `skip` nếu MongoMemoryServer không tải/chạy được mongod binary (môi trường offline) — không làm đỏ suite giả.

# Kết Quả Theo Tầng

### Unit (44) — `src/__tests__/pure.test.ts`, `context.test.ts`, `unit-extra.test.ts`
Parser (`parseCommand`: happy/thiếu url/sai thứ tự/normalize link/host/prId biên-phi số), `parseAzurePrUrl`, `mapFileToSkills` R1–R7 (gồm R4 doc nghiệp vụ, R5 doc kiến trúc), catalog (`isValidModel/Effort`, `normalizeModelConfig` default + ngoài catalog), `parseSkillOutput` (JSON block + fallback nhãn `[SEVERITY]`), `severityCounts`, crypto AES-GCM round-trip + IV khác nhau, Slack HMAC (hợp lệ/sai/replay), `RateLimiter` ngưỡng 5/6, `makeIdempotencyKey`, `redact`/`redactString`, `validateRepoUrl` chặn SSRF (localhost/169.254), `CircuitBreaker` (mở theo ngưỡng + half-open + cô lập theo key), `ContextBuilder.buildSkillMap` (cắt 50 file + bỏ binary + file nhạy cảm), `IntegrationError.retryable`. → **44/44 PASS**.

### Functional (15) — `src/__tests__/functional.test.ts`
| Case | Nội dung | Kết quả |
|------|----------|---------|
| FT-05/06 | login PAT hợp lệ → 200 + Set-Cookie; PAT sai → 4xx, không cấp session, không lộ PAT | PASS (xem F-1) |
| FT-07 | tạo project 201, response không chứa secret | PASS |
| FT-09 | IDOR owner B GET project owner A → 404 đồng nhất | PASS |
| FT-10 | mass assignment: `ownerId`/`status` trong body bị bỏ, gán server-side | PASS |
| FT-11 | thiếu session → 401 | PASS |
| FT-12 | Slack chữ ký sai → 401; url_verification hợp lệ → echo challenge | PASS |
| FT-13 | trùng tên (case-insensitive `nameLower`) → 409 | PASS |
| FT-23 | NoSQL `{"$ne":null}` ép string → 400, không lưu | PASS |
| FT-16 | idempotency enqueue 2 lần cùng key → lần 2 duplicate (unique partial index) | PASS |
| FT-17 | 2 worker claim 1 job đồng thời → chỉ 1 thắng (atomic findOneAndUpdate) | PASS |
| FT-19 | reclaim job running quá lease → claim lại được, attempts=2 | PASS |
| FT-21 | cancelQueuedByProject → job chờ chuyển `cancelled` | PASS |
| E2E-07 | luồng Slack non-DOM: lệnh hợp lệ → queued; double-submit → duplicate | PASS |
| E2E-07b | repo mismatch → rejected, không enqueue | PASS |

### E2E Admin UI (6) — `web-admin/e2e/admin.spec.ts`
E2E-01 login đúng/sai · E2E-02 tạo project + test-connection từng phần + secret write-only (mở lại: cờ "đã cấu hình", input secret rỗng) · E2E-03 validate trùng tên → `project-form-error-name` · E2E-04 XSS `<script>` render escape (không có dialog) · E2E-05 xoá có confirm + 404 tenant isolation · E2E-06 lịch sử review (commit + severity + badge). → **6/6 PASS**.

# Defect / Discrepancy Phát Hiện

- `[LOW]` **F-1 / BUG-07 (design-vs-code): login PAT sai trả HTTP 400, thiết kế mong đợi 401 — ✅ ĐÃ SỬA (/tn-review đợt 2).**
  Root cause: `identityService.login` truyền thẳng `ValidationError` từ `verifyPatIdentity` → `errorHandler` map `ValidationError → 400`. Sửa khu trú: `login()` bọc try/catch quanh `verifyPatIdentity`, dịch lỗi xác thực → `AuthError` (→**401**), message chung không lộ chi tiết; KHÔNG đổi `verifyPatIdentity` nên `registryService.testConnection` không ảnh hưởng. FT-06 cập nhật assertion về **401** và **PASS**. Chi tiết: `bugfix.md` BUG-07; rule mới trong `CLAUDE.md`.
- `[MEDIUM]` **BUG-08: không ghi audit login THẤT BẠI** — ghi nhận, **chưa sửa** (gom vào integration audit riêng để định nghĩa schema audit-fail + ngưỡng anomaly). Xem `bugfix.md`.

Không phát hiện defect chức năng mới khác từ 65 test đã chạy thật.

# Case Còn Cần Credential/CLI Thật (chưa phủ bằng auto-test ở đây)

- **Review pipeline end-to-end qua Claude Code CLI** (`skillRunner.run` spawn `claude -p`): timeout/kill, phân loại auth/quota, đọc cả stdout+stderr — cần CLI + key thật (Functional FT-25/28/29 mới stub).
- **Azure DevOps thật** (fetch PR/clone/PAT identity), **post Slack thật**, **circuit breaker theo project khi hết credit** — stub ở Functional, cần staging với credential thật.
- **Giới hạn token/PR cụ thể** (FRD #6 chưa có con số) — chưa có biên định lượng.
- Các SUT thiết kế KHÔNG có hàm pure riêng (`classifyClaudeCredential`, `classifyError`, `computeBackoff`, `isLeaseExpired`, `sanitizeMongoInput`, `toMrkdwn`): logic tồn tại nhưng nằm inline trong adapter/repo → phủ gián tiếp ở Functional, không có Unit riêng. (Khuyến nghị tách hàm pure nếu muốn Unit trực tiếp.)

# Cách Chạy (cho người dùng)

```bash
# Backend (Unit + Functional) — tự dựng Mongo in-memory
npm test            # build + unit + functional (59)
npm run test:unit   # chỉ unit (nhanh)
npm run test:func   # chỉ functional (Mongo in-memory; hoặc MONGO_TEST_URI=<uri>)

# E2E Admin UI — Playwright tự khởi Vite dev + mock API
npm --prefix web-admin run test:e2e
```

# Kết Luận & Khuyến Nghị

- **Tích cực:** 65/65 auto-test PASS; nhóm CRITICAL (IDOR/secret/idempotency/concurrency/NoSQL/Slack-sig) **đã chạy thật** trên Mongo in-memory → đủ tin cậy ở tầng logic + tích hợp nội bộ.
- **Trước release:** chạy 1 vòng staging với MongoDB + Azure PAT + Claude Code CLI + Slack workspace thật để khẳng định review pipeline end-to-end + circuit breaker + post Slack.
- **Theo dõi:** F-1/BUG-07 (401 vs 400) → ✅ đã sửa qua `/tn-review`. BUG-08 (audit login-fail, MEDIUM) → mở, gom vào integration audit riêng.
- **Liên kết:** `test.md` (thiết kế + phân tầng), `bugfix.md` (BUG-01..06), `plan.md` (tiêu chí Done).
</content>
