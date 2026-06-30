# Live-spec — Trạng thái hợp nhất (.spec/main)

> Nhật ký as-built rút gọn toàn hệ thống. Chi tiết theo từng i-NNN nằm trong `.spec/integration/i-NNN/live-spec.md`.

## [2026-06-25] /tn-yeu-cau (i-001) — review-pr-slack-azure
- Khởi tạo dự án (greenfield) + bootstrap pipeline `.spec`.
- Chốt FRD cho Slack bot review PR Azure DevOps: lệnh `@tieu-nhi <project> review <link>`; multi-project (repo + token Claude + Azure PAT, secret mã hoá); trả review về Slack thread; Web Admin UI (login Azure PAT); auto-select skill theo loại file; xử lý bất đồng bộ.
- Bước kế: `/tn-thiet-ke i-001`.

## [2026-06-25] /tn-thiet-ke (i-001) — review-pr-slack-azure
- Chốt kiến trúc: Modular Monolith Node.js+TS, Admin UI ReactJS; store MongoDB (pool + ownerId filter); queue trong MongoDB + worker poll, max concurrency 5; chạy skill `.claude/skills` qua Claude Code CLI headless (token/model/effort theo project).
- Tạo mới main/sad.md (SAD living) + main/feature/review-pr-slack-azure/tech.md; 11 ADR (ADR-001..011).
- Default model/effort: claude-sonnet-4-6 / medium. Bảng map file→skill + giới hạn an toàn đã chốt.
- Bước kế: /tn-bao-mat i-001.

## [2026-06-25] /tn-bao-mat (i-001) — review-pr-slack-azure
- Chốt baseline bảo mật: secret AES-256-GCM (master key ENV, keyVersion); owner=Azure userId/email self-service (bất kỳ PAT hợp lệ); Slack mọi người review mọi project (residual leakage chéo chấp nhận).
- Tạo mới main/security.md (baseline living) + main/feature/review-pr-slack-azure/security.md.
- Nguyên tắc bắt buộc: tenant isolation ở repository layer, secret write-only, allowlist field chống mass assignment, spawn argv chống injection, verify Slack signature + HTTPS, rate-limit/quota/idempotency, xoá clone finally, audit bất biến.
- Bước kế: /tn-kiem-thu i-001.

## [2026-06-25] /tn-kiem-thu (i-001) — review-pr-slack-azure
- Thiết kế test 19 mục + 24 E2E Locators (Admin UI React); cascade main/feature/review-pr-slack-azure/test.md.
- Ưu tiên Risk-Based: tenant isolation/secret (CRITICAL), concurrency/idempotency (HIGH), integration resiliency, injection.
- Bước kế: /tn-ke-hoach i-001.

## [2026-06-25] /tn-ke-hoach (i-001) — review-pr-slack-azure
- Lập plan.md: 17 task (T1..T17), đồ thị phụ thuộc, đường găng, checklist Done tổng (chức năng+bảo mật+test+quy trình). plan không cascade.
- Sẵn sàng vào /tn-code i-001 (cả 5 doc frd/tech/security/test/plan đều approved, open_questions=0).

