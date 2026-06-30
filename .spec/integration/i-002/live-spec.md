# Live-spec — i-002 (review-pr-slack-azure)

> Nhật ký as-built của integration i-002. Chi tiết delta nằm trong các doc cùng thư mục.

## [2026-06-30] /tn-yeu-cau (i-002) — review-pr-slack-azure
- Skill dùng: `phan-tich-nghiep-vu` (BABOK, checklist 16 khía cạnh, template 19 mục).
- Việc đã làm: phân tích yêu cầu thay đổi cách giao kết quả review về Slack; viết `frd.md` delta (status approved, open_questions 0); cascade vào `main/feature/review-pr-slack-azure/frd.md` + cập nhật `feature-index.md`.
- Quyết định (qua AskUserQuestion):
  1. Khóa "cùng 1 yêu cầu" = `(projectId, prId, commitHash)` (commit-aware) — commit mới ⇒ review mới.
  2. Khóa đã `completed` → **cache-serve từ DB** (không tốn token); có cú pháp ép chạy lại `fresh`/`rerun` (tạo `supersedes`).
  3. Output: **luôn file `.md`** (toàn bộ review) **+ 1 dòng tóm tắt inline**.
  4. Lệnh trùng lúc đang chạy → **đăng ký delivery target + ack chờ**, kết quả **fan-out tới tất cả** nơi đã hỏi.
- Lệch so với spec i-001: **override ADR-007** (reject-duplicate → subscribe-and-fanout) và override quy tắc output (đính-kèm-khi-dài → luôn file `.md`). Kích hoạt thật `supersedes` (i-001 mới khai báo).
- Giả định tường minh (không chặn, chốt ở thiết kế/bảo mật): từ khóa `fresh` chính xác; cấu trúc/đặt tên file `.md`; ngưỡng kích thước file + cách chia nhỏ fallback; lưu artifact vs tái dựng từ history; đánh giá lại bề mặt lộ dữ liệu khi fan-out; định nghĩa "completed hợp lệ" để cache-serve; giới hạn số target.
- Bước kế: `/tn-thiet-ke i-002`.

