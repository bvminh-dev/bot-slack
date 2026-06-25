# Template Định Dạng Kết Quả (BẮT BUỘC)

Trình bày kết quả theo **đúng 29 mục dưới đây, đúng thứ tự**. Không bỏ mục nào — mục không phát hiện ghi rõ `Không phát hiện`. Mỗi phát hiện gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`, kèm **`path:line` · tác động · cách sửa**, và ghi framework/nguyên tắc khi phù hợp (vd: *SRP*, *Idempotency*, *N+1*).

---

# Requirement Mapping
| Requirement / Rule / Permission | Đã implement? | Gap | Mức |
|---------------------------------|---------------|-----|-----|
| ... | | | `[MỨC]` |

# Domain Model Review
- `[MỨC]` `path:line` — ... (entity ôm quá nhiều việc / anemic / logic sai nơi)

# SOLID Violations
- `[MỨC]` `path:line` — ... (SRP/OCP/LSP/ISP/DIP)

# Code Smells
- `[MỨC]` `path:line` — ... (naming/readability/long function/complexity/duplication)

# Design Pattern Review
- `[MỨC]` `path:line` — ... (pattern dùng sai / over-engineering)

# Transaction Boundary Review ⚠️
- `[MỨC]` `path:line` — ... (side-effect ngoài DB trong transaction; hành vi khi fail/rollback)

# Idempotency Review ⚠️
- `[MỨC]` `path:line` — ... (double-click/retry/duplicate message → dữ liệu trùng?)

# Concurrency Review ⚠️
- `[MỨC]` `path:line` — ... (lost update; optimistic/pessimistic lock; version column)

# Data Integrity Review
- `[MỨC]` `path:line` — ... (FK/unique/check/referential; orphan/duplicate; cascade/soft delete)

# Historical Data Review ⚠️
- `[MỨC]` `path:line` — ... (current vs historical/snapshot/audit; báo cáo & approval cũ)

# API Review
- `[MỨC]` `path:line` — ... (REST/GraphQL/RPC, versioning, pagination, idempotency, error handling)

# Performance Review
- `[MỨC]` `path:line` — ... (N+1, full scan, missing index, heavy join, large object)

# Database Review
- `[MỨC]` `path:line` — ... (schema, normalization, index, partitioning, archiving)

# Cache Review
- `[MỨC]` `path:line` — ... (strategy, invalidation, stampede)

# Integration Review
- `[MỨC]` `path:line` — ... (SSO/Payroll/ERP/AD/Third-Party)

# Integration Failure Review ⚠️
| Kịch bản lỗi | Retry? | Mất dữ liệu? | Đồng bộ lại? | Mức |
|--------------|--------|--------------|--------------|-----|
| Timeout / 500 / Network / Message Lost / Queue Full / Service Down | | | | `[MỨC]` |

# Event Processing Review
- `[MỨC]` `path:line` — ... (publish/consume, retry, DLQ, poison message, duplicate)

# Security Coding Review
- `[MỨC]` `path:line` — ... (SQLi/XSS/CSRF/Mass Assignment/IDOR/sensitive logging) — *OWASP*

# Authentication Review
- `[MỨC]` `path:line` — ... (JWT/refresh/session/rotation/logout/revocation)

# Authorization Review
- `[MỨC]` `path:line` — ... (role/permission/scope/hierarchy/ownership)

# Observability Review ⚠️
- `[MỨC]` `path:line` — ... (logging/metrics/tracing/correlationId/alerting; production lỗi tìm ở đâu?)

# Error Handling Review
- `[MỨC]` `path:line` — ... (try-catch/global exception/fallback/retry/compensation)

# Testability Review
- `[MỨC]` `path:line` — ... (DI/mockability/isolation; thiếu unit/integration test cho nhánh quan trọng)

# Maintainability Review
- `[MỨC]` `path:line` — ... (coupling/cohesion/complexity/dependency)

# Technical Debt Review ⚠️
- `[MỨC]` `path:line` — ... (God Class/Service, Long Method, Duplicate, Shotgun Surgery, Feature Envy)

# Backward Compatibility Review
- `[MỨC]` `path:line` — ... (API/DB schema/message/event contract; breaking change?)

# Deployment Review
- `[MỨC]` `path:line` — ... (migration/rollback/feature toggle/blue-green/canary)

# Scalability Review
- `[MỨC]` ... (kịch bản 10 → 100 → 1.000 → 10.000 → 100.000 user: cái gì hỏng trước?)

# Refactoring Recommendations
> Theo thứ tự ưu tiên, kèm smell → refactoring đề xuất (Extract Method/Class, Move Method, Replace Conditional with Polymorphism...).

1. `[Ưu tiên]` `path:line` — ...

---

## Tổng kết 5 câu hỏi bắt buộc
1. **Điều gì sẽ hỏng đầu tiên?** — ...
2. **Điều gì khó bảo trì nhất?** — ...
3. **Điều gì sẽ gây mất dữ liệu?** — ...
4. **Điều gì sẽ gây downtime?** — ...
5. **Điều gì khiến team trả technical debt sau này?** — ...
