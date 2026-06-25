---
integration: i-001
feature: review-pr-slack-azure
stage: plan
status: approved
open_questions: 0
updated: 2026-06-25
---

# Tổng Quan & Phạm Vi

Hiện thực **Slack bot "tieu-nhi"** review PR Azure DevOps + **Web Admin UI (ReactJS)**, theo kiến trúc **Modular Monolith Node.js + TypeScript** (Clean Architecture nội bộ), store **MongoDB**, **queue trong DB** (worker poll, max concurrency 5), chạy skill `.claude/skills` qua **Claude Code CLI headless**.

**In-scope (bám frd.md):** Slack command listener/parser + ack async; multi-project registry + secret mã hoá + Admin UI (login Azure PAT, owner-scoped); lấy PR + clone/đọc codebase + tài liệu; map file→skill + chạy skill; post kết quả theo severity vào Slack thread; idempotency/concurrency; audit + lịch sử + rate-limit.

**Out-of-scope (frd):** comment ngược Azure PR; auto approve/merge; GitHub/GitLab; auto-review khi có PR mới.

**Cấu trúc thư mục dự kiến (Clean Architecture):**
```
src/
  domain/        # Project, Owner, ReviewJob, Finding (entity/VO, không phụ thuộc framework)
  application/   # use-cases: orchestration, registry, identity, audit
  adapters/      # ports impl: slack/, azure/, skillrunner/, mongo/, crypto/
  api/           # Admin REST (Express/Nest) + Slack events endpoint
  worker/        # queue poller + review pipeline
  config/        # ENV loader, model/effort catalog
web-admin/       # ReactJS SPA (data-testid theo test.md)
```

# Danh Sách Task

