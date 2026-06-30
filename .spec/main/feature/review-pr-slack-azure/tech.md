---
feature: review-pr-slack-azure
stage: tech
status: approved
source: [i-001, i-002]
updated: 2026-06-30
---

# Tóm Tắt Kiến Trúc

Thiết kế **Slack bot "tieu-nhi"** review tự động PR Azure DevOps, hiện thực dạng **Modular Monolith (Node.js + TypeScript)** triển khai trên một deployable duy nhất, tách module rõ theo bounded context. UI quản trị là **ReactJS SPA** gọi REST API của cùng monolith. *(nguồn: i-001)*

### C4 — Mức Context

```
 Người dùng ──@tieu-nhi <project> review <pr-url>──▶ Slack ──▶ tieu-nhi (Modular Monolith Node/TS)
 Admin(owner) ──login PAT / CRUD project (HTTPS)──▶ React Admin UI ──▶ Admin API
 tieu-nhi ──PAT/project──▶ Azure DevOps (Git+PR API)
 tieu-nhi ──ANTHROPIC_API_KEY/project──▶ Claude Code CLI headless (claude -p)
 tieu-nhi ──▶ MongoDB (registry/secret/queue/audit/history)
```

### C4 — Mức Container

| Container | Công nghệ | Trách nhiệm |
|-----------|-----------|-------------|
| Slack Gateway | Slack Bolt (TS) | Nhận mention, verify signing secret, ack < 3s, parse, enqueue, post thread |
| Admin API | Express/Nest (TS) REST | Login Azure PAT, CRUD project owner-scoped, test-connection, secret write-only |
| Admin UI | ReactJS SPA | Quản trị project qua HTTPS |
| Review Worker | Node worker | Poll job Mongo, điều phối review, max concurrency = 5 |
| Skill Runner | spawn `claude -p` | Chạy `.claude/skills` trong repo clone, token+model+effort theo project |
| Azure DevOps Client | azure-devops-node-api + git | PR metadata/diff/file, clone nhánh nguồn |
| MongoDB | MongoDB | Registry, secret mã hoá, queue collection, audit, history |

**Trọng yếu:** `[CRITICAL]` mã hoá secret at-rest; `[CRITICAL]` xung đột isolation Admin(owner) vs Slack(mọi người) — FRD #8; `[HIGH]` idempotency `(project,pr,commit)`; `[HIGH]` prompt injection từ nội dung PR; `[HIGH]` snapshot config lúc enqueue.

# Domain Model

| Domain | Loại | Trách nhiệm |
|--------|------|-------------|
| Review Orchestration | **Core** | Vòng đời lệnh review: nhận→enqueue→fetch→run skill→aggregate→post Slack |
| Project Registry & Secrets | **Core** | Cấu hình project, mã hoá/giải mã secret, cô lập owner |
| Skill Execution | Supporting | Adapter chạy `.claude/skills` qua CLI; map file→skill |
| Identity & Ownership | Supporting | Định danh owner từ Azure PAT; phiên Admin UI |
| Azure DevOps Access | Generic | Git/PR — SDK qua ACL |
| Slack Gateway | Generic | Nhận/đăng message — Bolt qua adapter |
| Audit & History | Supporting | Ghi vết lệnh, thay đổi cấu hình, lịch sử kết quả |

`[MEDIUM]` Core dễ phình → tách `CommandParser`/`ContextBuilder`/`SkillDispatcher`/`FindingAggregator`/`SlackPresenter`.

# Ubiquitous Language

| Khái niệm | Tên hiện tại | Vấn đề | Khuyến nghị |
|-----------|--------------|--------|-------------|
| Chủ sở hữu project | owner/admin | "admin" nhầm quyền toàn cục | **Owner** |
| Một lần review | job/task | lẫn lộn | **ReviewJob**; "task"=skill run nội bộ |
| Dự án cấu hình bot | project | trùng Azure project | **Project** (bot) vs **AzureProject/repo** |
| Token Claude | API key | nhiều tên | **ClaudeApiKey** |
| Mức reasoning | effort | trùng estimate | **ReasoningEffort** |
| Đơn vị xuất skill | finding/issue | lẫn lộn | **Finding** + `severity` |

# Bounded Context

