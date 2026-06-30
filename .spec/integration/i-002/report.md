---
integration: i-002
feature: review-pr-slack-azure
stage: report
status: approved
open_questions: 0
updated: 2026-06-30
---

# Tóm Tắt Lần Chạy

Phạm vi: delta i-002 (giao kết quả review — file `.md`/fallback, fan-out, cache-serve, `fresh`/supersedes, redaction). Chạy thật **3 tầng một lượt** bằng `npm run report:all` ngày **2026-06-30**. **Kết luận: GO** cho phạm vi đã hiện thực — toàn bộ test thực thi được đều PASS; không phát hiện defect chặn. Một số khoảng hở MEDIUM (không chặn) chuyển `/tn-review`.

| Chỉ số | Unit | Functional | E2E | Tổng |
|--------|------|------------|-----|------|
| Tổng case (đã chạy) | 57 | 22 | 6 | 85 |
| PASS | 57 | 22 | 6 | **85** |
| FAIL | 0 | 0 | 0 | **0** |
| BLOCKED (chưa chạy được) | 0 | 0 | 0 | **0** |

> **Cập nhật sau `/tn-review` (2026-06-30):** review phát hiện 6 bug (1 CRITICAL, 2 HIGH, 3 MEDIUM/LOW) — xem `bugfix.md`. Đã sửa toàn bộ + thêm 3 test hồi quy (UT-205b redaction data-driven, FT-212b supersede lineage, FT-204b reclaim-after-history re-fanout) → chạy lại `npm run report:all` = **85/85 PASS**. Defect nổi bật: **BUG-09 (CRITICAL)** `complete()` chạy trước `fanout()` làm crash giữa 2 bước mất giao kết quả vĩnh viễn — đã đảo thứ tự + re-fanout idempotent khi reclaim.

> Ghi chú phạm vi: 82 case auto-execute gồm toàn bộ Unit (i-001+i-002) + Functional (i-001+i-002) + **6 E2E Playwright của i-001** (admin.spec.ts). E2E **mô tả-bằng-lời của i-002** (E2E-201..207) KHÔNG sinh code Playwright (CONVENTION mục 7) → xem mục "Case Chưa Chạy Được" (đánh giá qua tầng dưới + harness E2E hiện có).

# Môi Trường & Runner

- Stack: Node.js + TypeScript (CommonJS), `node:test`; Functional dùng **mongodb-memory-server** (Mongo in-memory thật → index unique/partial/arrayFilter chạy thật); E2E **Playwright** (Chromium) + mock `/api/v1/*`.
- Lệnh đã chạy: **`npm run report:all`** (build → unit → functional → e2e, sinh report hợp nhất).
- Artifact: **`reports/all.html`** (xunit-viewer, 82/82 pass) · JUnit: `reports/unit-junit.xml`, `reports/func-junit.xml`, `web-admin/reports/e2e-junit.xml` · E2E HTML+video: `cd web-admin && npx playwright show-report`.
- Lưu ý môi trường: ban đầu E2E **BLOCKED** vì thiếu Chromium binary; đã chạy `npx playwright install chromium` (tải 171MB) → E2E thực thi được, 6/6 PASS. Functional KHÔNG bị skip (report:all chạy mỗi tầng ở tiến trình riêng nên không dính cache `loadConfig`).

# Kết Quả Theo Test Case

