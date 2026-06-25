# Checklist 28 Khía Cạnh Review Kiến Trúc

Chạy qua **đầy đủ 28 khía cạnh** cho mỗi hệ thống/tính năng. Mỗi khía cạnh: phân tích, soi rủi ro, gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`. Chi tiết framework/technique xem [togaf-ddd-patterns.md](togaf-ddd-patterns.md).

> ⚠️ **7 mục BẮT BUỘC PHÂN TÍCH** (không được bỏ qua): #8 Data Ownership, #9 Source of Truth, #10 Temporal Data, #16 Integration Failure, #20 Permission Scope, #24 Observability, #27 ADR.

---

## 1. Business Architecture Review (TOGAF)
- **Đánh giá**: Business Capability, Business Process, Business Service, Business Actor.
- **Kiểm tra**: Feature có phù hợp mục tiêu nghiệp vụ? Có trùng capability? Có xung đột quy trình?
- **Output**: Business Architecture Issues, Capability Impact.

## 2. Domain Analysis (DDD)
- **Xác định**: Core / Supporting / Generic Domain.
- **Đánh giá**: Domain Boundary, Ownership, Responsibility.
- **Kiểm tra**: Domain nào ôm quá nhiều trách nhiệm? Domain nào trùng lặp? Domain nào phụ thuộc sai?
- **Output**: Domain Review, Domain Risks.

## 3. Ubiquitous Language Review
- **Kiểm tra**: Thuật ngữ nghiệp vụ, tên entity/service/event.
- **Tìm**: Một khái niệm nhiều tên; một tên nhiều nghĩa.
- **Output**: Terminology Conflict, Naming Recommendation.

## 4. Bounded Context Analysis
- **Xác định context**: HRM, Payroll, Recruitment, Asset, Approval, Notification, Identity, Timekeeping.
- **Kiểm tra**: Context Boundary, Dependency, Ownership.
- **Output**: Context Issues, Context Coupling Risks.

## 5. Aggregate Review
- **Xác định**: Aggregate Root, Entity, Value Object.
- **Đánh giá**: Aggregate quá lớn / quá nhỏ; transaction xuyên Aggregate.
- **Output**: Aggregate Risks.

## 6. Domain Event Analysis
- **Sinh đầy đủ**: Commands, Events, Policies. Ví dụ: EmployeeCreated, EmployeeTransferred, LeaveRequested, LeaveApproved, LeaveRejected, AssetAssigned.
- **Kiểm tra**: Missing Event, Duplicate Event, Circular Event.
- **Output**: Event Catalog, Event Risks.

## 7. Event Storming Review
- **Phân tích**: Command → Event → Policy → Read Model.
- **Tìm**: Missing Event, Missing Policy, Missing Read Model.
- **Output**: Event Flow, Event Gaps.

## 8. Data Ownership Matrix ⚠️ BẮT BUỘC
- **Xác định**: Data Item / Owner / Master System / Consumer System (vd: Employee, Department, Role, Permission).
- **Kiểm tra**: Ai sở hữu dữ liệu? Ai được sửa? Ai chỉ được đọc?
- **Output**: Data Ownership Matrix.

## 9. Source of Truth Analysis ⚠️ BẮT BUỘC
- **Kiểm tra**: Hệ thống nào là nguồn dữ liệu chuẩn? Nếu conflict thì tin ai? (vd: Employee Name — HRM? Payroll? SSO? AD?).
- **Output**: Source of Truth Matrix.

## 10. Temporal Data Analysis ⚠️ BẮT BUỘC
- **Kiểm tra**: Current / Historical / Snapshot / Audit Data.
- **Câu hỏi**: Khi dữ liệu thay đổi thì lịch sử giữ thế nào? Báo cáo cũ có thay đổi không? Approval cũ có bị ảnh hưởng không?
- **Output**: Historical Data Risks.

## 11. Data Lifecycle Review
- **Kiểm tra vòng đời**: Create → Active → Inactive → Archived → Deleted → Purged.
- **Đánh giá**: Retention Policy, Archiving Strategy, Purging Strategy.
- **Output**: Data Lifecycle Risks.

## 12. Application Architecture Review
- **Đánh giá thành phần**: Frontend, Backend, API, Worker, Scheduler, Notification Service, Approval Service.
- **Kiểm tra**: Coupling, Cohesion, Layer Violation.
- **Output**: Application Risks.

## 13. Architecture Pattern Review
- **Đánh giá phù hợp**: Layered, Clean Architecture, Hexagonal, Modular Monolith, Microservice, CQRS, Event-Driven.
- **Tìm**: Over Engineering, Under Engineering.
- **Output**: Pattern Recommendation.

## 14. API Design Review
- **Kiểm tra**: Naming, Versioning, Filtering, Pagination, Idempotency.
- **Output**: API Design Issues.

## 15. Integration Review
- **Kiểm tra hệ ngoài**: ERP, Payroll, SSO, AD, Email, SMS.
- **Đánh giá**: Retry, Timeout, Fallback, Circuit Breaker.
- **Output**: Integration Risks.

## 16. Integration Failure Analysis ⚠️ BẮT BUỘC
- **Giả lập**: API Timeout, API 500, Message Lost, Queue Full, Service Down.
- **Câu hỏi**: Hệ thống có tiếp tục chạy được không? Dữ liệu có bị mất không?
- **Output**: Failure Scenarios.

## 17. Multi-Tenant Review
- **Kiểm tra**: Tenant Isolation, Company Isolation, Data Segregation.
- **Output**: Tenant Risks.

## 18. Authentication Review
- **Kiểm tra**: Login, MFA, JWT, Refresh Token, SSO.
- **Output**: Authentication Risks.

## 19. Authorization Review
- **Kiểm tra**: RBAC, ABAC, Delegation, Hierarchy.
- **Output**: Authorization Risks.

## 20. Permission Scope Matrix ⚠️ BẮT BUỘC
- **Xác định**: Permission / Scope / Boundary (vd: View Employee — toàn công ty? chi nhánh? phòng ban? nhóm?).
- **Output**: Permission Scope Matrix.

## 21. Security Review (STRIDE)
- **Phân tích**: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege.
- **Output**: Threat Model.

## 22. Performance Review
- **Đánh giá**: Database, Query, Search, Report, Cache.
- **Output**: Performance Risks.

## 23. Scalability Review
- **Giả lập tải**: 10 → 100 → 1.000 → 10.000 → 100.000 user.
- **Output**: Scalability Risks.

## 24. Observability Review ⚠️ BẮT BUỘC
- **Kiểm tra**: Logging, Tracing, Metrics, Monitoring, Alerting.
- **Câu hỏi**: Lỗi xảy ra thì tìm ở đâu? Làm sao biết hệ thống đang lỗi?
- **Output**: Observability Gaps.

## 25. Deployment Review
- **Kiểm tra**: CI/CD, Migration, Rollback, Feature Toggle, Blue-Green, Canary.
- **Output**: Release Risks.

## 26. Technical Debt Review
- **Đánh giá**: Maintainability, Complexity, Coupling, Dependency.
- **Output**: Technical Debt Risks.

## 27. Architecture Decision Record (ADR) ⚠️ BẮT BUỘC
- **Mọi quyết định kiến trúc phải ghi**: Decision · Reason · Alternative · Trade-Off · Consequence.
- **Output**: ADR List.

## 28. Quality Attribute Review
- **Đánh giá**: Security, Performance, Reliability, Availability, Scalability, Maintainability, Testability, Operability, Observability.
- **Output**: Quality Attribute Assessment.
