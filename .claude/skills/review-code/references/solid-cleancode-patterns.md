# SOLID + Clean Architecture + Patterns — Bản Đồ Kỹ Thuật Review Code

Dùng file này để gắn nền tảng phương pháp luận chuẩn cho mỗi phát hiện. Ngoài framework gốc, bổ sung các framework engineering thực chiến cho hệ enterprise.

---

## A. SOLID

| Nguyên tắc | Ý nghĩa | Dấu hiệu vi phạm |
|------------|---------|------------------|
| **SRP** — Single Responsibility | 1 class/module 1 lý do thay đổi | God class, service ôm nhiều domain |
| **OCP** — Open/Closed | Mở rộng không sửa code cũ | switch/if dài theo type; thêm case phải sửa nhiều nơi |
| **LSP** — Liskov Substitution | Subtype thay được base type | Override ném NotSupported, vi phạm contract |
| **ISP** — Interface Segregation | Interface nhỏ, chuyên biệt | "Fat interface", client phụ thuộc method không dùng |
| **DIP** — Dependency Inversion | Phụ thuộc abstraction, không phụ thuộc concrete | Domain import hạ tầng trực tiếp, new() service trong domain |

---

## B. Clean Architecture & DDD Tactical

- **Clean / Hexagonal Architecture**: dependency hướng vào trong (Domain ← Application ← Infrastructure). Soi **layer violation**: domain biết về DB/HTTP/framework; logic nghiệp vụ rò ra controller/repository (khía cạnh #2, #24).
- **DDD Tactical**: Entity (có định danh) vs Value Object (bất biến, so sánh theo giá trị); Aggregate Root giữ invariant; Domain Service cho logic không thuộc entity; Repository chỉ truy xuất aggregate; Domain Event mô tả việc đã xảy ra. Soi **anemic domain model** (entity chỉ getter/setter, logic nằm ở service).

---

## C. Design Patterns (GoF) & chống over-engineering

| Pattern | Dùng đúng khi | Lạm dụng |
|---------|---------------|----------|
| Factory | Khởi tạo phức tạp/đa biến thể | Factory cho object đơn giản |
| Strategy | Thuật toán thay thế theo ngữ cảnh | Strategy cho 1 nhánh if |
| Observer / Mediator | Tách phụ thuộc sự kiện | Event hoá luồng tuần tự đơn giản |
| Adapter | Bọc API ngoài (ACL) | Adapter thừa khi interface đã hợp |
| Decorator | Thêm hành vi không đổi interface | Lồng nhiều lớp khó debug |

> Nguyên tắc: pattern phục vụ tính thay đổi thực tế. Không có biến thể/điểm mở rộng thật thì pattern = over-engineering (#5).

---

## D. Distributed System & Reliability Patterns (cốt lõi cho mục ⚠️)

| Vấn đề | Pattern / Kỹ thuật | Khía cạnh |
|--------|--------------------|-----------|
| Side-effect trong transaction | Tách commit DB trước, side-effect sau; **Transactional Outbox**; Saga cho transaction phân tán | #6, #17 |
| Trùng lặp do retry/double-click | **Idempotency Key**, dedup theo business key, unique constraint, upsert | #7 |
| Ghi đè đồng thời | **Optimistic Lock** (version column) / **Pessimistic Lock**; unique constraint chống double-insert | #8 |
| Tích hợp ngoài chập chờn | **Retry + backoff**, **Timeout**, **Circuit Breaker**, **Bulkhead**, **Fallback** (Release It! / Polly/Resilience4j) | #15, #16, #22 |
| Message lỗi/độc | **Dead Letter Queue**, poison-message handling, at-least-once + idempotent consumer | #17 |
| Nhất quán dữ liệu | CAP / eventual consistency; **compensation** thay vì 2PC | #9, #16 |

---

## E. Performance, Data & Caching

- **Performance Engineering**: soi N+1 (lazy loading trong vòng lặp), full table scan, missing index, heavy join, allocation lớn trong hot path (#12, #13). Đo trước khi tối ưu.
- **Caching**: chọn chiến lược (Cache-Aside/Write-Through/Write-Behind); luôn có **invalidation** rõ ràng và chống **cache stampede** (lock/single-flight, jitter TTL) (#14).
- **Temporal data**: tách snapshot/historical khỏi current để báo cáo & approval cũ không đổi khi dữ liệu hiện tại thay đổi (#10).

---

## F. Secure Coding, Observability, Testing

| Lĩnh vực | Chuẩn / Framework | Khía cạnh |
|----------|-------------------|-----------|
| Secure Coding | **OWASP Top 10 / ASVS** — SQLi/XSS/CSRF/IDOR/Mass Assignment, không log dữ liệu nhạy cảm | #18, #19, #20 |
| Observability | **3 pillars** Logs/Metrics/Traces, **OpenTelemetry**, CorrelationId xuyên request, RED/USE method, SLO/alert | #21 |
| Error Handling | Fail fast + global handler; phân biệt lỗi nghiệp vụ vs hệ thống; compensation/retry idempotent | #22 |
| Testability | **DI** để mock; **Test Pyramid** (unit > integration > e2e); AAA; tách side-effect để test thuần | #23 |
| Maintainability | Coupling/Cohesion, độ phức tạp cyclomatic; **Twelve-Factor App** cho config/deploy | #24, #27 |

---

## G. Refactoring Catalog (Fowler) — đặt tên đúng cho tech debt

God Class/Service · Long Method · Duplicate Code · **Shotgun Surgery** (1 thay đổi rải nhiều file) · **Feature Envy** (method dùng dữ liệu class khác nhiều hơn của mình) · Data Clumps · Primitive Obsession. Mỗi smell → đề xuất refactoring tương ứng (Extract Method/Class, Move Method, Replace Conditional with Polymorphism...) trong mục *Refactoring Recommendations* (#25).

---

## Bảng tra nhanh: khía cạnh → framework

| Khía cạnh | Framework chính |
|-----------|-----------------|
| #1 | Requirement Traceability |
| #2 | DDD Tactical, Clean Architecture |
| #3 | SOLID |
| #4, #25 | Clean Code, Refactoring Catalog |
| #5 | GoF Design Patterns |
| #6, #7, #8, #16, #17 | Distributed/Reliability Patterns (Outbox, Saga, Idempotency, Locking, Circuit Breaker, DLQ) |
| #9, #10, #13 | Data Integrity, Temporal Modeling, DB design |
| #11 | API Design Guidelines |
| #12, #14, #28 | Performance Engineering, Caching, Scalability |
| #18, #19, #20 | Secure Coding (OWASP/ASVS) |
| #21 | Observability Engineering (OTel, 3 pillars) |
| #22, #23 | Error Handling, Test Pyramid |
| #24, #26, #27 | Maintainability, Backward Compatibility, Twelve-Factor |