| Case ID | Loại | Bước tóm tắt | Dữ liệu vào | Expected | Actual | Trạng thái | Mức |
|---------|------|--------------|-------------|----------|--------|------------|-----|
| UT-201 | unit | buildReportFilename | LMS/123/abcdef1234 | `review-LMS-PR123-abcdef12.md` | đúng | PASS | — |
| UT-202 | unit | sanitizeFilename path traversal | `../../etc/passwd` | không `..`/`/` | đúng | PASS | — |
| UT-204 | unit | buildSummaryLine mrkdwn | counts+url | `*n* CRITICAL`, không `###` | đúng | PASS | — |
| UT-205 | unit | redactReport secret | sk-ant/AKIA/password= | đã che | đúng | PASS | — |
| UT-206 | unit | neutralizeMentions | `<!channel>`/`@here`/`<@U>` | vô hiệu | đúng | PASS | — |
| UT-207 | unit | chunkByLines biên | text dài, max 200 | mọi mảnh ≤200 | đúng | PASS | — |
| UT-208 | unit | parseFreshFlag | `fresh`/`--fresh`/giữa link | chỉ nhận fresh/rerun cuối | đúng | PASS | — |
| UT-209 | unit | khóa commit-aware | c8 vs c9 | khóa khác nhau | đúng | PASS | — |
| UT-210 | unit | isCacheEligible | completed/failed/superseded/empty | chỉ completed-hợp-lệ=true | đúng | PASS | — |
| UT-217 | unit | buildStaleNote | completedAt+commit | nêu commit + gợi ý fresh | đúng | PASS | — |
| UT-218 | unit | isFileWithinSlackLimit | 100/1000/1001/0 | biên đúng | đúng | PASS | — |
| FT-201 | func | enqueueOrSubscribe atomic | 2 lệnh cùng khóa (thread khác) | 1 job + 2 target (queued→subscribed) | đúng | PASS | — |
| FT-204 | func | markTargetDelivered idempotent | giao #1 hai lần | lần 2 trả false (không double) | đúng (sau fix) | PASS | — |
| FT-205 | func | findCacheEligibleByKey | completed-hợp-lệ vs lỗi-toàn-phần | trả hợp lệ, bỏ lỗi | đúng | PASS | — |
| FT-213 | func | vượt cap target | cap=1, target thứ 2 | cap_reached | đúng | PASS | — |
| FT-214 | func | subscribe trùng (channel,thread) | gõ trùng | already_subscribed, không nhân target | đúng | PASS | — |
| E2E-07 | func/e2e(non-DOM) | lệnh trùng cùng PR/commit | thread khác | **subscribed** (regression i-001 reject→subscribe) | đúng | PASS | — |
| E2E-06 | e2e (DOM) | lịch sử review hiển thị | — | bảng/commit/severity/badge OK | đúng (sau khi đổi bảng i-002) | PASS | — |
| E2E-01..05 | e2e (DOM) | login/CRUD/secret/IDOR/XSS (i-001) | — | giữ nguyên hành vi | đúng (không regression) | PASS | — |

> Các UT/FT i-001 còn lại (UT-01..30 trừ trùng, FT-05..32, E2E…) đều PASS trong cùng lần chạy (tổng 82/82). Liệt kê ở trên tập trung vào case i-002 + chứng cứ không-regression.

# Defect Phát Hiện

- `[HIGH]` **(ĐÃ SỬA trong /tn-code) markTargetDelivered không idempotent** — Case: FT-204
  - Tái hiện: gọi `markTargetDelivered(jobId, C1, T1)` lần 2 (mô phỏng reclaim).
  - Expected: lần 2 trả `false` (target đã `delivered`, không giao lại). / Actual (trước sửa): trả `true` → nguy cơ **double-delivery** khi worker reclaim.
  - Nguyên nhân: `$set updatedAt` top-level làm `modifiedCount` luôn =1 dù arrayFilter không khớp phần tử nào.
  - Khắc phục: đưa điều kiện `pending` vào FILTER (`$elemMatch`) + dùng `matchedCount`. → FT-204 PASS.
  - Liên quan: tech ADR-013 (fan-out idempotent); `reviewJobRepository.markTargetDelivered`.
- Không phát hiện defect đang mở (open) ở lần chạy này.

# E2E & Locator

E2E i-002 Admin UI dùng **đúng** `data-testid` đề xuất trong `test.md` (App.tsx) → **KHÔNG cần back-prop**:

