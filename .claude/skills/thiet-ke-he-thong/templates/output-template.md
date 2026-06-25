# Template Định Dạng Kết Quả (BẮT BUỘC)

Trình bày kết quả theo **đúng 28 mục dưới đây, đúng thứ tự**. Không bỏ mục nào — mục không áp dụng ghi rõ `Không áp dụng / Không phát hiện`. Mỗi phát hiện gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`; ghi kèm framework/technique đã dùng khi phù hợp (vd: *DDD Bounded Context*, *STRIDE*, *ISO 25010*).

---

# Tóm Tắt Kiến Trúc
> Tổng quan giải pháp (gợi ý dùng C4: Context → Container) và các phát hiện trọng yếu.

# Domain Model
> Core / Supporting / Generic Domain · trách nhiệm · `[MỨC]` Domain Risks.

# Ubiquitous Language
| Khái niệm | Tên hiện tại | Vấn đề (đồng nghĩa/đa nghĩa) | Khuyến nghị |
|-----------|--------------|------------------------------|-------------|
| ... | | | |

# Bounded Context
> Sơ đồ context + quan hệ (Context Mapping: ACL/Customer-Supplier/...). `[MỨC]` Context Coupling Risks.

# Aggregate Design
> Aggregate Root / Entity / Value Object · `[MỨC]` Aggregate quá lớn-nhỏ, transaction xuyên aggregate.

# Domain Events
| Command | Event | Policy | Vấn đề (missing/duplicate/circular) |
|---------|-------|--------|-------------------------------------|
| ... | | | `[MỨC]` |

# Event Storming
> Command → Event → Policy → Read Model · `[MỨC]` Event Gaps (missing event/policy/read model).

# Data Ownership Matrix
| Data Item | Owner | Master System | Consumer System | Quyền sửa | Vấn đề |
|-----------|-------|---------------|-----------------|-----------|--------|
| Employee | | | | | `[MỨC]` |

# Source Of Truth Matrix
| Data Item | Ứng viên nguồn | Source of Truth | Quy tắc khi conflict |
|-----------|----------------|-----------------|----------------------|
| Employee Name | HRM / Payroll / SSO / AD | | |

# Historical Data Analysis
> Current / Historical / Snapshot / Audit · ảnh hưởng tới báo cáo cũ & approval cũ · `[MỨC]` Historical Data Risks.

# Data Lifecycle Analysis
> Create → Active → Inactive → Archived → Deleted → Purged · Retention/Archiving/Purging · `[MỨC]` Risks.

# Architecture Pattern Review
> Pattern hiện tại vs đề xuất · `[MỨC]` Over/Under Engineering · Pattern Recommendation.

# API Review
> Naming/Versioning/Filtering/Pagination/Idempotency · `[MỨC]` API Design Issues.

# Integration Review
| Hệ ngoài | Retry | Timeout | Fallback | Circuit Breaker | Rủi ro |
|----------|-------|---------|----------|-----------------|--------|
| ERP/Payroll/SSO/AD/Email/SMS | | | | | `[MỨC]` |

# Integration Failure Analysis
| Kịch bản lỗi | Hệ thống còn chạy? | Mất dữ liệu? | Xử lý mong đợi |
|--------------|--------------------|--------------|----------------|
| API Timeout / 500 / Message Lost / Queue Full / Service Down | | | `[MỨC]` |

# Multi Tenant Review
> Tenant/Company Isolation · Data Segregation · mô hình (silo/pool/bridge) · `[MỨC]` Tenant Risks.

# Authentication Review
> Login/MFA/JWT/Refresh Token/SSO · `[MỨC]` Authentication Risks.

# Authorization Review
> RBAC/ABAC/Delegation/Hierarchy · `[MỨC]` Authorization Risks.

# Permission Scope Matrix
| Permission | Scope (công ty/chi nhánh/phòng ban/nhóm) | Boundary | Vấn đề |
|------------|------------------------------------------|----------|--------|
| View Employee | | | `[MỨC]` |

# Security Threat Model
| STRIDE | Threat cụ thể | Tài sản bị đe dọa | Biện pháp | Mức |
|--------|---------------|-------------------|-----------|-----|
| Spoofing/Tampering/Repudiation/Info Disclosure/DoS/EoP | | | | `[MỨC]` |

# Performance Risks
- `[MỨC]` ... (database/query/search/report/cache)

# Scalability Risks
- `[MỨC]` ... (kịch bản 10 → 100 → 1.000 → 10.000 → 100.000 user: cái gì hỏng trước?)

# Observability Gaps
- `[MỨC]` ... (logging/tracing/metrics/monitoring/alerting; lỗi xảy ra thì tìm ở đâu?)

# Technical Debt Risks
- `[MỨC]` ... (maintainability/complexity/coupling/dependency)

# ADR Recommendations
| ID | Decision | Reason | Alternative | Trade-Off | Consequence |
|----|----------|--------|-------------|-----------|-------------|
| ADR-001 | | | | | |

# Quality Attribute Assessment
| Thuộc tính (ISO 25010) | Đánh giá | Kịch bản chất lượng | Mức rủi ro |
|------------------------|----------|---------------------|------------|
| Security / Performance / Reliability / Availability / Scalability / Maintainability / Testability / Operability / Observability | | | `[MỨC]` |

# Open Questions
1. ...

# Architecture Recommendations
- `[Ưu tiên]` ... (theo thứ tự: sai Domain/Ownership/Boundary/Permission Scope/Integration/Data Lifecycle/Source of Truth/Tech Debt/Scalability)