ACL bọc hệ ngoài (Slack/Azure/Claude CLI). Project Registry là Customer-Supplier (upstream) của Review Orchestration. Identity là Conformist với Azure.
- `[HIGH]` Coupling: Core gọi thẳng SDK/CLI → đổi provider vỡ Core. Bắt buộc `IAzureClient`/`ISkillRunner`/`ISlackPort`.
- `[MEDIUM]` Slack Gateway & Admin API dùng chung 1 module Registry.

# Aggregate Design

| Aggregate Root | Bên trong | Ghi chú |
|----------------|-----------|---------|
| Project | `RepoBinding`, `ModelConfig`, `EncryptedSecret`, `DocSources[]`, `status` | secret VO write-only |
| Owner | `AzureIdentity(userId,email)` | không dùng PAT làm khoá |
| ReviewJob | `Command`, `Target(projectId,prId,commitHash)`, `JobStatus`, `Finding[]`, `SkillRun[]`, `cost` | idempotency `(project,pr,commit)` |
| AuditEntry | append-only | 1 entry/hành động |

`[HIGH]` Không nhúng job vào Project (tham chiếu projectId). `[LOW]` enqueue+audit nên cùng thao tác (Mongo txn/outbox).

**(i-002)** `ReviewJob` mở rộng: `deliveryTargets[]` (`{channel, threadTs, userId, status: pending|delivered|failed, mode: file|chat|cache, deliveredAt, error?}`, cap ~50/job), `supersedesJobId`/`supersededByJobId` (ghi thực khi rerun), `cacheEligible` (dẫn xuất). `ReviewReport (.md)` KHÔNG lưu trong aggregate — dựng on-demand từ History (ADR-015). `[HIGH]` cập nhật status per-target phải atomic (`arrayFilters` status=pending) chống double-delivery khi reclaim (ADR-013).

# Domain Events

Catalog: `ReviewCommandReceived → ReviewJobQueued → ReviewJobStarted (+ConfigSnapshotTaken) → PullRequestFetched/Failed → ContextPrepared → SkillRunCompleted/Failed/Partial → FindingsAggregated → ReviewJobCompleted/Failed → TempCloneCleaned`; cấu hình: `ProjectCreated/Updated/Deleted`, `SecretRotated`.
- `[HIGH]` thiếu `ReviewJobDuplicateRejected` & `ConfigSnapshotTaken` nếu không thêm. `[MEDIUM]` thiếu cleanup khi job lỗi. Không có circular event.
- **(i-002)** Catalog event delta: bỏ `ReviewJobDuplicateRejected` khỏi luồng hợp lệ → thêm `DeliveryTargetRegistered` (subscribe), `ReviewResultServedFromCache` (cache-hit), `ReviewRerunRequested` (fresh→`ReviewJobQueued(supersedes)`), `ResultDelivered`/`ResultDeliveryFailed` (per-target), `ReviewJobDelivered` (fan-out xong). `EnqueueOrSubscribe` = atomic upsert: active job → register; completed hợp lệ → cache-serve; else queue (ADR-013/014).

# Event Storming

Command→Event→Policy→Read Model: JobQueue, PR metadata/diff, SkillRun results, ReviewSummary, Slack thread/History.
- `[HIGH]` thiếu Read Model "đang chạy" (chống double-submit). `[MEDIUM]` thiếu Read Model cost/quota theo owner-period; thiếu policy dọn clone khi lỗi.

# Data Ownership Matrix

| Data Item | Owner ghi | Master | Consumer | Sửa | Vấn đề |
|-----------|-----------|--------|----------|-----|--------|
| Project config | Registry | MongoDB | Slack/Worker/Admin | Owner | `[CRITICAL]` filter ownerId |
| Secret | Registry | MongoDB (enc) | Worker/Runner (ENV) | Owner write-only | `[CRITICAL]` không trả lại |
| Owner identity | Identity | Azure (suy ra) | Registry/Audit | hệ thống | `[HIGH]` không dùng PAT làm khoá |
| PR meta/diff/code | — | **Azure DevOps** | Worker/Runner | read-only | OK |
| ReviewJob+Finding | Orchestration | MongoDB | Slack/Admin | hệ thống | `[MEDIUM]` ai xem history |
| Audit | Audit | MongoDB | nội bộ | append-only | OK |
| Model/effort catalog | System config | file/DB | Validation/UI | maintainer | `[MEDIUM]` cập nhật model mới |