## [2026-06-25] /tn-code (i-001) — review-pr-slack-azure
- Hiện thực 17 task: Node.js+TS modular monolith (Clean Arch) + React Admin UI; build backend & UI đều typecheck EXIT 0.
- Bảo mật theo plan: ép ownerId ở repository, secret AES-256-GCM write-only, spawn argv không shell + key qua ENV, verify Slack signature, rate-limit, DB-queue atomic claim + lease, xoá clone finally, audit bất biến.
- Lệch ghi nhận: Azure metadata qua REST fetch; tên project unique toàn hệ thống (#9); skill xuất JSON finding (fallback markdown).
- Bước kế: /tn-bao-cao i-001.

## [2026-06-25] /tn-bao-cao (i-001) — review-pr-slack-azure
- Chạy thật 21 unit test logic thuần (21 PASS/0 FAIL) + build backend & React (EXIT 0). 29 PASS / 0 FAIL / 28 BLOCKED.
- BLOCKED: functional/integration/E2E cần MongoDB + credential + app trên trình duyệt (chưa có môi trường). Defect=0 từ test đã chạy.
- NO-GO release tới khi chạy thật IDOR/concurrency/tích hợp. Locator khớp 100% test.md.
- Bước kế: /tn-review i-001.

## [2026-06-25] /tn-review (i-001) — review-pr-slack-azure
- review-code: 0 CRITICAL / 2 HIGH / 3 MEDIUM / 1 LOW. Đã sửa BUG-01..05 (max-attempts+dead-letter, requeue retryable+backoff, idempotency guard theo jobId, nameLower unique case-insensitive, supersedes). BUG-06 (LOW) ghi nhận.
- 6 rule thêm vào CLAUDE.md. Verify: build EXIT 0, 21 unit PASS. review = done.

## [2026-06-25] /tn-bao-cao (i-001) lần 2 — review-pr-slack-azure
- Sau bugfix: 26 unit PASS / 0 FAIL (thêm TC-18 + retryable), build EXIT 0. 35 PASS / 0 FAIL / 27 BLOCKED. NO-GO tới khi có MongoDB + credential để test IDOR/concurrency/tích hợp + bugfix end-to-end.

## [2026-06-26] /tn-sinh-test (i-001) — review-pr-slack-azure (phân tầng test)
- Phân tầng `test.md` thành Test Pyramid: Unit 30 / Functional 19 / E2E 7 (56 case) + ma trận truy vết. Cascade vào `main/feature/review-pr-slack-azure/test.md`. Pyramid khỏe mạnh (54/34/12%).
- Khoảng trống không-chặn: #9 trùng tên project, audit-log schema, anomaly cost/dò-id, token tối đa/PR (MEDIUM); help/status/cancel + retention (LOW). Bước kế: /tn-ke-hoach i-001.

## [2026-06-26] /tn-review (i-001) lần 2 — review-pr-slack-azure
- Dựng auto-test 3 tầng (Unit 44 / Functional 15 supertest+mongodb-memory-server / E2E 6 Playwright). Phát hiện F-1: login PAT sai trả 400 thay vì 401 → sửa BUG-07 (map AuthError/401). BUG-08 (audit login-fail) ghi nhận chưa sửa. Rule mới vào CLAUDE.md. review = done.

## [2026-06-30] /tn-yeu-cau (i-002) — review-pr-slack-azure
- Delta cách giao kết quả review về Slack: (1) **luôn file `.md`** + 1 dòng tóm tắt inline, **fallback chia nhỏ chat** khi upload lỗi; (2) **fan-out** theo khóa `(projectId, prId, commitHash)` — lệnh trùng lúc đang chạy → đăng ký delivery target + ack chờ, kết quả tới tất cả; (3) **cache-serve từ DB** khi khóa đã `completed` (không tốn token) + lệnh `fresh`/`rerun` ép chạy lại (supersedes).
- **Override i-001**: ADR-007 reject-duplicate → subscribe-and-fanout; output "đính-kèm-khi-dài" → luôn file `.md`.
- frd = approved, open_questions = 0. Bước kế: `/tn-thiet-ke i-002`.

## [2026-06-30] /tn-thiet-ke (i-002) — review-pr-slack-azure
- 5 ADR mới (ADR-012..016): output luôn file `.md`+tóm tắt (upload external, fallback chunk); fan-out `deliveryTargets[]`+status per-target (override ADR-007 reject→subscribe, atomic upsert); cache-serve từ History (fresh/rerun→supersedes); không lưu artifact (dựng từ History); khóa commit-aware.
- Cascade: sad.md (ADR registry + nguyên tắc #3/#4 + rủi ro fan-out leak) + feature/review-pr-slack-azure/tech.md.
- tech = approved, open_questions = 0. Bước kế: `/tn-bao-mat i-002`.

## [2026-06-30] /tn-bao-mat (i-002) — review-pr-slack-azure
- Đánh giá bảo mật delta giao kết quả: `[HIGH]` file `.md` rời Slack không xoá được (redaction+minimization), subscribe-bypass (`authorizeReviewCommand` mọi entrypoint), spoof target (lấy từ event verify), DoS `fresh`+cap deliveryTargets; `[MEDIUM]` mention injection fallback, scope `files:write` least-privilege.
- Fan-out/cache-serve cross-owner: chấp nhận residual nối tiếp #8 i-001 (không cấp quyền mới). Cascade: main/security.md + feature/security.md.
- security = approved, open_questions = 0. Bước kế: `/tn-kiem-thu i-002`.

## [2026-06-30] /tn-kiem-thu (i-002) — review-pr-slack-azure
- Test design delta giao kết quả: 20 TC (TC-201..220) + Decision Table định tuyến R1–R6 + State Transition (delivery target/supersede) + Permission Matrix + Security/Concurrency cases + E2E Locators (Admin UI deliveries/superseded/cache-hit).
- Trọng tâm: atomic upsert, idempotent fan-out khi reclaim, bypass authorize, cache hợp-lệ-vs-failed/superseded, fallback file→chat, redaction, neutralize mention, cap target. Regression i-001: TC-16/FT-16/E2E-07 reject→subscribe + output→file .md.
- test = approved, open_questions = 0. Bước kế: `/tn-sinh-test i-002` rồi `/tn-ke-hoach i-002`.

## [2026-06-30] /tn-sinh-test (i-002) — review-pr-slack-azure
- Phân tầng test i-002: Unit 18 / Functional 19 / E2E 7 (44 case) + ma trận truy vết (17 yêu cầu phủ đủ). Hình dạng 41/43/16% — Functional nhỉnh hơn Unit do delta thiên tích hợp/đồng thời; E2E nhỏ nhất (không ice-cream cone). Cascade vào feature/test.md.
- Khoảng trống MEDIUM (không chặn): redaction data-driven, load fan-out cap-max, giới hạn file Slack. test (phân tầng) xong. Bước kế: `/tn-ke-hoach i-002`.

## [2026-06-30] /tn-ke-hoach (i-002) — review-pr-slack-azure
- `plan.md` i-002: 16 task (T1–T16) + đồ thị phụ thuộc + Done tổng + rủi ro. Đường găng T2→T6→T8→T11→T16, nhánh T9→T12, T15 regression i-001, T14 UI sau T13.
- plan = approved, open_questions = 0 (không cascade). Bước kế: `/tn-code i-002` (gate cứng đã thoả).

## [2026-06-30] /tn-code (i-002) — review-pr-slack-azure
- Hiện thực 16 task delta giao kết quả: file .md+tóm tắt (upload external) → fallback chunk chat; fan-out deliveryTargets[] + per-target atomic idempotent; enqueueOrSubscribe atomic; cache-serve từ History (0 token) + fresh/supersedes; redaction secret + neutralize mention; authorize mọi entrypoint; Admin UI deliveries/superseded/cache-hit.
- Sửa bug idempotency markTargetDelivered (matchedCount thay modifiedCount). Typecheck sạch; Unit 56/56 + Functional 20/20 PASS.
- code = done. Bước kế: `/tn-bao-cao i-002` (chạy test thật + report; gồm Playwright Admin UI).

## [2026-06-30] /tn-bao-cao (i-002) — review-pr-slack-azure
- `npm run report:all` → **82/82 PASS** (Unit 56 · Functional 20 mongodb-memory-server · E2E 6 Playwright). 0 FAIL/BLOCKED. Harness từng NO-GO ở i-001 nay chạy thật.
- 1 defect HIGH (idempotency markTargetDelivered) đã sửa trong /tn-code; FT-204 PASS. Kết luận **GO** cho i-002. Khoảng hở MEDIUM (E2E i-002 Playwright, redaction data-driven, load fan-out) → /tn-review.
- report = approved. Bước kế: `/tn-review i-002`.

## [2026-06-30] /tn-review (i-002) — review-pr-slack-azure
- Review chuyên sâu + 2 agent finder: 6 bug (1 CRITICAL BUG-09 complete-before-fanout mất giao kết quả; 2 HIGH redaction false-negative + race_none silent; 3 MEDIUM/LOW). Tất cả đã sửa + 3 test hồi quy → 85/85 PASS. 7 rule vào CLAUDE.md.
- review = done. **Pipeline i-002 HOÀN TẤT** (frd→tech→security→test→plan→code→report→review).