| Element/Mục đích | data-testid trong test.md | Thực tế trong code | Cần cập nhật test.md? |
|------------------|---------------------------|--------------------|------------------------|
| Badge giao theo target | `delivery-status-{jobId}` | `delivery-status-${it.jobId}` | Không |
| Danh sách delivery targets | `delivery-targets-list-{jobId}` | `delivery-targets-list-${it.jobId}` | Không |
| Badge superseded | `superseded-badge-{jobId}` | `superseded-badge-${it.jobId}` | Không |
| Link bản hiện hành | `superseded-by-link-{jobId}` | `superseded-by-link-${it.jobId}` | Không |
| Chỉ báo cache-hit | `cache-hit-indicator-{jobId}` | `cache-hit-indicator-${it.jobId}` | Không |
| Filter trạng thái giao | `filter-delivery-status` | `filter-delivery-status` | Không |
| Nút xem report | `view-report-btn-{jobId}` | `view-report-btn-${it.jobId}` | Không |

> E2E-06 (i-001) vẫn PASS sau khi mở rộng bảng `review-history-table` → `review-history-row`/`review-status-badge` không bị phá (không regression locator i-001).

# Coverage & Khoảng Hở

- `[MEDIUM]` **E2E i-002 Admin UI (E2E-204..207) chưa auto-execute bằng Playwright**: theo CONVENTION mục 7 không sinh code Playwright; harness `admin.spec.ts` hiện chỉ phủ i-001. Locator đã có sẵn trong UI → khuyến nghị bổ sung spec Playwright (hoặc verify thủ công) cho deliveries/superseded/cache-hit/filter trước production.
- `[MEDIUM]` **Độ chính xác redaction (false-negative)** chỉ phủ logic ở UT-205 với vài pattern mẫu — chưa có bộ dữ liệu secret đa dạng để đo sót. (Risk: secret rời lên Slack vĩnh viễn.)
- `[MEDIUM]` **Hiệu năng fan-out ở cap-max (50 target) + Slack 429** chưa có load/timing test (phi-chức-năng).
- `[MEDIUM]` **No-DOM E2E luồng Slack i-002 (E2E-201/202/203)** (fan-out/cache-serve/fallback+reclaim đầu-cuối) chưa có harness riêng — hiện được phủ gián tiếp qua Functional (FT-201/204/205) + repo-level; chưa chạy xuyên orchestrator thật.
- Số liệu: 82/82 PASS (0 fail, 0 skip) theo `reports/all.html`.

# Case Chưa Chạy Được (BLOCKED)

- Không còn BLOCKED sau khi cài Chromium. (Trước đó: 6 E2E Playwright i-001 BLOCKED do thiếu browser binary — đã giải quyết bằng `npx playwright install chromium`.)
- E2E mô tả-bằng-lời i-002 (E2E-201..207): **không BLOCKED mà là "chưa tự động hoá"** (chủ ý theo CONVENTION mục 7) — phủ qua tầng Unit/Functional; xem Coverage & Khoảng Hở.

# Kết Luận & Khuyến Nghị

- **GO** cho phạm vi i-002: mọi rủi ro CRITICAL/HIGH (atomic upsert chống 2 job, fan-out idempotent chống double-delivery, cache loại failed/superseded, authorize mọi entrypoint, redaction, neutralize mention) đều có test thực thi PASS; 1 defect HIGH (idempotency) đã phát hiện & sửa ngay trong lần chạy.
- Việc nên làm trước production (Risk-Based, không chặn merge i-002):
  1. Bổ sung Playwright spec cho E2E-204..207 (Admin UI deliveries/superseded/cache-hit) hoặc verify thủ công.
  2. Bộ dữ liệu mẫu secret để đo false-negative redaction; chốt bộ pattern + `slackFileSizeLimit` thật ở cấu hình.
  3. Load test fan-out cap-max (50 target, Slack 429/Retry-After).
- Liên kết ngược: `test.md` (thiết kế + phân tầng), `plan.md` (Done T1–T16), `tech.md` (ADR-012..016), `security.md` (redaction/authorize/BOLA).