| Task | Mô tả | Phụ thuộc | Tham chiếu (frd / tech / security / test) | Tiêu chí Done |
|------|-------|-----------|-------------------------------------------|----------------|
| **T1** | Scaffold Node/TS + Clean Architecture skeleton; ENV loader; **model/effort catalog** (default `claude-sonnet-4-6`/`medium`) | — | tech ADR-001/002/006; frd Assumption #7 | Build/lint/test runner chạy; catalog đọc được; default áp đúng |
| **T2** | Kết nối MongoDB + **base repository layer ép `ownerId` bắt buộc**; index (compound `ownerId`, `(status,availableAt)`, unique idempotency) | T1 | tech ADR-005, Multi-Tenant; sec #10 tenant isolation; test TC-15, Concurrency | Repo không cho query thiếu `ownerId`; index tạo; test cross-tenant fail-closed |
| **T3** | Module **crypto secret** AES-256-GCM (IV riêng + auth tag + `keyVersion`), master key từ ENV; redaction helper | T1 | sec Encryption/Secret Mgmt #17/#18; frd Rủi ro Dữ liệu; test "secret không lộ" | Mã hoá/giải mã round-trip; secret không log; keyVersion lưu kèm |
| **T4** | **Identity & Ownership**: verify Azure PAT → `AzureIdentity(userId,email)`; cấp session JWT (httpOnly+Secure+SameSite, exp ngắn) | T1,T2 | frd Phân quyền; sec Auth #4, ZeroTrust; tech Auth; test TC-09/10, SC-7 | PAT hợp lệ→session; sai→lỗi an toàn; định danh ổn định khi PAT đổi |
| **T5** | **Project Registry** domain + repo: Project aggregate (RepoBinding/ModelConfig/EncryptedSecret/DocSources/status); validate model/effort/repo; chặn duplicate (tên/repo); snapshot-able | T2,T3 | frd Business Rule; tech Aggregate; sec API3/Mass Assignment; test TC-11/12/13, EP | CRUD owner-scoped; validate chặn giá trị sai; duplicate→409; secret ghi qua T3 |
| **T6** | **Admin REST API**: `/auth/login`, CRUD `/projects` (ownerId từ session, **allowlist field**), `:id/test-connection`, `:id/reviews` (paginate), `meta/models`; secret **write-only** | T4,T5,T8,T9 | tech API Review; sec BOLA/Mass Assignment/CORS; test API Test Cases | 404 cho project người khác; response không chứa secret; mass-assignment bị chặn; CORS/headers |
| **T7** | **Admin UI (ReactJS)**: Login, Dashboard, Project Form (secret write-only + cờ "đã cấu hình"), test-connection, Review History; gắn **`data-testid`** theo bảng E2E Locators | T6 | test E2E Locators; sec XSS/CSRF | UI khớp data-testid; không `dangerouslySetInnerHTML`; cờ secret thay vì giá trị |
| **T8** | **IAzureClient (ACL)**: PR metadata/diff/file; clone nhánh nguồn; validate repo URL (chống SSRF); retry/backoff/timeout | T1 | tech Integration/ACL ADR-011; frd Luồng 5/6; sec SSRF; test Integration | Lấy PR + clone ok; URL nội bộ bị chặn; timeout/retry; mismatch repo phát hiện |
| **T9** | **ISkillRunner (ACL)**: spawn `claude -p` **argv (không shell)**, ENV key (không qua arg), `--model`+effort, cwd=clone, **tool tối thiểu/permission-mode chặt**, timeout+kill, parse finding (ưu tiên JSON) | T1,T3 | tech ADR-003/Tech Debt; sec Injection/Prompt Injection/Secret; test Security/Negative | Chạy skill thật; key không lộ `ps`/log; treo→kill; prompt injection không điều khiển |
| **T10** | **ISlackPort (ACL)**: Bolt; **verify signing secret + timestamp**; ack<3s; post thread (block-kit theo severity) + đính kèm khi dài; react ✅/⚠️ | T1 | frd Luồng 2/9/10; tech API/Slack; sec Spoofing; test TC-01, Output, SC-1 | Ack<3s; chữ ký sai→401; output tóm tắt+chi tiết; dài→đính kèm |
| **T11** | **CommandParser + Resolver**: parse `@tieu-nhi <project> review <url>`; normalize link (`<...>`/query); validate PR URL; resolve project (case-insensitive, owner-scope); thông báo cú pháp/lỗi | T5,T10 | frd Luồng 3/Logic#map; tech UbiqLang; test TC-02..08, EP/Edge | Cú pháp sai→hướng dẫn; link bọc→parse đúng; project lạ/mismatch→báo đúng |
| **T12** | **DB-backed queue**: collection `review_jobs`; enqueue idempotent `(project,pr,commit)` (unique index); **atomic `findOneAndUpdate` claim**; **lease/visibility timeout + reclaim**; trạng thái vòng đời | T2 | tech ADR-004/007, Integration Failure; sec DoS; test Concurrency, State Transition | Double-submit→1 job; 2 worker→1 thắng; crash→reclaim; >5 xếp hàng |
| **T13** | **ContextBuilder**: clone vào thư mục riêng theo jobId; thu thập tài liệu (in-repo `.spec/`,`docs/`,README,`*.md` + nguồn cấu hình); **lọc file + giới hạn** (≤50 file, ≤5.000 dòng, bỏ binary/lock); **map file→skill** (đa-skill) | T8 | tech ADR-008/009, giới hạn an toàn; frd Luồng 6/7; test Decision Table, BVA, Edge | Map đúng bảng; vượt giới hạn→cắt+báo; thiếu tài liệu→ghi chú; binary bỏ |
| **T14** | **Review Worker pipeline**: poll→claim→**snapshot config+skillVersion**→fetch(T8)→context(T13)→dispatch skills(T9)→**aggregate finding theo severity**→post(T10)→**cleanup clone trong `finally`**; concurrency 5; token cô lập theo job | T9,T10,T12,T13,T16 | tech Domain Events/SoT/Temporal; frd Luồng 7/8; sec token cô lập/clone lifecycle; test SC-5/8/9, Integration, Concurrency | Pipeline chạy E2E; snapshot đúng commit/skill; clone luôn xoá; token không lẫn |
| **T15** | **Slack Gateway endpoint**: `POST /slack/events` (challenge + verify), `authorizeReviewCommand(actor,project)` (hiện allow-all), **rate-limit** per-user/period, enqueue(T12), ack(T10) | T10,T11,T12,T17 | frd #8 chính sách mở; tech Authz; sec DoS/rate-limit/ZeroTrust; test TC-19, Security | Event hợp lệ→ack+enqueue; rate-limit chặn vượt ngưỡng; hook authz tập trung |
| **T16** | **Audit & History**: audit log bất biến (lệnh review: ai/project/PR/commit/skill/**cost token**; thay đổi cấu hình/secret — không giá trị); review history bất biến (`supersedes`) | T2 | frd Audit; tech Historical; sec Audit #19/Event Catalog; test Audit | Mọi hành động ghi vết; secret không vào log; history truy lại được + cost |
| **T17** | **Cross-cutting**: structured logging + **correlation id** + **secret redaction**; error an toàn (không stacktrace/secret ra Slack/UI); **circuit breaker theo project token**; metrics (queue depth/cost/error) + alert anomaly | T1,T3 | tech Observability/Resiliency; sec Monitoring/Data Leakage/Incident; test Integration, Bug Prediction | Log JSON có correlation id, không secret; lỗi sạch; CB mở khi project lỗi liên tục |

# Đồ Thị Phụ Thuộc

```
T1 (scaffold + catalog)
 ├─ T2 (mongo + repo ownerId) ─┬─ T5 (registry) ─┐
 │                             ├─ T12 (queue)    │
 │                             └─ T16 (audit)    │
 ├─ T3 (crypto) ──────────────── T5, T9, T17     │
 ├─ T8 (azure ACL) ───────────── T13 ─┐          │
 ├─ T9 (skill runner ACL) ────────────┤          │
 ├─ T10 (slack ACL) ──────── T11 ──────┤          │
 └─ T17 (observability/CB) ───────────┤          │
                                       │          │
T4 (identity/JWT) ── T6 (admin API) ◀──┴─ T5, T8, T9
                       └─ T7 (React Admin UI)
T13 + T9 + T10 + T12 + T16 ──▶ T14 (worker pipeline)
T10 + T11 + T12 + T17 ──▶ T15 (slack gateway)
```

**Đường găng (critical path):** `T1 → T2 → T5 → (T8/T9) → T13/T14` cho luồng review; `T1 → T2 → T3 → T4 → T6 → T7` cho Admin.

**Thứ tự thực thi an toàn (đề xuất):**
1. **Nền:** T1 → T2 → T3.
2. **Cô lập & danh tính:** T4, T16, T17 (song song được sau T1/T2/T3).
3. **ACL ports:** T8, T9, T10 (song song).
4. **Registry & Admin:** T5 → T6 → T7.
5. **Orchestration:** T11, T12, T13 → **T14** → T15.

# Tiêu Chí Done Tổng (Checklist nghiệm thu)

**Chức năng (frd):**
- [ ] Lệnh `@tieu-nhi <project> review <url>` ack < 3s và trả kết quả theo severity vào thread (SC-1, TC-01).
- [ ] Multi-project + Admin UI owner-scoped + secret mã hoá + model/effort theo project (default đúng).
- [ ] Map file→skill đúng bảng Decision Table; PR chỉ-tài-liệu / chỉ-code xử lý đúng (SC-2/3).
- [ ] Xử lý đầy đủ luồng ngoại lệ (sai cú pháp, project lạ, repo mismatch, PAT/credit lỗi, PR rỗng).

**Bảo mật — mọi mitigation đã xử lý (security.md):**
- [ ] `ownerId` ép ở **repository layer**; project người khác → 404 (CRITICAL).
- [ ] Secret **write-only** + AES-256-GCM (IV/tag/keyVersion); không lộ ở response/log/error/Slack/arg (CRITICAL).
- [ ] **Allowlist field** create/update; `ownerId`/`status` server-side (CRITICAL).
- [ ] Spawn `claude`/`git` dạng **argv không shell**; CLI quyền tool tối thiểu (prompt/command injection) (HIGH).
- [ ] Verify Slack signing secret + timestamp; HTTPS; JWT ngắn hạn; PAT không lưu/log (HIGH).
- [ ] Rate-limit + quota + concurrency 5 + idempotency; alert anomaly cost & dò id (HIGH).
- [ ] Xoá temp clone trong `finally`; clone riêng theo job; minimization dữ liệu gửi Claude.

**Kiểm thử — mọi Test Case có cách kiểm chứng (test.md):**
- [ ] Tenant isolation/IDOR/secret (TC-14/15, Security) — must-fix trước release.
- [ ] Concurrency/idempotency (double-submit, 2 worker, reclaim, >5 job).
- [ ] Integration resiliency (Azure/Claude/Slack lỗi/timeout/hết credit; history trước post).
- [ ] BVA giới hạn an toàn (≤50 file, ≤5.000 dòng, rate-limit 5/10’).
- [ ] E2E Admin UI dùng đúng `data-testid` theo bảng E2E Locators.

**Quy trình:**
- [ ] Không còn open question chặn (đã = 0 ở cả 4 doc).
- [ ] Skill `.claude/skills` + Claude CLI **pin version**; ghi `skillVersion` vào job (tái lập).
- [ ] Back-prop: locator/route thực tế khác đề xuất → cập nhật ngược test.md (CONVENTION mục 7).

# Rủi Ro & Giả Định

**Rủi ro (kéo từ doc):**
- `[CRITICAL]` Quên filter `ownerId` ở 1 endpoint → leak cross-tenant → bắt buộc ép ở repository layer + test cross-tenant tự động (T2).
- `[CRITICAL]` Secret lọt log/arg/`ps` → redaction + ENV tiến trình con (T3/T9/T17).
- `[HIGH]` DB-queue tự viết (claim/lease) dễ sai cạnh tranh → test concurrency kỹ; dùng atomic + unique index (T12).
- `[HIGH]` Token mix-up giữa 5 job song song → truyền token qua closure/biến cục bộ, không global (T14).
- `[HIGH]` Đổi skill `.claude` → đổi output → pin version + snapshot skillVersion (T9/T14).
- `[HIGH]` Prompt injection từ nội dung PR → tool tối thiểu + đóng khung untrusted (T9).
- `[MEDIUM]` Parse finding từ markdown skill → ưu tiên skill xuất JSON để aggregate đáng tin (T9).

**Giả định / điểm chốt tường minh:**
- Slack "mọi người review mọi project" (#8 đã chốt) → `authorizeReviewCommand` hiện allow-all, giữ sẵn để siết.
- Self-service: bất kỳ PAT Azure hợp lệ tạo owner (#2 đã chốt) → bù rate-limit/quota/audit.
- Master key ở ENV (#3 đã chốt) → nâng KMS/Vault là việc tương lai.

**Lỗ hổng spec còn mở (không chặn code, theo dõi):**
- `[→ nghiệp vụ]` #9 tên project duy nhất toàn hệ thống (ảnh hưởng resolve khi trùng tên) — khuyến nghị áp duy-nhất-toàn-hệ-thống khi code T5/T11.
- `[→ nghiệp vụ/pháp lý]` #7 đồng ý dữ liệu khách hàng qua Anthropic.
- Token tối đa/PR cụ thể; retention history/audit; lệnh phụ `help/status/cancel` (LOW).
</content>
