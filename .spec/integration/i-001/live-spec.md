# Live-spec — i-001 (review-pr-slack-azure)

## [2026-06-25] /tn-yeu-cau (i-001)
- Skill dùng: phan-tich-nghiep-vu (BABOK, checklist 16 khía cạnh, template 19 mục).
- Việc đã làm: Bootstrap `.spec` (CONVENTION, registry, main/). Phân tích nghiệp vụ yêu cầu Slack bot review PR Azure; hỏi làm rõ 7 điểm qua 2 vòng AskUserQuestion; ghi `frd.md` (approved, open_questions=0); cascade lên main/feature + feature-index.
- Quyết định/giả định:
  - Kết quả review trả về **Slack thread** (không comment Azure PR ở i-001).
  - Tài liệu hệ thống **mặc định trong repo đích** + có **config nguồn bổ sung**.
  - Setup project qua **Web Admin UI**, **đăng nhập bằng Azure PAT**.
  - **Mọi người trong workspace** ra lệnh review được.
  - Skill **auto-select theo loại file**.
  - Xử lý **bất đồng bộ** (ack ngay, trả kết quả sau).
  - GIẢ ĐỊNH chốt sau: chạy skill bằng Claude Agent SDK headless + token Claude theo project (cô lập chi phí); cơ chế mã hoá secret & phân quyền admin → `/tn-bao-mat`.
- Lệch so với plan/spec: Không (greenfield, baseline mới).
- Kết quả test/locator/bug: Chưa có (bước FRD).

