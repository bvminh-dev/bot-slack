---
integration: i-001
feature: review-pr-slack-azure
stage: tech
status: approved
open_questions: 0
updated: 2026-06-25
---

# Tóm Tắt Kiến Trúc

Thiết kế **Slack bot "tieu-nhi"** review tự động PR Azure DevOps, hiện thực dạng **Modular Monolith (Node.js + TypeScript)** triển khai trên một deployable duy nhất, tách module rõ theo bounded context. UI quản trị là **ReactJS SPA** gọi REST API của cùng monolith.

**Lý do chọn Modular Monolith:** đây là greenfield, team nhỏ, lưu lượng PR vừa; multi-context (Slack, Azure, Review, Identity, Registry) nhưng chưa cần độc lập deploy/scale theo context. Bắt đầu monolith với boundary chặt, để đường mở rộng tách worker/microservice sau (xem ADR-002).

### C4 — Mức Context (System Context)

```
        ┌─────────────┐        @tieu-nhi <project> review <pr-url>
 Người  │   Slack      │ ───────────────────────────────────────────┐
 dùng   │  Workspace   │ ◀── ack + kết quả review (thread)           │
        └─────────────┘                                              ▼
                                                          ┌──────────────────────┐
 Admin  ┌─────────────┐  login PAT / CRUD project (HTTPS)  │   tieu-nhi (bot)      │
 (owner)│ React Admin │ ◀────────────────────────────────▶│  Modular Monolith     │
        │     UI       │                                   │  (Node.js/TypeScript) │
        └─────────────┘                                    └───────┬───────┬──────┘
                                                  PAT (per project) │       │ ANTHROPIC_API_KEY (per project)
                                                                    ▼       ▼
                                                   ┌──────────────────┐  ┌──────────────────────┐
                                                   │  Azure DevOps    │  │  Claude Code CLI       │
                                                   │  (Git + PR API)  │  │  headless (claude -p)  │
                                                   └──────────────────┘  └──────────────────────┘
                                                                    │
                                                          ┌──────────────────┐
                                                          │    MongoDB       │
                                                          │ registry/secret/ │
                                                          │ queue/audit/hist │
                                                          └──────────────────┘
```

### C4 — Mức Container

| Container | Công nghệ | Trách nhiệm |
|-----------|-----------|-------------|
| **Slack Gateway** | Slack Bolt (TS), HTTP endpoint | Nhận event mention, verify signing secret, ack < 3s, parse lệnh, enqueue job, đăng kết quả/tiến độ vào thread |
| **Admin API** | Express/Nest (TS), REST | Login bằng Azure PAT, CRUD project (owner-scoped), test-connection, secret write-only |
| **Admin UI** | ReactJS SPA | Giao diện quản trị project; gọi Admin API qua HTTPS |
| **Review Worker** | Node worker (cùng process hoặc tiến trình riêng) | Poll job từ Mongo, điều phối review, max concurrency = 5 |
| **Skill Runner (adapter)** | spawn `claude -p` headless | Chạy skill `.claude/skills` trong thư mục repo đã clone, token+model+effort theo project |
| **Azure DevOps Client** | azure-devops-node-api + git | Lấy PR metadata/diff/file, clone nhánh nguồn |
| **MongoDB** | MongoDB | Project registry, secret mã hoá, job-queue collection, audit log, review history |