## [2026-06-30] /tn-thiet-ke (i-002) — review-pr-slack-azure
- Skill dùng: `thiet-ke-he-thong` (TOGAF/DDD/C4, checklist 28 khía cạnh, template 28 mục).
- Việc đã làm: viết `tech.md` delta (status approved, open_questions 0); 5 ADR mới (ADR-012..016); cascade vào `main/sad.md` (ADR registry + nguyên tắc #3/#4 + rủi ro nổi bật) và `main/feature/review-pr-slack-azure/tech.md` (ADR + Aggregate + Domain Events + Integration + Multi-Tenant).
- Quyết định kiến trúc chính:
  - ADR-012: output **luôn file `.md`** + tóm tắt inline; upload `files.getUploadURLExternal`+`completeUploadExternal`; fallback chunk chat (override output i-001).
  - ADR-013: **fan-out** `deliveryTargets[]` + trạng thái giao per-target; lệnh trùng → register (không reject); atomic upsert enqueue-or-subscribe (**override ADR-007**).
  - ADR-014: **cache-serve** từ History khi `completed` hợp lệ (≥1 finding, không lỗi-toàn-phần); `fresh`/`rerun` bỏ qua + `supersedes`.
  - ADR-015: KHÔNG lưu artifact `.md` — dựng on-demand từ History.
  - ADR-016: khóa = `(projectId,prId,commitHash)` commit-aware (tái dùng index ADR-007).
- Lệch so với spec i-001: **override ADR-007** (reject-duplicate → subscribe-and-fanout) + override quy tắc output ("đính-kèm-khi-dài" → "luôn file .md"); kích hoạt thật `supersedes`.
- Chuyển bảo mật (không chặn): ranh giới fan-out/cache leak chéo owner (FRD #5 / #8 i-001); scope `files:write` + bảo vệ Slack token; lọc secret/PII trong file `.md` trước khi rời hệ thống; chính sách file đã lên Slack không xoá được.
- Bước kế: `/tn-bao-mat i-002`.

## [2026-06-30] /tn-bao-mat (i-002) — review-pr-slack-azure
- Skill dùng: `bao-mat-he-thong` (STRIDE/OWASP/OWASP-API/Zero Trust, checklist 28, template 27 mục).
- Việc đã làm: viết `security.md` delta (status approved, open_questions 0); cascade vào `main/security.md` (quyết định cốt lõi + tài sản + residual) và `main/feature/review-pr-slack-azure/security.md` (Asset/Attack Surface/Authorization/File Upload/Data Leakage).
- Phát hiện chính:
  - `[HIGH]` File `.md` rời lên Slack **không xoá được từ bot** → redaction secret-pattern + minimization + classification trong builder; runbook IR.
  - `[HIGH]` Subscribe-bypass: `authorizeReviewCommand` phải áp cho review + subscribe + cache-serve + `fresh`; cache-serve đọc theo khóa resolve (không BOLA jobId).
  - `[HIGH]` Spoof delivery target → target lấy từ Slack event đã verify, không từ payload tự do.
  - `[HIGH]` DoS/cost: rate-limit bao gồm `fresh`; cap deliveryTargets/job (mặc định 50, fail-safe).
  - `[MEDIUM]` Mention injection (`<!channel>`/`@here`) từ snippet PR vào chunked fallback → vô hiệu mention; file an toàn hơn (không bị parse mention).
  - `[MEDIUM]` Slack Bot Token thêm `files:write` → least-privilege + bảo vệ như secret.
- Quyết định: fan-out leak amplification + cache-serve cross-owner **chấp nhận residual nối tiếp #8 i-001** (fan-out không cấp quyền mới). open_questions = 0.
- Định tuyến (không chặn): [→nghiệp vụ/pháp lý] chính sách file đã lên Slack không xoá được + đồng ý dữ liệu; [→vận hành] runbook IR + toggle chat-only.
- Bước kế: `/tn-kiem-thu i-002`.

## [2026-06-30] /tn-kiem-thu (i-002) — review-pr-slack-azure
- Skill dùng: `kiem-thu-phan-mem` (ISTQB, checklist 20, template 19 mục).
- Việc đã làm: viết `test.md` delta (status approved, open_questions 0) — 20 test case TC-201..220, Decision Table định tuyến R1–R6, State Transition (delivery target + supersede), Permission Matrix (review/subscribe/cache-serve/fresh), Security/Concurrency/Integration cases, dự đoán bug; section E2E Locators (Admin UI deliveries/superseded/cache-hit). Cascade vào `main/feature/review-pr-slack-azure/test.md` (MERGE: đánh dấu TC-16 OVERRIDE, thêm 7 E2E locator i-002, block "[i-002] Delta").
- Phát hiện trọng yếu cần test: atomic upsert (TC-206), idempotent fan-out khi reclaim (TC-205), bypass authorize subscribe/cache-serve/fresh (Security), cache "hợp lệ" vs failed/superseded (TC-207/208/209), fallback file→chat→fail (TC-202/203), redaction (TC-215), neutralize mention (TC-216), cap target (TC-213).
- Regression i-001 cần cập nhật: TC-16/FT-16/E2E-07 (reject→subscribe) + output (đính-kèm→file .md).
- Lỗ hổng spec (không chặn): bộ pattern redaction cụ thể + giới hạn kích thước file Slack → chốt giá trị ở /tn-code.
- Bước kế: `/tn-sinh-test i-002` (phân tầng Unit/Functional/E2E) hoặc `/tn-ke-hoach i-002`.

## [2026-06-30] /tn-sinh-test (i-002) — review-pr-slack-azure
- Skill dùng: `sinh-test-cases` (Test Pyramid + ma trận truy vết).
- Việc đã làm: append vào `i-002/test.md` các section phân tầng — Unit 18 / Functional 19 / E2E 7 (44 case) + ma trận truy vết (17 yêu cầu i-002 đều có ≥1 tầng phủ) + khoảng trống. Cascade tóm tắt vào `main/feature/review-pr-slack-azure/test.md`.
- Hình dạng pyramid i-002: 41% / 43% / 16% — Functional nhỉnh hơn Unit do delta thiên tích hợp/đồng thời (atomic upsert, fan-out, reclaim, cache-serve qua DB); E2E nhỏ nhất, KHÔNG ice-cream cone. Gộp i-001 (54/34/12) tổng thể khỏe mạnh.
- Khoảng trống (MEDIUM, không chặn): độ phủ pattern redaction (cần data-driven), hiệu năng fan-out cap-max (load test), giới hạn kích thước file Slack (chốt số ở /tn-code). Không có khoảng trống CRITICAL → open_questions = 0.
- Bước kế: `/tn-ke-hoach i-002`.

## [2026-06-30] /tn-ke-hoach (i-002) — review-pr-slack-azure
- Tổng hợp frd/tech/security/test → `plan.md` (status approved, open_questions 0). 16 task (T1–T16) + đồ thị phụ thuộc + tiêu chí Done tổng + rủi ro/giả định.
- Đường găng: T2(model) → T6(EnqueueOrSubscribe atomic) → T8(fresh/supersedes) → T11(authorize) → T16(nghiệm thu luồng); nhánh song song T9(FanoutDeliverer) → T12(audit/metrics); T15 regression i-001 sau T6+T9; T14 UI sau T13.
- Mỗi task gắn tham chiếu ngược (frd/ADR/security mitigation/Case ID) + Done theo UT/FT/E2E. Giá trị cấu hình (redaction pattern, file-size, rate-limit fresh) gom vào T1 với default an toàn → KHÔNG chặn gate /tn-code.
- plan KHÔNG cascade. Bước kế: `/tn-code i-002` (gate cứng: mọi doc {frd,tech,security,test} approved & open_questions=0 — đã thoả).

## [2026-06-30] /tn-code (i-002) — review-pr-slack-azure
- GATE CỨNG ĐÃ THOẢ: frd/tech/security/test/plan đều approved, open_questions=0.
- Hiện thực 16 task (T1–T16) theo plan, đúng văn phong i-001 (Clean Arch + ACL ports).
- File MỚI:
  - `src/application/reviewReport.ts` (T3): buildReportFilename/sanitizeFilename, buildMarkdownReport, buildSummaryLine, neutralizeMentions, buildStaleNote, isFileWithinSlackLimit.
  - `src/application/resultPresenter.ts` (T3/T9): buildReport + ResultDeliverer (file .md → fallback chunk chat).
- File SỬA:
  - `domain/reviewJob.ts` (T2): DeliveryTarget + fields (deliveryTargets/supersededByJobId/completedAt) + isCacheEligible().
  - `config/env.ts` (T1): deliveryTargetCap=50, slackFileSizeLimit=1MB (fail-safe default).
  - `observability/redact.ts` (T3): redactReport() che secret-pattern (sk-ant/AKIA/password=/.env/private key).
  - `adapters/mongo/reviewJobRepository.ts` (T2/T6/T7/T8): enqueueOrSubscribe (atomic upsert), subscribeTarget (dedup+cap), findCacheEligibleByKey, markSuperseded, markTargetDelivered/Failed (atomic theo $elemMatch pending — idempotent), complete() set completedAt.
  - `adapters/mongo/client.ts` (T2): index cache_lookup (idempotencyKey,status,completedAt).
  - `adapters/mongo/reviewHistoryRepository.ts` (T13): deliveries[]/supersededByJobId + recordDeliveries/markSuperseded/appendDelivery.
  - `adapters/mongo/auditRepository.ts` (T12): action cache_hit/rerun/delivered/delivery_failed.
  - `ports/interfaces.ts` + `adapters/slack/slackPort.ts` (T5): ISlackPort.uploadMarkdown (files.getUploadURLExternal→PUT→completeUploadExternal — chỉ true khi bước cuối OK) + postText.
  - `application/commandParser.ts` (T4/T10): parseFreshFlag + cờ fresh/rerun ở cuối lệnh.
  - `application/reviewCommandService.ts` (T6/T7/T8/T11): routing cache-serve/subscribe/enqueue/fresh; authorize áp cho MỌI entrypoint; rate-limit gồm fresh.
  - `application/reviewOrchestrator.ts` (T9): fan-out qua ResultDeliverer, per-target atomic idempotent, broadcast fail/empty tới mọi target, ghi deliveries vào history.
  - `api/slackRoutes.ts` (T10/T15): ack subscribed/cap_reached; cache-serve deliver từ DB + appendDelivery('cache').
  - `web-admin/src/{api.ts,App.tsx}` (T14): cột Giao + badge superseded/cache-hit + filter + view-report (đúng data-testid test.md).
- T15 regression: FT-16 giữ test `enqueue` (low-level); thêm FT-201 enqueueOrSubscribe (queued→subscribed); E2E-07 đổi kỳ vọng duplicate→subscribed.
- BUG bắt được khi test: markTargetDelivered idempotent — `updatedAt` top-level làm modifiedCount luôn =1 → sửa: điều kiện pending vào FILTER ($elemMatch) + dùng matchedCount (FT-204 xanh).
- Back-prop locator: KHÔNG phát sinh — dùng đúng data-testid đã đề xuất trong test.md.
- Kết quả chạy: typecheck backend + web-admin SẠCH; Unit 56/56 PASS; Functional 20/20 PASS (test:func). E2E Playwright Admin UI (E2E-204..207) + no-DOM E2E-201/202/203 sẽ chạy ở /tn-bao-cao (cần browser/live app).
- Bước kế: `/tn-bao-cao i-002`.

## [2026-06-30] /tn-bao-cao (i-002) — review-pr-slack-azure
- Skill: `chay-kiem-thu`. Lệnh: `npm run report:all` (3 tầng 1 lượt). Artifact: `reports/all.html` + JUnit (unit/func/e2e).
- Kết quả CHẠY THẬT: **82/82 PASS** — Unit 56 · Functional 20 (mongodb-memory-server) · E2E 6 (Playwright/Chromium). 0 FAIL, 0 BLOCKED.
- Môi trường: E2E ban đầu BLOCKED (thiếu Chromium) → `npx playwright install chromium` (171MB) → 6/6 PASS. Functional không skip (report:all chạy mỗi tầng tiến trình riêng).
- Defect: 1 HIGH (markTargetDelivered không idempotent — `updatedAt` làm modifiedCount luôn 1) ĐÃ SỬA trong /tn-code (FILTER $elemMatch + matchedCount); FT-204 PASS. Không còn defect mở.
- E2E-06 (i-001 review-history) vẫn PASS sau khi mở rộng bảng i-002 → không regression locator. i-002 locator khớp test.md → không back-prop.
- Khoảng hở MEDIUM (không chặn, → review): E2E-204..207 Admin UI i-002 chưa auto-Playwright; redaction false-negative cần data-driven; load fan-out cap-max. Kết luận: **GO**.
- Bước kế: `/tn-review i-002`.

## [2026-06-30] /tn-review (i-002) — review-pr-slack-azure
- Skill: `review-code` (Principal Engineer, 29 mục) + built-in `/code-review` + 2 agent finder (concurrency, security) cross-check.
- Phát hiện 6 bug (ghi `bugfix.md`, rút rule vào CLAUDE.md, sửa code):
  - **BUG-09 [CRITICAL]** `complete()` TRƯỚC `fanout()` → crash giữa 2 bước làm job mất khả năng reclaim → mất giao vĩnh viễn. Sửa: đảo thứ tự (fanout→complete) + guard `hasHistory` re-fanout từ history (idempotent).
  - **BUG-14 [HIGH]** redaction sót GitHub `gho_/ghu_/ghs_/github_pat_`, AWS `ASIA`, `key="value có dấu cách"`. Sửa: mở rộng pattern + UT data-driven.
  - **BUG-10 [MEDIUM]** `race_none` lặp lại lọt vào `subscribed` → ack giả, không phản hồi. Sửa: retry tường minh + rejected "đang bận".
  - **BUG-12 [MEDIUM]** supersede dùng `findCacheEligibleByKey` → mất lineage khi bản trước lỗi-toàn-phần. Sửa: `findLatestCompletedByKey`.
  - **BUG-13 [MEDIUM]** `recordDeliveries` `$set` ghi đè bản ghi cache-serve. Sửa: hợp nhất theo (channel,threadTs,mode).
  - **BUG-11 [LOW]** ký tự zero-width literal trong source. Sửa: escape `​`.
- Residual ghi nhận (không sửa): lease-expiry mid-run → double-run/double-post (at-least-once theo ADR-013, cần lease-heartbeat — backlog); authorize gate `return true` (#8 i-001 chấp nhận); review_history lưu findings chưa redact (trong-tenant).
- 7 rule kinh nghiệm append CLAUDE.md. Thêm 3 test hồi quy. Sửa xong chạy lại `report:all` = **85/85 PASS**.
- Trạng thái cuối i-002: review = done (mọi bug đã sửa & verify). Pipeline i-002 HOÀN TẤT.