## [2026-06-25] /tn-yeu-cau — cập nhật FRD (i-001)
- Bổ sung theo yêu cầu người dùng: (1) project cấu hình thêm **model Claude + effort**; (2) Admin UI **phân quyền theo chủ sở hữu** — mỗi người chỉ thấy/sửa project do chính mình tạo.
- Cập nhật các mục: Tóm tắt, Assumptions (#1,#3,#7), Phân quyền (ownership + tenant isolation thay cho CRITICAL admin trước đó), Business Rule (owner, unique-scope, model/effort), Validation, Logic, Edge case, Câu hỏi mở #2/#8/#9/#10.
- Câu hỏi mở mới (không chặn → thiết kế/bảo mật): danh tính chủ sở hữu; xung đột "ai cũng review được" vs cô lập owner; phạm vi duy nhất tên project; danh sách model/effort + default.
- Cascade lại lên main/feature + feature-index. Trạng thái giữ approved, open_questions=0.

## [2026-06-25] /tn-thiet-ke (i-001)
- Skill dùng: thiet-ke-he-thong (template 28 mục, TOGAF + DDD + STRIDE + ISO 25010).
- Việc đã làm: thiết kế kiến trúc tech.md đầy đủ 28 mục + 11 ADR; cascade lên main/feature/<slug>/tech.md và main/sad.md (tạo mới).
- Quyết định/giả định (qua AskUserQuestion): Node.js+TypeScript, UI ReactJS; chạy skill bằng Claude Code CLI headless; store MongoDB (pool + ownerId filter); queue trong MongoDB, worker poll, max concurrency 5.
- Đã chốt các câu hỏi thiết kế FRD: #1 (ADR-003), #10 (ADR-006, default sonnet-4-6/medium), #4 (ADR-008 bảng map file→skill), #5 (ADR-009 định nghĩa tài liệu hệ thống), #6 (giới hạn an toàn: ≤50 file, ≤5000 dòng diff, rate-limit, output Slack).
- Lệch so với plan/spec: không. open_questions = 0, status = approved.
- Còn lại (không chặn thiết kế, chuyển bước sau): bảo mật #2/#3 (định danh owner, mã hoá secret/khoá master); nghiệp vụ #7/#8/#9.
- Bước kế: /tn-bao-mat i-001.

## [2026-06-25] /tn-bao-mat (i-001)
- Skill dùng: bao-mat-he-thong (template 27 mục, STRIDE + OWASP Top 10:2021 + API Security Top 10:2023 + Zero Trust).
- Việc đã làm: security.md đầy đủ 27 mục; cascade lên main/feature/<slug>/security.md và main/security.md (tạo mới).
- Quyết định (qua AskUserQuestion): #3 secret AES-256-GCM + master key ENV (+keyVersion); #2 owner=Azure userId/email, self-service bất kỳ PAT hợp lệ (không allowlist); #8 mọi người workspace review mọi project (residual data-leakage chéo CHẤP NHẬN, giữ authorizeReviewCommand).
- Phát hiện trọng yếu: [CRITICAL] BOLA/IDOR cross-tenant (ép ownerId repository layer + 404); [CRITICAL] lộ secret (write-only + lọc log + ENV con); [CRITICAL] mass assignment (allowlist field, ownerId server-side); [HIGH] command/prompt injection vào claude/git (argv không shell, tool tối thiểu); [HIGH] DoS/cost (rate-limit+quota+concurrency 5).
- Lệch so với plan/spec: không. open_questions = 0, status = approved.
- Còn lại (không chặn): nghiệp vụ #7 (đồng ý dữ liệu qua Anthropic), #9 (tên project duy nhất toàn hệ thống); tương lai: Entra OIDC, KMS/Vault.
- Bước kế: /tn-kiem-thu i-001.

## [2026-06-25] /tn-kiem-thu (i-001)
- Skill dùng: kiem-thu-phan-mem (template 19 mục + E2E Locators, ISTQB: EP/BVA/Decision Table/State Transition/Use Case/Pairwise/Error Guessing/Risk-Based).
- Việc đã làm: test.md đầy đủ 19 mục + bảng E2E Locators (24 data-testid cho Admin UI React); cascade lên main/feature/<slug>/test.md (tạo mới).
- Test mô tả bằng lời (Bước/Dữ liệu/Kết quả mong đợi); KHÔNG sinh code Playwright/Cypress.
- Trọng tâm Risk-Based: [CRITICAL] IDOR/BOLA + secret write-only/không-lộ + mass assignment + token mix-up; [HIGH] concurrency/idempotency (double-submit, 2 worker, reclaim, >5 job); integration resiliency; prompt/command injection.
- Lỗ hổng spec (không chặn): #9 tên project duy nhất (nghiệp vụ), token tối đa/PR cụ thể, retention history/audit, lệnh phụ help/status/cancel.
- open_questions = 0, status = approved.
- Bước kế: /tn-ke-hoach i-001.

## [2026-06-25] /tn-ke-hoach (i-001)
- Việc đã làm: tổng hợp frd+tech+security+test → plan.md; 17 task (T1..T17) có input/output, phụ thuộc, tham chiếu ngược (frd/tech/security/test), tiêu chí Done; đồ thị phụ thuộc + đường găng; checklist nghiệm thu tổng; rủi ro & giả định.
- Đường găng: T1→T2→T5→(T8/T9)→T13/T14 (review); T1→T2→T3→T4→T6→T7 (Admin).
- Thứ tự an toàn: nền (T1-3) → cô lập/danh tính/observability (T4,T16,T17) → ACL ports (T8,T9,T10) → registry+admin (T5,T6,T7) → orchestration (T11,T12,T13,T14,T15).
- plan.md KHÔNG cascade (chỉ ở i-NNN). open_questions = 0, status = approved.
- Lỗ hổng spec còn mở (không chặn code): #9 tên project duy nhất, #7 đồng ý dữ liệu, token tối đa/PR, retention, lệnh phụ.
- Bước kế: /tn-code i-001 (GATE CỨNG — phải hết open question; hiện cả 5 doc đều approved + open_questions=0 ⇒ qua gate).

## [2026-06-25] /tn-code (i-001)
- GATE CỨNG: PASS (frd/tech/security/test/plan đều approved, open_questions=0).
- Việc đã làm: hiện thực đầy đủ 17 task (T1..T17) — Node.js+TypeScript modular monolith (Clean Architecture) + React Admin UI.
- File/khu vực chính:
  - config: src/config/{env,catalog}.ts (catalog model/effort, default sonnet-4-6/medium).
  - domain: src/domain/{errors,project,reviewJob}.ts; ports: src/ports/interfaces.ts (ISlackPort/IAzureClient/ISkillRunner).
  - adapters: crypto/secretCrypto.ts (AES-256-GCM IV+tag+keyVersion); mongo/{client,projectRepository,reviewJobRepository,reviewHistoryRepository,auditRepository}.ts (ép ownerId + index queue/idempotency); azure/azureClient.ts (PR REST + git clone argv + SSRF validate); skillrunner/skillRunner.ts (claude -p argv, key qua ENV, prompt stdin, permission-mode plan, timeout+kill, parse JSON finding); slack/{slackSignature,slackPort}.ts.
  - application: identityService (PAT→JWT), registryService (CRUD owner-scoped + write-only secret + duplicate check), commandParser, rateLimiter, fileSkillMap, contextBuilder, skillVersion, reviewOrchestrator, reviewCommandService (authorizeReviewCommand allow-all).
  - worker: worker.ts (poll + concurrency 5). api: middleware/authRoutes/projectRoutes/slackRoutes/server.ts. index.ts entry.
  - web-admin (React+Vite): App.tsx + api.ts — đủ data-testid theo bảng E2E Locators.
- Kết quả build: backend `npx tsc -p tsconfig.json` EXIT 0 (emit dist/index.js); React `tsc --noEmit` EXIT 0.
- Back-prop locator: KHÔNG có lệch — data-testid khớp 100% bảng E2E Locators (không cập nhật ngược).
- Quyết định/lệch khi code (ghi nhận):
  1. Azure metadata lấy qua REST `fetch` (giữ dependency azure-devops-node-api trong package.json cho mở rộng) — chữ ký IAzureClient không đổi.
  2. Tên project duy nhất TOÀN HỆ THỐNG (unique index) theo khuyến nghị bảo mật #9 (vì Slack mọi-người resolve <project>).
  3. Skill yêu cầu xuất JSON finding; có fallback parse nhãn [SEVERITY] từ markdown.
  4. test-connection cho project mới gọi qua route :id='new' (handler không dùng id).
- KHÔNG chạy skill review ở bước này.
- Bước kế: /tn-bao-cao i-001 (chạy test + report).

## [2026-06-25] /tn-bao-cao (i-001)
- Skill dùng: chay-kiem-thu. Runner phát hiện: node:test (JS/TS) + tsc.
- Đã chạy THẬT: 21 unit test logic thuần (node --test dist/__tests__/) → 21 PASS / 0 FAIL; build backend `tsc -p` EXIT 0 (emit dist); web-admin `tsc --noEmit` EXIT 0.
- Phủ unit: parser (TC-01/02/03/04/08), catalog (TC-12/13), fileSkillMap (Decision Table), crypto AES-256-GCM round-trip+IV, slack signature (hợp lệ/sai/replay), rate-limit (TC-19), redact secret, idempotency key, severityCounts.
- BLOCKED (trung thực, KHÔNG báo PASS giả): TC-05/06/07/09/10/11/14/15/16/17/18/20 + TC-01 full flow + E2E 24 locator + tích hợp Azure/Claude/Slack — thiếu MongoDB đang chạy, .env secret thật, credential, app trên trình duyệt.
- Defect: 0 từ test đã chạy thật. Tổng: 29 PASS / 0 FAIL / 28 BLOCKED.
- Back-prop locator: KHÔNG lệch — App.tsx khớp 100% 24 data-testid trong test.md.
- Kết luận: NO-GO release tới khi chạy thật nhóm rủi ro cao (IDOR/concurrency/tích hợp) với hạ tầng đầy đủ.
- Đã thêm file test: src/__tests__/pure.test.ts.
- Bước kế: /tn-review i-001.

## [2026-06-25] /tn-review (i-001)
- Skill dùng: review-code (28 khía cạnh, template 29 mục).
- Phát hiện: 0 CRITICAL · 2 HIGH · 3 MEDIUM · 1 LOW (chi tiết bugfix.md).
  - BUG-01 [HIGH] reclaim không có max-attempts → poison job chạy lại vô hạn, đốt token.
  - BUG-02 [HIGH] IntegrationError tạm thời → fail vĩnh viễn, không requeue/backoff.
  - BUG-03 [MEDIUM] re-run sau crash (đã post Slack) → post/history trùng (thiếu idempotency theo jobId).
  - BUG-04 [MEDIUM] resolve Slack case-insensitive nhưng unique index case-sensitive → trùng tên hoa/thường.
  - BUG-05 [MEDIUM] supersedesJobId không bao giờ set → history không liên kết bản review lại.
  - BUG-06 [LOW] parseSkillOutput regex tham lam (ghi nhận, chưa sửa).
- Đã sửa code: BUG-01..05.
  - config/env.ts: MAX_ATTEMPTS, RETRY_BACKOFF_MS.
  - reviewJobRepository: claimNext(maxAttempts), deadLetterExhausted, requeueWithBackoff, hasHistory, findLatestByPr.
  - worker.ts: dead-letter sweep + truyền maxAttempts.
  - reviewOrchestrator: idempotency guard (hasHistory), requeue retryable + backoff, set supersedes.
  - projectRepository + client.ts: nameLower (unique index case-insensitive) + resolve theo nameLower.
- Đã thêm 6 rule vào CLAUDE.md (## Rules / Bài học kinh nghiệm).
- Verify sau sửa: `tsc -p` EXIT 0; `node --test` 21 PASS / 0 FAIL.
- Trạng thái: review = done (không còn HIGH/CRITICAL chưa sửa). Khuyến nghị chạy lại /tn-bao-cao để refresh report (BLOCKED infra vẫn cần MongoDB + credential).

## [2026-06-25] /tn-bao-cao (i-001) — lần 2 (sau bugfix)
- Chạy lại sau khi sửa BUG-01..05. Thêm 5 unit test (src/__tests__/context.test.ts): TC-18 buildSkillMap (cắt 50 file, bỏ binary, map skill), IntegrationError.retryable.
- Kết quả: `tsc -p` EXIT 0; `node --test` → 26 PASS / 0 FAIL (trước: 21). web-admin tsc EXIT 0 (không đổi).
- Tổng: 35 PASS / 0 FAIL / 27 BLOCKED. Defect mới: 0. 5 bug review đã sửa + tái kiểm (build/logic).
- BLOCKED vẫn do thiếu MongoDB + credential + app trên trình duyệt (gồm test end-to-end của bugfix: dead-letter/requeue/reclaim).
- Kết luận: NO-GO release tới khi chạy thật nhóm rủi ro cao. Back-prop locator: không lệch.