**Phát hiện trọng yếu (chi tiết ở các mục dưới):**
- `[CRITICAL]` Secret (Claude token + Azure PAT) lưu at-rest phải mã hoá; cơ chế/khoá chốt ở `/tn-bao-mat`.
- `[CRITICAL]` Xung đột phạm vi quyền: Admin UI cô lập theo owner nhưng Slack cho mọi người review mọi project (FRD #8) — quyết định nghiệp vụ/bảo mật, kiến trúc đã chuẩn bị điểm chốt quyền (`authorizeReviewCommand`).
- `[HIGH]` Idempotency theo `(projectId, prId, commitHash)` chống double-submit.
- `[HIGH]` Prompt injection từ nội dung PR vào skill — cần tách dữ liệu/chỉ dẫn.
- `[HIGH]` Snapshot cấu hình project tại thời điểm enqueue (config đổi giữa chừng).

---

# Domain Model

| Domain | Loại | Trách nhiệm |
|--------|------|-------------|
| **Review Orchestration** | **Core** | Vòng đời lệnh review: nhận → enqueue → fetch context → chạy skill → tổng hợp finding → đăng Slack. Đây là giá trị lõi, tự xây. |
| **Project Registry & Secrets** | **Core** | Quản lý cấu hình project (repo, model, effort, nguồn tài liệu), mã hoá/giải mã secret, cô lập theo owner. |
| **Skill Execution** | **Supporting** | Adapter chạy `.claude/skills` qua Claude Code CLI; map loại file → skill; trừu tượng hoá runtime AI. |
| **Identity & Ownership** | **Supporting** | Định danh owner từ Azure PAT, phiên đăng nhập Admin UI. |
| **Azure DevOps Access** | **Generic** | Truy cập Git/PR — dùng SDK sẵn, bọc bằng Anti-Corruption Layer. |
| **Slack Gateway** | **Generic** | Nhận/đăng message — dùng Slack Bolt, bọc adapter. |
| **Audit & History** | **Supporting** | Ghi vết lệnh review, thay đổi cấu hình, lịch sử kết quả. |

**`[MEDIUM]` Domain Risk:** Review Orchestration dễ phình to (ôm parse, fetch, run, format). Phải tách rõ sub-service: `CommandParser`, `ContextBuilder`, `SkillDispatcher`, `FindingAggregator`, `SlackPresenter` để không thành God-Service. *(DDD — Core Domain decomposition)*

---

# Ubiquitous Language

| Khái niệm | Tên hiện tại | Vấn đề (đồng nghĩa/đa nghĩa) | Khuyến nghị |
|-----------|--------------|------------------------------|-------------|
| Người tạo & sở hữu project | "chủ sở hữu / owner / admin" | "admin" dễ nhầm với quyền hệ thống toàn cục | Dùng **Owner** cho chủ sở hữu project; không dùng "admin" trừ vai trò hệ thống |
| Lệnh review một PR | "lệnh review / job / task" | "job" và "task" lẫn lộn | **ReviewJob** = một lần review; "task" chỉ dùng cho công việc nội bộ (skill run) |
| Cấu hình một dự án | "project" (Slack) vs "project" (Azure) | Azure DevOps cũng có khái niệm *project* riêng | **Project** = bản ghi cấu hình của bot; Azure dùng **AzureProject/repo** |
| Token Claude | "token Claude / API key / Anthropic key" | nhiều tên | **ClaudeApiKey** (Anthropic API key) |
| Mức reasoning | "effort" | trùng "effort" estimate | **ReasoningEffort** (low/medium/high/...) |
| Đơn vị xuất từ skill | "finding / issue / risk" | lẫn lộn | **Finding** (gắn `severity` CRITICAL/HIGH/MEDIUM/LOW) |

---

# Bounded Context

```
                ┌──────────────────────┐    Customer-Supplier    ┌────────────────────────┐
                │  Slack Gateway (G)    │ ──────────────────────▶ │ Review Orchestration(C) │
                │  parse/ack/post       │ ◀── kết quả/tiến độ ──── │  job lifecycle          │
                └──────────────────────┘                          └───────┬────────────────┘
                                                                           │ Customer-Supplier
                    ┌──────────────────────┐   reads config (snapshot)     │
                    │ Project Registry &   │ ◀─────────────────────────────┤
                    │ Secrets (C)          │                               │
                    └─────────┬────────────┘                               │
       Conformist (identity)  │                                            │ uses (ACL)
                    ┌─────────▼────────────┐         ┌─────────────────────▼───────────┐
                    │ Identity & Ownership │         │ Azure DevOps Access (ACL)        │
                    │ (S)                  │         │ Skill Execution (ACL → Claude CLI)│
                    └──────────────────────┘         └──────────────────────────────────┘
                                       Audit & Ownership ◀── ghi vết từ mọi context
```

**Context Mapping:** Slack Gateway & Azure Access & Skill Execution là **Anti-Corruption Layer** bọc hệ ngoài (Slack/Azure/Claude CLI) để Core không phụ thuộc API ngoài. Project Registry là **Customer-Supplier** (upstream) của Review Orchestration.

- `[HIGH]` Context Coupling Risk: nếu Review Orchestration gọi thẳng `azure-devops-node-api` / spawn `claude` không qua ACL → đổi SDK/CLI sẽ vỡ Core. **Bắt buộc** dùng interface `IAzureClient`, `ISkillRunner`, `ISlackPort`.
- `[MEDIUM]` Slack Gateway và Admin API chia sẻ Project Registry — cần thống nhất 1 module Registry duy nhất (không nhân đôi truy vấn owner-filter).

---

# Aggregate Design

| Aggregate Root | Entity / VO bên trong | Ghi chú |
|----------------|------------------------|---------|
| **Project** | VO: `RepoBinding(repoUrl, azureProject)`, `ModelConfig(model, effort)`, `EncryptedSecret(claudeKey, pat)`, `DocSources[]`, `status` | Đơn vị nhất quán cấu hình; secret là VO write-only |
| **Owner** | VO: `AzureIdentity(userId, email)` | Định danh ổn định, KHÔNG dùng chuỗi PAT làm khoá |
| **ReviewJob** | VO: `Command(rawText, prUrl)`, `Target(projectId, prId, commitHash)`, `JobStatus`, `Finding[]`, `SkillRun[]`, `cost` | Vòng đời 1 lần review; idempotency key = `(projectId, prId, commitHash)` |
| **AuditEntry** | append-only | 1 entry/hành động |

- `[HIGH]` Aggregate Risk: KHÔNG nhúng `ReviewJob[]` vào `Project` (job tăng vô hạn → aggregate phình). Tham chiếu bằng `projectId`.
- `[MEDIUM]` `Finding[]` và `SkillRun[]` nằm trong `ReviewJob` chấp nhận được (bounded theo 1 PR); nếu PR khổng lồ cân nhắc tách collection con.
- `[LOW]` Transaction xuyên aggregate: enqueue job + ghi audit nên cùng 1 thao tác logic — Mongo dùng transaction trên replica set hoặc outbox nhẹ.

---

# Domain Events

| Command | Event | Policy | Vấn đề (missing/duplicate/circular) |
|---------|-------|--------|-------------------------------------|
| `ReceiveSlackMention` | `ReviewCommandReceived` | Nếu cú pháp đúng & project tồn tại → enqueue | OK |
| `EnqueueReviewJob` | `ReviewJobQueued` | Idempotency: nếu đã có job `(project,pr,commit)` đang chạy → `ReviewJobDuplicateRejected` | `[HIGH]` thiếu event chống trùng nếu không thêm |
| `StartReviewJob` (worker claim) | `ReviewJobStarted` | Snapshot config tại đây | `[HIGH]` thiếu `ConfigSnapshotTaken` → đổi config giữa chừng gây sai |
| `FetchPullRequest` | `PullRequestFetched` / `PullRequestFetchFailed` | Validate repo ↔ project | OK |
| `PrepareContext` | `ContextPrepared` | Clone + thu thập tài liệu + lọc file | OK |
| `RunSkill` (mỗi skill) | `SkillRunCompleted` / `SkillRunFailed` | Map file→skill | `[MEDIUM]` cần `SkillRunPartial` cho lỗi giữa chừng |
| `AggregateFindings` | `FindingsAggregated` | Gộp theo severity | OK |
| `PostReview` | `ReviewJobCompleted` / `ReviewJobFailed` | Đăng thread + react ✅/⚠️ | OK |
| `CreateProject`/`UpdateProject` | `ProjectCreated`/`ProjectUpdated`/`ProjectDeleted` | Audit | OK |
| `RotateSecret` | `SecretRotated` | Audit (không log giá trị) | OK |
| (định kỳ) | `TempCloneCleaned` | Dọn clone sau xử lý | `[MEDIUM]` thiếu → tồn dữ liệu nhạy cảm |

Không phát hiện circular event.

---

# Event Storming

**Command → Event → Policy → Read Model:**

```
Slack mention → ReviewCommandReceived
  └▶ Policy: parse + resolve project (owner-scope theo quyết định #8/#9) + validate PR url
       → ReviewJobQueued  ──(Mongo queue)──▶  [Read Model: JobQueue]
Worker poll → claim → ReviewJobStarted + ConfigSnapshotTaken
  └▶ FetchPullRequest → PullRequestFetched  [Read Model: PR metadata/diff]
  └▶ PrepareContext (clone + docs + filter) → ContextPrepared
  └▶ for each skill: RunSkill → SkillRunCompleted/Failed  [Read Model: SkillRun results]
  └▶ AggregateFindings → FindingsAggregated  [Read Model: ReviewSummary]
  └▶ PostReview → ReviewJobCompleted  [Read Model: Slack thread + ReviewHistory]
  └▶ cleanup → TempCloneCleaned
```

**Event Gaps:**
- `[HIGH]` Thiếu **Read Model "đang chạy"** để chống double-submit & trả "đang xử lý" (cần index trên job theo idempotency key + status).
- `[MEDIUM]` Thiếu Read Model **cost/quota theo owner-period** (FRD audit chi phí + rate-limit).
- `[MEDIUM]` Thiếu Policy dọn `TempClone` khi job lỗi (không chỉ khi thành công).

---

# Data Ownership Matrix

| Data Item | Owner (ghi) | Master System | Consumer | Quyền sửa | Vấn đề |
|-----------|-------------|---------------|----------|-----------|--------|
| Project config (repo, model, effort, doc sources) | Project Registry | MongoDB | Slack Gateway, Worker, Admin UI | Chỉ **Owner** của project | `[CRITICAL]` mọi truy vấn phải lọc `ownerId` |
| Secret (ClaudeApiKey, Azure PAT) | Project Registry | MongoDB (encrypted) | Worker (giải mã lúc chạy), Skill Runner (qua ENV) | Owner ghi (write-only) | `[CRITICAL]` không đọc-trả lại; chi tiết `/tn-bao-mat` |
| Owner identity (AzureIdentity) | Identity & Ownership | Azure DevOps (suy ra) | Registry, Audit | Hệ thống (đồng bộ từ Azure) | `[HIGH]` không dùng PAT làm khoá định danh |
| PR metadata / diff / code | — (read-only) | **Azure DevOps** | Worker, Skill Runner | Không sửa | OK — bot chỉ đọc |
| ReviewJob + Finding | Review Orchestration | MongoDB | Slack, Admin UI (history) | Hệ thống | `[MEDIUM]` ai xem history (FRD perm) |
| Audit log | Audit & Ownership | MongoDB | (đọc nội bộ) | append-only | OK |
| Model/effort catalog (danh sách hợp lệ) | Config (System) | file config/DB | Validation, Admin UI | System maintainer | `[MEDIUM]` cập nhật khi có model mới (ADR-006) |

---

# Source Of Truth Matrix

| Data Item | Ứng viên nguồn | Source of Truth | Quy tắc khi conflict |
|-----------|----------------|-----------------|----------------------|
| Nội dung PR / diff / file thay đổi | Azure DevOps / bản clone local | **Azure DevOps tại `commitHash` đã chốt** | Tin commit đã snapshot lúc `ReviewJobStarted`; nếu PR có commit mới sau đó → review cũ vẫn ghi rõ commit đã review |
| Cấu hình project | MongoDB | **MongoDB (snapshot lúc enqueue/start)** | Nếu Owner sửa config khi job đang chạy → job dùng snapshot, không dùng bản mới |
| Định danh Owner | Azure DevOps profile / PAT | **Azure user id/email từ Azure profile API** | PAT chỉ để xác thực; định danh lấy từ profile, ổn định khi PAT xoay vòng |
| Resolve `<project>` (Slack) → repo | tên project người dùng gõ | **Registry** (theo phạm vi duy nhất chốt ở #9, `/tn-bao-mat`/nghiệp vụ) | Trùng tên giữa owner → quy tắc resolve phải xác định (Open Question chuyển bước sau) |
| Tài liệu hệ thống | trong repo + nguồn cấu hình | **Hợp nhất: in-repo trước, nguồn cấu hình bổ sung sau** | Trùng path → bản trong repo ưu tiên; ghi rõ nguồn nào thiếu |

---

# Historical Data Analysis

- **Current:** cấu hình project hiện hành (Mongo, mutable).
- **Snapshot:** `ReviewJob` lưu `commitHash` + bản sao **cấu hình đã dùng** (model, effort, skill version) tại thời điểm chạy → đảm bảo kết quả review tái lập & truy vết được dù config/skill đổi sau.
- **Historical:** Review History (kết quả các lần review) bất biến — không bị viết đè khi review lại; mỗi lần là 1 bản ghi mới.
- **Audit:** append-only, không sửa.

- `[HIGH]` Historical Risk: nếu KHÔNG snapshot **skill version** vào job thì đổi `.claude/skills` sau này khiến không giải thích được vì sao kết quả khác (FRD: skill là shared dependency có version). → ghi `skillVersion`/git hash của `.claude` vào mỗi job.
- `[MEDIUM]` Review lại cùng PR/commit tạo bản ghi history mới — cần đánh dấu `supersedes` để UI hiển thị bản mới nhất nhưng giữ cũ.

---

# Data Lifecycle Analysis

| Giai đoạn | Project | ReviewJob / History | Temp clone | Audit |
|-----------|---------|---------------------|------------|-------|
| Create | Owner tạo qua Admin UI | Khi enqueue | Khi PrepareContext | Mỗi hành động |
| Active | status=active | queued→running | trong lúc review | — |
| Inactive | status=disabled (ngừng nhận lệnh) | completed/failed | — | — |
| Archived | — (i-001 chưa có) | History giữ N ngày (Retention cấu hình) | — | giữ dài hạn |
| Deleted | Owner xoá → soft-delete + huỷ job đang chờ | giữ history theo retention | **xoá ngay sau xử lý** | giữ |
| Purged | sau retention | sau retention | — | theo chính sách |

- `[CRITICAL]` **Temp clone phải xoá** sau xử lý (kể cả khi lỗi) — chứa code private khách hàng (FRD Rủi ro Dữ liệu). Dùng `try/finally` + dọn rác định kỳ cho clone mồ côi.
- `[MEDIUM]` Retention cho History/Audit chưa có số cụ thể → đặt mặc định (vd 180 ngày) cấu hình được; chốt cuối ở `/tn-bao-mat`.
- `[MEDIUM]` Xoá project → phải xoá/huỷ job đang chờ của project đó, không để worker chạy job mồ côi.

---

# Architecture Pattern Review

- **Chọn:** **Modular Monolith** (Clean Architecture nội bộ: domain ← application ← adapters). Worker chạy trong cùng codebase, có thể tách tiến trình riêng nhờ queue trong DB.
- **Queue:** **Database-backed queue** (collection `review_jobs` trong Mongo) + worker poll với `findOneAndUpdate` (atomic claim) — KHÔNG thêm Redis (theo lựa chọn người dùng).
- **Concurrency:** worker pool **tối đa 5** review song song; mỗi job cô lập token/clone theo project.

- `[MEDIUM]` Over/Under-engineering: DB-queue không có pub/sub → worker **poll** định kỳ (vd 1–2s). Chấp nhận latency nhỏ; tránh busy-loop bằng backoff + index. Đây là under-engineering có chủ đích cho giai đoạn đầu (ADR-004).
- `[MEDIUM]` `claude -p` headless là tiến trình con nặng (clone repo + chạy AI) → cô lập tài nguyên (giới hạn 5), timeout cứng mỗi skill run, kill tiến trình treo.
- `[LOW]` Clean Architecture có thể thừa cho phần CRUD Admin đơn giản — giữ mỏng cho Registry.

---

# API Review

**Admin REST API (owner-scoped):**

| Method | Endpoint | Ghi chú |
|--------|----------|---------|
| POST | `/api/v1/auth/login` | body: Azure PAT → verify với Azure → trả session JWT + ownerId |
| GET | `/api/v1/projects` | **lọc theo ownerId từ session** (không nhận ownerId từ client) |
| POST | `/api/v1/projects` | tạo; validate model/effort/repo; test-connection trước khi lưu |
| GET | `/api/v1/projects/:id` | 404 nếu không thuộc owner (không lộ tồn tại) |
| PUT | `/api/v1/projects/:id` | cập nhật; secret write-only (gửi mới mới ghi) |
| DELETE | `/api/v1/projects/:id` | soft-delete + huỷ job chờ |
| POST | `/api/v1/projects/:id/test-connection` | kiểm tra PAT + repo + Claude key |
| GET | `/api/v1/projects/:id/reviews` | lịch sử review (phân trang) |
| GET | `/api/v1/meta/models` | danh sách model+effort hợp lệ (catalog) |

**Slack:** 1 endpoint `POST /slack/events` (Events API) + verify signing secret + URL verification challenge.

- `[MEDIUM]` API Design: thêm **versioning** `/api/v1`; **pagination** cho `/reviews` (cursor/limit); **idempotency**: tạo project trùng tên/repo phải 409.
- `[HIGH]` **Không bao giờ nhận `ownerId` từ client** — luôn lấy từ session để chống IDOR. Trả `404` thay vì `403` cho project người khác (không lộ tồn tại).
- `[MEDIUM]` Slack endpoint phải trả **200 trong < 3s** rồi xử lý nền — không block chờ review.

---

# Integration Review

| Hệ ngoài | Retry | Timeout | Fallback | Circuit Breaker | Rủi ro |
|----------|-------|---------|----------|-----------------|--------|
| **Azure DevOps API** (PR meta/diff) | Có (backoff, 429-aware) | Có (vd 30s) | Báo lỗi tạm thời, đánh dấu job retry | Nên có theo project/host | `[HIGH]` rate-limit/timeout → treo job |
| **Azure Git clone** | Có (1–2 lần) | Có | Fallback **review chỉ trên diff** nếu clone fail/repo quá lớn | — | `[HIGH]` repo lớn → tốn thời gian/đĩa |
| **Claude Code CLI (Anthropic)** | Có (backoff cho 429/5xx/overloaded) | Có (timeout mỗi skill run) | Trả phần kết quả đã có, ghi skill nào lỗi | Theo project token | `[HIGH]` hết credit/rate-limit/timeout |
| **Slack API** (post/ack) | Có | Có | Nếu post lỗi → retry, log; không mất kết quả (đã lưu history) | — | `[MEDIUM]` post fail làm mất kết quả nếu không lưu trước |
| **MongoDB** | Driver retryWrites | Có | — | — | `[HIGH]` DB down → không enqueue/claim được |

- `[HIGH]` **Đăng kết quả vào history TRƯỚC khi post Slack** để post fail không mất review.
- `[MEDIUM]` Circuit breaker theo **project token** Claude: nếu 1 project liên tục lỗi auth/credit, mở breaker để không đốt thêm và không chặn project khác.

---

# Integration Failure Analysis

| Kịch bản lỗi | Hệ thống còn chạy? | Mất dữ liệu? | Xử lý mong đợi | Mức |
|--------------|--------------------|--------------|----------------|-----|
| Azure API timeout/500 | Có (job khác chạy) | Không | Retry/backoff; quá ngưỡng → `ReviewJobFailed` + báo thread | `[HIGH]` |
| Clone fail / repo quá lớn | Có | Không | Fallback review trên diff; nếu cũng fail → báo lỗi rõ | `[HIGH]` |
| Claude CLI lỗi/timeout/treo | Có | Không (giữ partial) | Kill tiến trình treo; trả phần đã có + ghi skill lỗi | `[HIGH]` |
| Claude token hết credit | Có (project khác OK) | Không | Báo lỗi, không nuốt lặng; circuit breaker theo project | `[HIGH]` |
| Slack post fail | Có | Không (đã lưu history) | Retry post; vẫn còn trong history/Admin UI | `[MEDIUM]` |
| MongoDB down | Suy giảm | Có thể (job đang nhận) | Slack ack fail → người dùng gõ lại; job chưa enqueue thì mất → cần health check | `[HIGH]` |
| Worker crash giữa job | Có (worker khác) | Không | Job `running` quá `lease timeout` → reclaim & chạy lại (idempotent) | `[HIGH]` |
| 2 worker cùng claim 1 job | — | Không | `findOneAndUpdate` atomic + version → chỉ 1 worker thắng | `[HIGH]` |

- `[HIGH]` **Lease/visibility timeout** cho job `running`: nếu worker chết, job được reclaim sau X phút (giống SQS visibility timeout) — bắt buộc cho DB-queue.

---

# Multi Tenant Review

- **Mô hình:** **Pool** (chung DB/collection), cô lập bằng **`ownerId` trên mọi document + bắt buộc filter ở repository layer**. Mỗi owner ≈ 1 tenant.
- Secret cô lập theo project; token Claude theo project → cô lập **chi phí & ngữ cảnh** (mục tiêu FRD).

- `[CRITICAL]` Tenant Risk: thiếu filter `ownerId` ở dù chỉ 1 query → leak project chéo (IDOR). **Bắt buộc** repository nhận `ownerId` làm tham số bắt buộc; cấm query "all".
- `[HIGH]` Xung đột mô hình (FRD #8): Admin cô lập theo owner nhưng **Slack cho mọi người review mọi project** → người ngoài xem được code/tài liệu project khác qua kết quả review. Đây là **lỗ hổng cô lập tenant ở kênh Slack** — phải chốt nghiệp vụ (#8) & kiểm soát ở `/tn-bao-mat` (giới hạn theo kênh/owner). Kiến trúc đặt điểm chốt `authorizeReviewCommand(actor, project)` để siết về sau mà không đổi luồng.

---

# Authentication Review

- **Admin UI:** đăng nhập bằng **Azure PAT** → backend gọi Azure DevOps profile API (`Connection Data`/`Profiles`) để xác thực PAT hợp lệ & suy ra `AzureIdentity(userId,email)` → cấp **session JWT** ngắn hạn (httpOnly cookie). **Không lưu PAT đăng nhập** (khác PAT cấu hình project).
- **Slack:** xác thực **Slack signing secret** + timestamp (chống replay) trên mọi request.

- `[CRITICAL]` Nếu nhận PAT qua HTTP không TLS hoặc log PAT → lộ. Bắt buộc HTTPS, không log PAT/JWT.
- `[HIGH]` PAT đăng nhập có thể xoay vòng → định danh phải dựa `userId/email`, không dựa chuỗi PAT (đã phản ánh ở Source of Truth).
- `[MEDIUM]` JWT cần hết hạn ngắn + refresh; thu hồi khi logout. Chi tiết `/tn-bao-mat`.

---

# Authorization Review

- **Mô hình:** **Ownership-based access control** (ABAC nhẹ theo thuộc tính `ownerId`). Không có vai trò phân cấp ở i-001.
- **Admin API:** mọi thao tác project → `project.ownerId === session.ownerId`, else 404.
- **Slack review:** hiện FRD cho **mọi người trong workspace** review mọi project (giả định #4). Điểm chốt `authorizeReviewCommand` để áp chính sách (allow-all / theo kênh / chỉ owner) — **quyết định ở #8**.

- `[CRITICAL]` Thiếu kiểm tra ownership ở 1 endpoint → privilege escalation / data leak.
- `[HIGH]` Slack actor không phải owner vẫn xem được output review — xung đột SoD (#8), cần chốt.

---

# Permission Scope Matrix

| Permission | Scope | Boundary | Vấn đề |
|------------|-------|----------|--------|
| Tạo/sửa/xoá project | Chỉ project của chính owner | per-owner | `[CRITICAL]` filter ownerId bắt buộc |
| Xem secret | KHÔNG ai (write-only) | — | `[CRITICAL]` không bao giờ trả secret |
| Ra lệnh review (Slack) | Mọi user workspace (giả định) | workspace / (tùy chốt: kênh/owner) | `[HIGH]` xung đột isolation (#8) |
| Xem kết quả review (thread) | Mọi người trong kênh thread | kênh Slack | `[HIGH]` lộ code/tài liệu project chéo |
| Xem lịch sử review (Admin UI) | Owner của project | per-owner | `[MEDIUM]` ai khác được xem (FRD) |
| Cập nhật model catalog | System maintainer | global | `[LOW]` |

---

# Security Threat Model

| STRIDE | Threat cụ thể | Tài sản | Biện pháp | Mức |
|--------|---------------|---------|-----------|-----|
| **Spoofing** | Giả mạo Slack event để trigger review | token Claude (chi phí), code | Verify Slack signing secret + timestamp | `[HIGH]` |
| **Spoofing** | PAT giả/đánh cắp đăng nhập Admin | project người khác | Verify PAT với Azure; session ngắn hạn | `[HIGH]` |
| **Tampering** | Sửa `ownerId`/`projectId` trong request (IDOR) | dữ liệu tenant chéo | Lấy ownerId từ session; filter bắt buộc; 404 | `[CRITICAL]` |
| **Tampering / Prompt Injection** | Nội dung PR chèn chỉ dẫn thao túng skill | tính đúng đắn review | Tách dữ liệu vs chỉ dẫn; đóng khung nội dung PR là "dữ liệu không tin cậy"; không để PR điều khiển tool | `[HIGH]` |
| **Repudiation** | Chối đã ra lệnh / đổi cấu hình | truy vết | Audit log lệnh + thay đổi cấu hình (không log secret) | `[HIGH]` |
| **Info Disclosure** | Lộ secret qua log/lỗi/Admin UI | token/PAT | Mã hoá at-rest; write-only; lọc log; lỗi an toàn (không stacktrace nhạy cảm) | `[CRITICAL]` |
| **Info Disclosure** | Code private đi qua Claude (bên thứ ba) | dữ liệu khách hàng | Cô lập token theo project; (đồng ý/hợp đồng → nghiệp vụ #7) | `[HIGH]` |
| **DoS** | Spam lệnh review đốt token/đầy queue | chi phí, tài nguyên | Rate-limit per-user/period; giới hạn concurrency 5; quota token | `[HIGH]` |
| **EoP** | User thường thao tác project owner khác | tenant | Ownership check mọi nơi | `[CRITICAL]` |

> Threat model chi tiết & quyết định mã hoá/khoá master ở `/tn-bao-mat`.

---

# Performance Risks

- `[HIGH]` Clone repo lớn + chạy AI mỗi PR là chậm/tốn — giới hạn file/diff (xem Open Questions đã chốt) + cache clone theo repo (incremental fetch thay vì clone mới).
- `[MEDIUM]` Worker poll Mongo busy-loop → dùng index `(status, availableAt)` + backoff khi rỗng.
- `[MEDIUM]` Diff/finding lớn vượt giới hạn Slack (block ~3000 ký tự, ≤50 block) → tóm tắt + đính kèm snippet/file khi dài.
- `[LOW]` Giải mã secret mỗi job — chấp nhận; không cache secret trong RAM lâu.

---

# Scalability Risks

- 10–100 lệnh/ngày: monolith + 5 worker dư sức.
- 1.000+: queue DB + poll vẫn ổn nhưng **poll contention** tăng → cần index tốt; cân nhắc tách worker ra tiến trình/host riêng (đã sẵn nhờ queue trong DB).
- 10.000+: `[HIGH]` DB-queue poll thành bottleneck → chuyển sang message broker (Redis/SQS) + nhiều worker; clone/disk I/O thành điểm nghẽn → cần khối lượng đĩa & dọn rác mạnh.
- 100.000+: `[HIGH]` cần tách microservice theo context (Slack/Worker/Admin), chi phí token Claude là ràng buộc kinh tế chính → quota & batching.
- `[MEDIUM]` Concurrency cố định 5 cho toàn hệ → khi nhiều project, 1 project bận có thể chiếm hết slot; cân nhắc fair-scheduling/quota theo project về sau.

---

# Observability Gaps

- `[HIGH]` Cần **correlation id** xuyên suốt: Slack event → job → skill run → Slack post, để truy vết 1 lệnh.
- `[HIGH]` **Structured logging** (JSON) **loại bỏ secret**; log skill nào chạy, thời gian, token tiêu thụ, kết quả.
- `[MEDIUM]` **Metrics:** số job theo trạng thái, thời gian review, tỉ lệ lỗi theo hệ ngoài, token/chi phí theo project (KPI FRD), độ sâu queue.
- `[MEDIUM]` **Alerting:** project lỗi cấu hình liên tục, queue dồn, breaker mở, secret hết hạn.
- `[MEDIUM]` **Tracing** spawn `claude -p`: capture exit code, stderr (lọc secret), thời lượng.

---

# Technical Debt Risks

- `[MEDIUM]` `claude -p` headless là **coupling tới CLI Claude Code** (định dạng output, flag). Bọc `ISkillRunner` + parser ổn định; pin version CLI.
- `[MEDIUM]` Parse output skill (markdown tự do) → finding có cấu trúc là điểm dễ vỡ; cân nhắc yêu cầu skill xuất theo định dạng máy-đọc (JSON block) để aggregate đáng tin.
- `[MEDIUM]` Skill `.claude/skills` là **shared dependency có version** (FRD) — phải pin & ghi version vào job, nếu không kết quả không tái lập.
- `[LOW]` DB-queue tự viết (claim/lease/retry) dễ sai cạnh tranh — cần test kỹ; nợ kỹ thuật chấp nhận thay cho Redis.

---

# ADR Recommendations

| ID | Decision | Reason | Alternative | Trade-Off | Consequence |
|----|----------|--------|-------------|-----------|-------------|
| **ADR-001** | Stack **Node.js + TypeScript**, Admin UI **ReactJS** | Slack Bolt JS, azure-devops-node-api, Claude CLI (Node) cùng hệ; type-safe | Python | Hệ Node; cần kỷ luật type | Toàn bộ codebase TS; UI React SPA |
| **ADR-002** | **Modular Monolith** (Clean Arch nội bộ), boundary theo bounded context | Greenfield, team nhỏ, đủ cho tải hiện tại; mở đường tách sau | Microservice ngay | Chưa độc lập deploy/scale theo context | 1 deployable; worker tách được nhờ queue DB |
| **ADR-003** | Chạy skill bằng **Claude Code CLI headless** (`claude -p`), ENV `ANTHROPIC_API_KEY` + `--model` + reasoning effort theo project, cwd = repo clone | Skill đã ở định dạng `.claude/skills`, CLI tự nạp; không phải tái hiện cơ chế nạp skill | Claude Agent SDK | Coupling tới CLI (output/flags), tiến trình con nặng | Adapter `ISkillRunner` bọc CLI; pin version CLI |
| **ADR-004** | **Queue trong MongoDB** + worker **poll** (`findOneAndUpdate` atomic claim, lease timeout), **max concurrency 5** | Theo lựa chọn người dùng; không thêm Redis; sống sót restart | Redis/BullMQ; in-process | Poll latency, tự viết claim/lease | Collection `review_jobs`; reclaim job mồ côi |
| **ADR-005** | **MongoDB** làm store (registry/secret/queue/audit/history), cô lập **pool + ownerId filter** | Theo lựa chọn người dùng; linh hoạt document; đủ multi-tenant pool | PostgreSQL | Không có ràng buộc quan hệ/transaction mạnh như RDBMS | Mọi repo nhận `ownerId` bắt buộc; index theo owner |
| **ADR-006** | **Model + ReasoningEffort catalog** lưu cấu hình (DB/file), validate khi tạo project; **mặc định `claude-sonnet-4-6` + effort `medium`** | Cân bằng chi phí/chất lượng; cập nhật model mới không cần sửa code | Hardcode danh sách | Phải bảo trì catalog | Allowed: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`; effort `low\|medium\|high`; trống → default |
| **ADR-007** | **Idempotency theo `(projectId, prId, commitHash)`** + chống double-submit, snapshot config lúc start | FRD HIGH risk double-submit/đổi config giữa chừng | Không khoá | Cần unique index + xử lý "đang chạy" | Unique partial index; trả "đang chạy" khi trùng |
| **ADR-008** | **File→Skill mapping** theo extension/đường dẫn (bảng dưới), 1 file có thể kích nhiều skill | FRD #4 cần bảng chuẩn | Hỏi người dùng mỗi lần | Bảng cần bảo trì | Bảng mapping ở Open-Questions-đã-chốt |
| **ADR-009** | **"Tài liệu hệ thống"** = in-repo `.spec/`,`docs/`,`README*`,`*.md` (gốc) + nguồn cấu hình theo project; hợp nhất in-repo trước | FRD #5 | Chỉ in-repo | Hợp nhất cần dedupe | ContextBuilder gom theo thứ tự ưu tiên |
| **ADR-010** | **Lưu history TRƯỚC khi post Slack**; **xoá temp clone trong `finally`** | Không mất kết quả khi Slack fail; không tồn data nhạy cảm | Post trực tiếp | Thêm bước ghi DB | Review luôn truy lại được; clone luôn được dọn |
| **ADR-011** | Bọc hệ ngoài bằng **ACL ports** `ISlackPort`, `IAzureClient`, `ISkillRunner` | Bảo vệ Core khỏi đổi SDK/CLI | Gọi trực tiếp | Thêm lớp abstraction | Đổi provider/CLI không vỡ Core |

---

# Quality Attribute Assessment

| Thuộc tính (ISO 25010) | Đánh giá | Kịch bản chất lượng | Mức rủi ro |
|------------------------|----------|---------------------|------------|
| **Security** | Multi-tenant pool + ownership; secret mã hoá; nhiều bề mặt nhạy cảm | Kẻ trong workspace thử IDOR project khác → 404, không lộ | `[CRITICAL]` (chốt `/tn-bao-mat`) |
| **Performance** | Bị chi phối bởi clone + AI run | PR cỡ vừa có kết quả < vài phút (KPI FRD) | `[MEDIUM]` |
| **Reliability** | Retry/lease/idempotency; partial result | Worker chết giữa job → reclaim, không trùng | `[HIGH]` |
| **Availability** | Phụ thuộc Mongo + hệ ngoài | Claude 1 project lỗi → không ảnh hưởng project khác | `[MEDIUM]` |
| **Scalability** | Đủ tải vừa; DB-queue là trần | 1.000+ job/ngày → tách worker; 10.000+ → broker | `[HIGH]` |
| **Maintainability** | Clean Arch + ACL ports | Đổi từ CLI sang SDK chỉ sửa adapter | `[MEDIUM]` |
| **Testability** | Ports cho phép mock Slack/Azure/CLI | Test orchestration không cần hệ ngoài thật | `[MEDIUM]` |
| **Operability** | Cần dọn clone, theo dõi queue/cost | Vận hành thấy queue dồn → tăng worker | `[MEDIUM]` |
| **Observability** | Cần correlation id + metrics cost | Truy 1 lệnh từ Slack → kết quả | `[HIGH]` |

---

# Open Questions

> Các câu hỏi **thiết kế** (FRD #1,#4,#5,#6,#10) đã được **chốt** ở bước này (xem ADR & bảng dưới) ⇒ `open_questions = 0`.
> Các mục còn lại **không thuộc thiết kế** — đã được FRD định tuyến sang bước sau, KHÔNG chặn `/tn-thiet-ke`:

**Đã chốt ở thiết kế:**
- **#1 Cơ chế chạy skill** → ADR-003 (Claude Code CLI headless, token/model/effort theo project, cwd=clone).
- **#10 Model + effort + default** → ADR-006 (catalog cấu hình; default `claude-sonnet-4-6`/`medium`).
- **#4 Bảng map file → skill** → ADR-008 + bảng:

  | Loại file (extension / đường dẫn) | Skill |
  |-----------------------------------|-------|
  | Code: `.ts .js .tsx .jsx .py .java .go .cs .rb .php .cpp .c .rs .kt .scala .sql` | `review-code` |
  | Nhạy cảm: path/tên chứa `auth, security, crypto, secret, password, login, iam, permission, token, payment, .env` | `bao-mat-he-thong` (cộng thêm) |
  | Test: `*.test.* *.spec.* /test/ /tests/ __tests__/` | `kiem-thu-phan-mem` |
  | Nghiệp vụ/spec: `**/frd.md requirements **/*.feature` | `phan-tich-nghiep-vu` |
  | Kiến trúc/tech: `**/tech.md **/sad.md adr* *.puml design docs kiến trúc` | `thiet-ke-he-thong` |
  | Không khớp loại nào & không phải binary | mặc định `review-code` (ghi chú "loại file chung") |
  | Binary/lock/generated (`*.lock package-lock.json *.min.* ảnh nhị phân`) | **bỏ qua** (ghi chú đã bỏ) |
  > 1 file có thể kích **nhiều** skill (vd file code nhạy cảm → `review-code` + `bao-mat-he-thong`).

- **#5 "Tài liệu hệ thống"** → ADR-009 (in-repo `.spec/`,`docs/`,`README*`,`*.md` gốc + nguồn cấu hình project; in-repo ưu tiên).
- **#6 Giới hạn an toàn (mặc định, cấu hình được):**
  - Tối đa **50 file** review / PR; tối đa **5.000 dòng diff**; vượt → review phần ưu tiên + báo đã cắt.
  - Trần token Claude / PR cấu hình theo project (mặc định hệ thống); vượt → dừng & báo.
  - **Rate-limit:** mặc định **N lệnh / người / 10 phút** (vd N=5), cấu hình được.
  - **Output Slack:** tóm tắt theo severity trong message; chi tiết dài → đính kèm snippet/file (tránh trần ký tự/block Slack).

**Chuyển bước sau (không chặn thiết kế):**
- `[→ /tn-bao-mat]` Thuật toán mã hoá secret at-rest & quản lý master key (FRD #3).
- `[→ /tn-bao-mat]` Cơ chế định danh owner ổn định từ Azure profile + allowlist người được tạo project (FRD #2).
- `[→ nghiệp vụ #8]` Chấp nhận hay siết việc "mọi người review mọi project" (điểm chốt `authorizeReviewCommand` đã sẵn).
- `[→ nghiệp vụ #9]` Phạm vi duy nhất tên project (toàn hệ thống vs theo owner) ảnh hưởng resolve Slack.
- `[→ nghiệp vụ #7]` Đồng ý/hợp đồng cho dữ liệu khách hàng đi qua Claude.

---

# Architecture Recommendations

- `[Ưu tiên 1 — Ownership/Tenant]` Bắt buộc `ownerId` ở repository layer cho mọi truy vấn project; trả 404 cho tài nguyên người khác. Chốt điểm `authorizeReviewCommand` cho kênh Slack.
- `[Ưu tiên 2 — Source of Truth/Temporal]` Snapshot `commitHash` + cấu hình + **skill version** vào mỗi `ReviewJob`; lưu history bất biến.
- `[Ưu tiên 3 — Integration/Resiliency]` ACL ports cho Slack/Azure/CLI; retry/backoff/timeout/lease + circuit breaker theo project token; lưu history **trước** post Slack.
- `[Ưu tiên 4 — Data Lifecycle/Security]` Xoá temp clone trong `finally` + dọn rác clone mồ côi; mã hoá secret write-only; lọc secret khỏi log.
- `[Ưu tiên 5 — Concurrency]` DB-queue với `findOneAndUpdate` atomic + lease/visibility timeout + unique index idempotency; reclaim job mồ côi; concurrency 5.
- `[Ưu tiên 6 — Tech Debt]` Yêu cầu skill xuất finding theo định dạng máy-đọc (JSON block) để aggregate đáng tin; pin version CLI + `.claude/skills`.
- `[Ưu tiên 7 — Observability]` Correlation id xuyên luồng; metrics cost/queue-depth/error-rate theo project (phục vụ KPI & kiểm soát chi phí).
</content>
</invoke>
