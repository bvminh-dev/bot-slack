# Checklist 28 Khía Cạnh Review Code

Chạy qua **đầy đủ 28 khía cạnh** cho mỗi diff/PR/module. Mỗi phát hiện: gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`, kèm `path:line`, tác động và cách sửa. Chi tiết framework/nguyên tắc xem [solid-cleancode-patterns.md](solid-cleancode-patterns.md).

> ⚠️ **7 mục BẮT BUỘC PHÂN TÍCH**: #6 Transaction Boundary, #7 Idempotency, #8 Concurrency, #10 Temporal Data, #16 Integration Failure, #21 Observability, #25 Technical Debt.

---

## 1. Requirement to Code Traceability
- **Kiểm tra**: Requirement / Business Rule / Permission Mapping.
- **Đánh giá**: Implement đúng requirement? Bỏ sót business rule? Bỏ sót permission?
- **Output**: Requirement Gap, Implementation Gap.

## 2. Domain Model Review
- **Kiểm tra**: Entity, Value Object, Domain Service, Domain Event, Repository.
- **Đánh giá**: Domain có đúng? Entity ôm quá nhiều việc? Logic nghiệp vụ nằm đúng nơi?
- **Output**: Domain Design Issues.

## 3. SOLID Review
- **Kiểm tra**: SRP, OCP, LSP, ISP, DIP.
- **Đánh giá**: Class quá nhiều trách nhiệm? Phụ thuộc đúng chiều? Vi phạm abstraction?
- **Output**: SOLID Violations.

## 4. Clean Code Review
- **Kiểm tra**: Naming, Readability, Function Length, Complexity, Duplication.
- **Output**: Code Smells.

## 5. Design Pattern Review
- **Đánh giá**: Factory, Strategy, Observer, Adapter, Mediator, Decorator.
- **Kiểm tra**: Dùng pattern sai? Over-engineering?
- **Output**: Pattern Issues.

## 6. Transaction Boundary Review ⚠️ BẮT BUỘC
- **Xác định**: Transaction Start / End.
- **Kiểm tra side-effect trong transaction**: External API? Mail? Queue? Event Publish?
- **Câu hỏi**: Nếu fail giữa chừng thì sao? Rollback thế nào?
- **Output**: Transaction Risks.

## 7. Idempotency Review ⚠️ BẮT BUỘC
- **Giả lập**: Double Click, Retry Request, Duplicate Message, Duplicate Event.
- **Kiểm tra**: Request có idempotent? Có tạo dữ liệu trùng?
- **Output**: Idempotency Risks.

## 8. Concurrency Review ⚠️ BẮT BUỘC
- **Giả lập**: 2 user cùng sửa, 2 manager cùng duyệt, 2 worker cùng xử lý.
- **Kiểm tra**: Optimistic Lock, Pessimistic Lock, Version Column, Unique Constraint.
- **Output**: Concurrency Risks.

## 9. Data Integrity Review
- **Kiểm tra**: Foreign Key, Unique/Check Constraint, Referential Integrity, Soft Delete, Cascade Delete.
- **Câu hỏi**: Có thể sinh dữ liệu mồ côi/trùng không?
- **Output**: Data Integrity Risks.

## 10. Temporal Data Review ⚠️ BẮT BUỘC
- **Kiểm tra**: Current State, Historical State, Snapshot, Audit Data.
- **Câu hỏi**: Lịch sử có bị thay đổi theo dữ liệu hiện tại? Báo cáo cũ còn chính xác?
- **Output**: Historical Data Risks.

## 11. API Design Review
- **Kiểm tra**: REST/GraphQL/RPC, Versioning, Pagination, Filtering, Idempotency, Error Handling.
- **Output**: API Design Issues.

## 12. Performance Review
- **Kiểm tra**: N+1 Query, Full Table Scan, Missing Index, Heavy Join, Memory Allocation, Large Object.
- **Output**: Performance Risks.

## 13. Database Review
- **Kiểm tra**: Schema Design, Normalization, Index Strategy, Partitioning, Archiving.
- **Output**: Database Risks.

## 14. Caching Review
- **Kiểm tra**: Cache Aside, Write Through, Write Behind, Cache Invalidation, Cache Stampede.
- **Output**: Cache Risks.

## 15. Integration Review
- **Kiểm tra hệ ngoài**: SSO, Payroll, ERP, AD, Third-Party API.
- **Output**: Integration Risks.

## 16. Integration Failure Review ⚠️ BẮT BUỘC
- **Giả lập**: API Timeout, API 500, Network Failure, Message Lost, Queue Full, Service Down.
- **Câu hỏi**: Retry thế nào? Dữ liệu có mất? Có đồng bộ lại được?
- **Output**: Failure Risks.

## 17. Event Processing Review
- **Kiểm tra**: Event Publish/Consume, Retry, Dead Letter Queue, Poison Message, Duplicate Event.
- **Output**: Event Risks.

## 18. Security Coding Review
- **Kiểm tra**: SQL Injection, XSS, CSRF, Mass Assignment, IDOR, Sensitive Logging.
- **Output**: Secure Coding Risks.

## 19. Authentication Review
- **Kiểm tra**: JWT, Refresh Token, Session, Token Rotation, Logout, Revocation.
- **Output**: Authentication Risks.

## 20. Authorization Review
- **Kiểm tra**: Role, Permission, Scope, Hierarchy, Ownership.
- **Output**: Authorization Risks.

## 21. Observability Review ⚠️ BẮT BUỘC
- **Kiểm tra**: Logging, Metrics, Tracing, CorrelationId, Alerting.
- **Câu hỏi**: Production lỗi thì tìm ở đâu? Có trace được request không?
- **Output**: Observability Gaps.

## 22. Error Handling Review
- **Kiểm tra**: Try-Catch, Global Exception, Fallback, Retry, Compensation.
- **Output**: Error Handling Risks.

## 23. Testability Review
- **Kiểm tra**: Dependency Injection, Mockability, Isolation, Unit Test, Integration Test.
- **Output**: Testability Risks.

## 24. Maintainability Review
- **Đánh giá**: Coupling, Cohesion, Complexity, Dependency.
- **Output**: Maintainability Risks.

## 25. Technical Debt Review ⚠️ BẮT BUỘC
- **Đánh giá**: God Class, God Service, Long Method, Duplicate Code, Shotgun Surgery, Feature Envy.
- **Output**: Technical Debt Risks.

## 26. Backward Compatibility Review
- **Kiểm tra**: API Contract, Database Schema, Message Contract, Event Contract.
- **Output**: Compatibility Risks.

## 27. Deployment Review
- **Kiểm tra**: Migration, Rollback, Feature Toggle, Blue-Green, Canary.
- **Output**: Deployment Risks.

## 28. Scalability Review
- **Giả lập tải**: 10 → 100 → 1.000 → 10.000 → 100.000 user.
- **Output**: Scalability Risks.
