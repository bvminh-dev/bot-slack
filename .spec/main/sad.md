---
doc: sad
title: Software Architecture Document — tieu-nhi (Slack bot review PR Azure)
status: living
updated: 2026-06-25
sources: [i-001]
---

# SAD — Trạng thái kiến trúc hợp nhất

> Tài liệu kiến trúc toàn hệ thống (living). Mỗi tính năng cascade phần kiến trúc của mình vào đây. Chi tiết theo tính năng: `main/feature/<slug>/tech.md`.

## 1. Bối cảnh hệ thống (C4 — Context)

Hệ thống **tieu-nhi** là Slack bot review tự động Pull Request trên Azure DevOps. Actor & hệ ngoài:

```
 Người dùng Slack ──@tieu-nhi <project> review <pr-url>──▶ tieu-nhi ◀── kết quả review (thread)
 Owner (Admin)    ──login Azure PAT / CRUD project (HTTPS)──▶ tieu-nhi (React Admin UI + API)
 tieu-nhi ──Azure PAT (per project)──▶ Azure DevOps (Git + PR API)
 tieu-nhi ──ANTHROPIC_API_KEY (per project)──▶ Claude Code CLI headless (.claude/skills)
 tieu-nhi ──▶ MongoDB (registry / secret / queue / audit / history)
```

## 2. Kiểu kiến trúc & stack (toàn hệ thống)

- **Modular Monolith** (Node.js + TypeScript), Clean Architecture nội bộ (domain ← application ← adapters). *(ADR-002, i-001)*
- **Admin UI:** ReactJS SPA. *(ADR-001)*
- **Store:** MongoDB — pool multi-tenant, cô lập bằng `ownerId` filter bắt buộc. *(ADR-005)*
- **Async:** queue trong MongoDB (collection `review_jobs`), worker poll `findOneAndUpdate` atomic claim + lease timeout, **max concurrency 5**. *(ADR-004)*
- **AI runtime:** Claude Code CLI headless (`claude -p`), token/model/effort theo project, cwd = repo clone. *(ADR-003)*
- **Hệ ngoài bọc bằng ACL ports:** `ISlackPort`, `IAzureClient`, `ISkillRunner`. *(ADR-011)*

## 3. Bounded Context (toàn hệ thống)

| Context | Loại | Trách nhiệm | Nguồn |
|---------|------|-------------|-------|
| Review Orchestration | Core | Vòng đời lệnh review | i-001 |
| Project Registry & Secrets | Core | Cấu hình project + mã hoá secret + cô lập owner | i-001 |
| Skill Execution | Supporting | Adapter chạy `.claude/skills` qua CLI; map file→skill | i-001 |
| Identity & Ownership | Supporting | Định danh owner từ Azure PAT; phiên Admin | i-001 |
| Azure DevOps Access | Generic | Git/PR qua ACL | i-001 |
| Slack Gateway | Generic | Nhận/đăng message qua adapter | i-001 |
| Audit & History | Supporting | Ghi vết + lịch sử review | i-001 |

Context Mapping: Registry = Customer-Supplier (upstream) của Orchestration; Identity = Conformist với Azure; hệ ngoài qua ACL.

## 4. Nguyên tắc kiến trúc (cross-cutting, bắt buộc)

1. **Tenant isolation:** mọi truy vấn project lọc `ownerId` (lấy từ session, không từ client); tài nguyên người khác trả 404. *(CRITICAL)*
2. **Secret write-only + mã hoá at-rest:** không bao giờ đọc-trả lại secret; chi tiết khoá master ở security.md.
3. **Idempotency `(projectId, prId, commitHash)`** + snapshot cấu hình + skill version vào mỗi `ReviewJob`. *(ADR-007)*
4. **Lưu history TRƯỚC khi post Slack; xoá temp clone trong `finally`.** *(ADR-010)*
5. **Resiliency hệ ngoài:** retry/backoff/timeout + lease/visibility timeout + circuit breaker theo project token.
6. **Untrusted input:** nội dung PR là dữ liệu không tin cậy → chống prompt injection vào skill.
7. **Observability:** correlation id xuyên Slack→job→skill→post; structured log lọc secret; metrics cost/queue/error theo project.

## 5. Quyết định kiến trúc (ADR Registry hợp nhất)

| ID | Decision | Nguồn |
|----|----------|-------|
| ADR-001 | Node.js+TS, UI ReactJS | i-001 |
| ADR-002 | Modular Monolith (Clean Arch) | i-001 |
| ADR-003 | Skill chạy bằng Claude Code CLI headless, token/model/effort theo project | i-001 |
| ADR-004 | Queue trong MongoDB + worker poll, atomic claim, lease, max concurrency 5 | i-001 |
| ADR-005 | MongoDB store, pool + ownerId filter | i-001 |
| ADR-006 | Model+effort catalog; default `claude-sonnet-4-6`/`medium` | i-001 |
| ADR-007 | Idempotency `(project,pr,commit)` + snapshot config/skill version | i-001 |
| ADR-008 | File→skill mapping theo extension/path, hỗ trợ đa-skill | i-001 |
| ADR-009 | "Tài liệu hệ thống" = in-repo (`.spec/`,`docs/`,README,`*.md`) + nguồn cấu hình project | i-001 |
| ADR-010 | Lưu history trước post Slack; xoá temp clone trong finally | i-001 |
| ADR-011 | ACL ports cho Slack/Azure/Claude CLI | i-001 |

> Chi tiết Decision/Reason/Alternative/Trade-Off/Consequence: `main/feature/review-pr-slack-azure/tech.md`.

## 6. Rủi ro kiến trúc nổi bật (toàn hệ thống)

- `[CRITICAL]` Mã hoá secret at-rest + quản lý khoá master → `/tn-bao-mat` (i-001).
- `[CRITICAL]` Xung đột isolation: Admin cô lập theo owner nhưng Slack cho mọi người review mọi project (FRD #8) — điểm chốt `authorizeReviewCommand` đã chuẩn bị.
- `[HIGH]` Scalability: DB-queue poll là trần ~10.000+ job → đường mở rộng sang message broker + tách worker.
- `[HIGH]` Skill `.claude/skills` là shared dependency có version → pin + ghi version vào job để tái lập.

## 7. Catalog model + effort (hệ thống)

- Model hợp lệ: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`. ReasoningEffort: `low | medium | high`.
- Mặc định khi project bỏ trống: `claude-sonnet-4-6` + `medium`.
- Catalog lưu cấu hình (DB/file) để cập nhật model mới không cần sửa code. *(ADR-006)*
</content>