# Source Of Truth Matrix

| Data Item | Ứng viên | SoT | Conflict |
|-----------|----------|-----|----------|
| PR/diff/file | Azure / clone | **Azure @ commitHash đã chốt** | tin commit snapshot lúc start; commit mới sau → review cũ ghi rõ commit |
| Cấu hình project | MongoDB | **Mongo (snapshot lúc enqueue/start)** | sửa giữa chừng → dùng snapshot |
| Owner identity | Azure profile/PAT | **Azure userId/email** | PAT chỉ xác thực; định danh từ profile |
| Resolve `<project>`→repo | tên người gõ | **Registry** (phạm vi #9) | trùng tên giữa owner → quy tắc (chốt sau) |
| Tài liệu hệ thống | in-repo + cấu hình | **hợp nhất, in-repo trước** | trùng path → in-repo ưu tiên |

# Historical Data Analysis

Snapshot `commitHash` + cấu hình + **skill version** vào job; History bất biến (review lại = bản ghi mới, `supersedes`).
- `[HIGH]` không snapshot skill version → kết quả không tái lập (skill là shared dependency có version). `[MEDIUM]` đánh dấu supersedes.

# Data Lifecycle Analysis

Project: create→active→disabled→soft-delete(+huỷ job chờ). Job/History: theo Retention (mặc định ~180 ngày, cấu hình). Temp clone: xoá ngay sau xử lý.
- `[CRITICAL]` temp clone phải xoá kể cả khi lỗi (`try/finally` + dọn rác mồ côi). `[MEDIUM]` retention chốt ở `/tn-bao-mat`. `[MEDIUM]` xoá project → huỷ job chờ.

# Architecture Pattern Review

Modular Monolith (Clean Arch nội bộ); **DB-backed queue** (collection `review_jobs`, `findOneAndUpdate` atomic claim); worker pool **max 5**.
- `[MEDIUM]` poll latency (backoff + index); `claude -p` nặng → timeout cứng + kill treo. `[LOW]` Clean Arch mỏng cho CRUD Admin.

# API Review

`/api/v1`: `auth/login` (PAT→JWT), `projects` (CRUD owner-scoped, ownerId từ session), `:id/test-connection`, `:id/reviews` (paginate), `meta/models`. Slack: `POST /slack/events` (verify signing secret + challenge).
- `[HIGH]` không nhận ownerId từ client; 404 cho project người khác. `[MEDIUM]` versioning + pagination + 409 trùng tên/repo. `[MEDIUM]` Slack < 3s rồi xử lý nền.

# Integration Review

| Hệ ngoài | Retry | Timeout | Fallback | CB | Rủi ro |
|----------|-------|---------|----------|----|--------|
| Azure API | có (429-aware) | 30s | retry job | theo host | `[HIGH]` |
| Azure clone | 1-2 | có | **review trên diff** | — | `[HIGH]` |
| Claude CLI | backoff | mỗi skill | partial + ghi skill lỗi | theo project token | `[HIGH]` |
| Slack | có | có | lưu history trước | — | `[MEDIUM]` |
| MongoDB | retryWrites | có | — | — | `[HIGH]` |

`[HIGH]` ghi history TRƯỚC khi post Slack. `[MEDIUM]` circuit breaker theo project token.

**(i-002)** Slack giao kết quả: upload `.md` qua **2 bước** `files.getUploadURLExternal`→PUT bytes→`files.completeUploadExternal` (`files.upload` đã khai tử); chỉ mark `delivered` sau khi `completeUploadExternal` OK. `[HIGH]` lỗi giữa 2 bước → coi chưa giao, fallback **chunk chat** (<~3000 ký tự, cắt theo section/finding) cùng target; cả hai fail → `delivery_failed` + alert. `[MEDIUM]` tôn trọng 429 `Retry-After` khi fan-out nhiều target/part.

# Integration Failure Analysis

| Kịch bản | Còn chạy? | Mất data? | Xử lý | Mức |
|----------|-----------|-----------|-------|-----|
| Azure timeout/500 | có | không | retry→fail+báo | `[HIGH]` |
| Clone fail/repo lớn | có | không | fallback diff | `[HIGH]` |
| Claude lỗi/treo | có | không | kill+partial | `[HIGH]` |
| Token hết credit | có | không | báo + CB theo project | `[HIGH]` |
| Slack post fail | có | không | retry; còn history | `[MEDIUM]` |
| Mongo down | suy giảm | có thể | health check, gõ lại | `[HIGH]` |
| Worker crash giữa job | có | không | reclaim sau lease timeout | `[HIGH]` |
| 2 worker claim 1 job | — | không | findOneAndUpdate atomic | `[HIGH]` |

`[HIGH]` **lease/visibility timeout** reclaim job `running` mồ côi.

# Multi Tenant Review

Pool model, cô lập bằng `ownerId` + filter bắt buộc ở repository.
- `[CRITICAL]` thiếu filter 1 query → leak chéo (IDOR). `[HIGH]` Slack cho mọi người review mọi project → lộ code/tài liệu project khác (FRD #8); điểm chốt `authorizeReviewCommand`.
- `[HIGH]` **(i-002)** Fan-out + cache-serve đẩy kết quả tới nhiều channel/thread/DM → mở rộng bề mặt lộ dữ liệu chéo; `authorizeReviewCommand` phải áp cho **review + subscribe + cache-serve + `fresh`**. File `.md` rời lên Slack không xoá được từ bot. → ranh giới ở `/tn-bao-mat`.

# Authentication Review

Admin: PAT → Azure profile API → `AzureIdentity` → session JWT (httpOnly, ngắn hạn); không lưu PAT login. Slack: verify signing secret + timestamp.
- `[CRITICAL]` HTTPS bắt buộc, không log PAT/JWT. `[HIGH]` định danh theo userId/email (PAT xoay vòng). `[MEDIUM]` JWT hết hạn ngắn + refresh.

# Authorization Review

Ownership-based (ABAC nhẹ theo `ownerId`). Admin: `project.ownerId===session.ownerId` else 404. Slack review: hiện mọi người (giả định) — điểm chốt `authorizeReviewCommand` (#8).
- `[CRITICAL]` thiếu ownership check → escalation/leak. `[HIGH]` actor không owner xem được output (#8).

# Permission Scope Matrix

| Permission | Scope | Vấn đề |
|------------|-------|--------|
| CRUD project | chỉ owner | `[CRITICAL]` filter ownerId |
| Xem secret | không ai (write-only) | `[CRITICAL]` |
| Ra lệnh review | mọi user workspace (giả định) | `[HIGH]` #8 |
| Xem output thread | mọi người trong kênh | `[HIGH]` lộ chéo |
| Xem history (UI) | owner | `[MEDIUM]` |
| Cập nhật catalog | maintainer | `[LOW]` |

# Security Threat Model

| STRIDE | Threat | Biện pháp | Mức |
|--------|--------|-----------|-----|
| Spoofing | giả Slack event | verify signing secret+timestamp | `[HIGH]` |
| Spoofing | PAT giả login | verify PAT với Azure; session ngắn | `[HIGH]` |
| Tampering | IDOR ownerId/projectId | ownerId từ session; filter; 404 | `[CRITICAL]` |
| Tampering | prompt injection từ PR | tách dữ liệu/chỉ dẫn; PR = untrusted | `[HIGH]` |
| Repudiation | chối lệnh/đổi config | audit (không log secret) | `[HIGH]` |
| Info Disclosure | lộ secret log/UI/lỗi | mã hoá; write-only; lọc log | `[CRITICAL]` |
| Info Disclosure | code qua Claude (3rd party) | cô lập token; đồng ý (#7) | `[HIGH]` |
| DoS | spam đốt token/đầy queue | rate-limit; concurrency 5; quota | `[HIGH]` |
| EoP | thao tác project owner khác | ownership check | `[CRITICAL]` |

> Chi tiết & khoá master ở `/tn-bao-mat`.

# Performance Risks

`[HIGH]` clone+AI chậm/tốn → giới hạn file/diff + cache clone (incremental fetch). `[MEDIUM]` poll Mongo → index `(status,availableAt)`+backoff. `[MEDIUM]` output vượt trần Slack → tóm tắt+đính kèm. `[LOW]` không cache secret lâu trong RAM.

# Scalability Risks

10-100/ngày OK. `[HIGH]` 10.000+ → DB-queue poll bottleneck, chuyển broker; disk/clone I/O nghẽn. `[HIGH]` 100.000+ → tách microservice; token Claude là ràng buộc kinh tế. `[MEDIUM]` concurrency cố định 5 → 1 project chiếm hết slot, cần fair-scheduling sau.

# Observability Gaps

`[HIGH]` correlation id xuyên Slack→job→skill→post. `[HIGH]` structured log lọc secret + token tiêu thụ. `[MEDIUM]` metrics job-status/thời gian/lỗi/cost-theo-project/queue-depth. `[MEDIUM]` alerting config lỗi/queue dồn/breaker/secret hết hạn. `[MEDIUM]` trace `claude -p` exit/stderr.

# Technical Debt Risks

`[MEDIUM]` coupling CLI Claude (output/flags) → `ISkillRunner`+pin version. `[MEDIUM]` parse markdown skill → finding dễ vỡ; yêu cầu xuất JSON. `[MEDIUM]` skill là shared dependency có version → pin+ghi vào job. `[LOW]` DB-queue tự viết claim/lease dễ sai → test kỹ.

# ADR Recommendations

| ID | Decision | Reason | Alternative | Trade-Off | Consequence |
|----|----------|--------|-------------|-----------|-------------|
| ADR-001 | Node.js+TS, UI ReactJS | cùng hệ Slack/Azure/CLI; type-safe | Python | hệ Node | codebase TS, React SPA |
| ADR-002 | Modular Monolith (Clean Arch) | greenfield, team nhỏ, đủ tải | Microservice | chưa độc lập deploy | 1 deployable, worker tách được |
| ADR-003 | Skill = Claude Code CLI headless, token/model/effort/project, cwd=clone | skill đã ở `.claude/skills`, CLI tự nạp | Agent SDK | coupling CLI | adapter ISkillRunner, pin version |
| ADR-004 | Queue trong MongoDB + poll, atomic claim, lease, **max 5** | theo người dùng; không Redis; sống sót restart | Redis/in-process | poll latency, tự viết claim | collection review_jobs, reclaim mồ côi |
| ADR-005 | MongoDB store, pool + ownerId filter | theo người dùng; document linh hoạt | PostgreSQL | thiếu ràng buộc quan hệ | repo nhận ownerId bắt buộc |
| ADR-006 | Model+effort catalog, default `claude-sonnet-4-6`/`medium` | cân bằng chi phí/chất lượng; model mới không sửa code | hardcode | bảo trì catalog | allowed opus-4-8/sonnet-4-6/haiku-4-5; effort low\|medium\|high |
| ADR-007 | Idempotency `(project,pr,commit)` + snapshot config lúc start | chống double-submit/đổi config | không khoá | unique index + "đang chạy" | partial unique index |
| ADR-008 | File→skill mapping theo ext/path, đa-skill | FRD #4 | hỏi mỗi lần | bảo trì bảng | bảng mapping (mục dưới) |
| ADR-009 | "Tài liệu hệ thống" = in-repo `.spec/`,`docs/`,README,`*.md` + nguồn cấu hình | FRD #5 | chỉ in-repo | dedupe | ContextBuilder gom ưu tiên |
| ADR-010 | Lưu history TRƯỚC post Slack; xoá clone trong finally | không mất kết quả; không tồn data nhạy cảm | post trực tiếp | thêm bước DB | review luôn truy lại; clone luôn dọn |
| ADR-011 | ACL ports ISlackPort/IAzureClient/ISkillRunner | bảo vệ Core | gọi trực tiếp | thêm lớp | đổi provider không vỡ Core |
| ADR-012 (i-002) | Output **luôn file `.md`** + tóm tắt inline; upload `files.getUploadURLExternal`+`completeUploadExternal`; fallback chunk chat | review dài vượt trần Slack; `files.upload` khai tử | post text / đính kèm khi dài | thêm build file + upload 2 bước | **override output i-001**; scope `files:write`; `ISlackPort` thêm `uploadMarkdown/postChunked` |
| ADR-013 (i-002) | **Fan-out** `deliveryTargets[]` + status per-target; lệnh trùng → **register** (không reject); atomic upsert enqueue-or-subscribe | trả mọi nơi; chống race 2 job; idempotent reclaim | reject duplicate (ADR-007) | tự viết upsert + status phức tạp | **override ADR-007**; cap target/job; cập nhật atomic |
| ADR-014 (i-002) | **Cache-serve** từ History khi `completed` hợp lệ; `fresh`/`rerun` bỏ qua + `supersedes` | tiết kiệm token; vẫn ép mới được | luôn chạy lại / luôn cache | định nghĩa "hợp lệ" + ghi supersedes thực | `ReviewResultView`; "hợp lệ"=completed & ≥1 finding & không lỗi-toàn-phần |
| ADR-015 (i-002) | KHÔNG lưu artifact `.md` — dựng on-demand từ History | giảm bề mặt lưu data nhạy cảm | lưu blob/CDN | tốn CPU build lại | builder từ `Finding[]`; ephemeral |
| ADR-016 (i-002) | Khóa fan-out/cache = `(projectId,prId,commitHash)` commit-aware | đúng code tại commit | bỏ qua commit | commit mới không trúng cache cũ (đúng ý) | tái dùng unique index ADR-007 |

# Quality Attribute Assessment

| Thuộc tính | Đánh giá | Mức |
|------------|----------|-----|
| Security | multi-tenant pool+ownership; secret enc; nhiều bề mặt nhạy cảm | `[CRITICAL]` |
| Performance | bị chi phối clone+AI; PR vừa < vài phút | `[MEDIUM]` |
| Reliability | retry/lease/idempotency/partial | `[HIGH]` |
| Availability | 1 project lỗi không ảnh hưởng project khác | `[MEDIUM]` |
| Scalability | đủ tải vừa; DB-queue là trần | `[HIGH]` |
| Maintainability | Clean Arch + ACL ports | `[MEDIUM]` |
| Testability | mock Slack/Azure/CLI qua ports | `[MEDIUM]` |
| Operability | dọn clone, theo dõi queue/cost | `[MEDIUM]` |
| Observability | correlation id + metrics cost | `[HIGH]` |

# Open Questions

Câu hỏi **thiết kế** đã chốt (⇒ open_questions=0):
- #1 → ADR-003; #10 → ADR-006; #4 → ADR-008 + bảng map; #5 → ADR-009; #6 → giới hạn an toàn dưới đây.

**Bảng map file→skill:** Code(`.ts .js .py .java .go .cs .rb .php .cpp .c .rs .kt .sql`...)→`review-code`; nhạy cảm(`auth,security,crypto,secret,password,login,iam,permission,token,.env`)→`bao-mat-he-thong` (cộng thêm); test(`*.test.* *.spec.* __tests__/`)→`kiem-thu-phan-mem`; nghiệp vụ(`frd.md requirements *.feature`)→`phan-tich-nghiep-vu`; kiến trúc(`tech.md sad.md adr* *.puml`)→`thiet-ke-he-thong`; không khớp→`review-code` (ghi chú); binary/lock/generated→bỏ qua. 1 file kích nhiều skill được.

**Giới hạn an toàn (mặc định, cấu hình):** ≤50 file, ≤5.000 dòng diff, trần token/PR theo project; rate-limit ~5 lệnh/người/10 phút; output Slack tóm tắt theo severity + đính kèm khi dài.

Chuyển bước sau (không chặn thiết kế): `[→bảo mật]` mã hoá secret/khoá master (#3), định danh owner + allowlist (#2); `[→nghiệp vụ]` #8 (mọi người review mọi project), #9 (duy nhất tên project), #7 (đồng ý dữ liệu qua Claude).

# Architecture Recommendations

1. `[Ownership]` `ownerId` bắt buộc ở repository; 404 cho tài nguyên người khác; chốt `authorizeReviewCommand`.
2. `[SoT/Temporal]` snapshot commitHash+config+skill version; history bất biến.
3. `[Resiliency]` ACL ports; retry/backoff/timeout/lease + CB theo project; history trước post Slack.
4. `[Lifecycle/Security]` xoá clone finally + dọn mồ côi; secret write-only; lọc log.
5. `[Concurrency]` DB-queue atomic + lease + unique idempotency; reclaim; concurrency 5.
6. `[Tech Debt]` skill xuất JSON finding; pin version CLI + `.claude/skills`.
7. `[Observability]` correlation id; metrics cost/queue/error theo project.
</content>
