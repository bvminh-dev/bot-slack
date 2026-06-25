# TOGAF + DDD + Architecture Patterns — Bản Đồ Kỹ Thuật

Dùng file này để gắn nền tảng phương pháp luận chuẩn cho mỗi phát hiện kiến trúc.

---

## A. TOGAF — 4 Architecture Domains (BDAT)

| Domain | Phạm vi | Khía cạnh liên quan |
|--------|---------|---------------------|
| **Business Architecture** | Capability, process, service, actor, tổ chức | #1 |
| **Data Architecture** | Ownership, source of truth, temporal, lifecycle, logical/physical data | #8, #9, #10, #11 |
| **Application Architecture** | Thành phần ứng dụng, tương tác, coupling/cohesion | #12, #13, #14 |
| **Technology Architecture** | Hạ tầng, tích hợp, vận hành, bảo mật, scale | #15–#26 |

> **ADM (Architecture Development Method)** là chu trình lặp (Vision → Business → IS (Data+App) → Technology → Opportunities → Migration → Governance → Change). Dùng ADM để xếp thứ tự review: nghiệp vụ trước, hạ tầng sau; mỗi vòng kết thúc bằng **ADR** (#27) và **Quality Attribute Assessment** (#28).

---

## B. Domain-Driven Design

### B1. Chiến lược (Strategic)
| Khái niệm | Ý nghĩa | Khía cạnh |
|-----------|---------|-----------|
| **Core / Supporting / Generic Domain** | Phân loại độ quan trọng để đầu tư đúng chỗ (Core tự xây, Generic mua/dùng sẵn) | #2 |
| **Bounded Context** | Ranh giới mô hình + ngôn ngữ nhất quán (HRM, Payroll, Identity...) | #4 |
| **Context Mapping** | Quan hệ giữa context: Partnership, Customer-Supplier, Conformist, ACL (Anti-Corruption Layer), Shared Kernel, OHS, Published Language | #4, #15 |
| **Ubiquitous Language** | Một ngôn ngữ chung cho nghiệp vụ & code; chống đồng nghĩa/đa nghĩa | #3 |

### B2. Chiến thuật (Tactical)
| Khái niệm | Ý nghĩa | Khía cạnh |
|-----------|---------|-----------|
| **Aggregate / Aggregate Root** | Đơn vị nhất quán giao dịch; 1 transaction = 1 aggregate | #5 |
| **Entity / Value Object** | Có/không định danh; VO bất biến | #5 |
| **Domain Event** | Sự kiện nghiệp vụ đã xảy ra (LeaveApproved...) | #6, #7 |
| **Repository / Factory / Domain Service** | Truy xuất, khởi tạo, logic không thuộc entity | #12 |

### B3. Event Storming
Quy trình khám phá: **Command → (Aggregate) → Domain Event → Policy → Read Model**, kèm Actor, External System, Hotspot. Dùng để soi Missing Event/Policy/Read Model và phát hiện circular event (#6, #7).

---

## C. Architecture Patterns — chọn đúng, tránh over/under engineering

| Pattern | Khi nên dùng | Rủi ro nếu dùng sai |
|---------|--------------|---------------------|
| **Layered** | CRUD đơn giản, team nhỏ | Dễ layer violation, anemic domain |
| **Clean Architecture** | Domain phức tạp, cần tách business khỏi framework | Boilerplate nếu domain mỏng |
| **Hexagonal (Ports & Adapters)** | Nhiều kênh I/O, cần thay adapter dễ | Phức tạp hóa khi ít tích hợp |
| **Modular Monolith** | Multi-context nhưng team/ops chưa sẵn cho microservice | Module coupling nếu boundary lỏng |
| **Microservice** | Scale & deploy độc lập theo context, team lớn | Distributed complexity, data consistency, vận hành nặng (under-staffed → thảm họa) |
| **CQRS** | Read/write bất đối xứng, báo cáo nặng | Over-engineering nếu model đơn giản |
| **Event-Driven (EDA)** | Tích hợp loose coupling, async, audit | Eventual consistency, khó debug nếu thiếu observability |

> **Nguyên tắc:** bắt đầu từ **Modular Monolith** với bounded context rõ ràng; chỉ tách microservice khi có lý do scale/team/độc-lập-deploy thật sự. Ghi lựa chọn vào **ADR** (#27).

---

## D. Bảo mật — STRIDE (Threat Modeling)

| Threat | Thuộc tính bị vi phạm | Ví dụ kiểm tra (#21) |
|--------|----------------------|----------------------|
| **S**poofing | Authentication | Giả danh user/service, token giả |
| **T**ampering | Integrity | Sửa dữ liệu/đơn đã duyệt |
| **R**epudiation | Non-repudiation | Thiếu audit log → chối hành động |
| **I**nformation Disclosure | Confidentiality | API trả dữ liệu vượt quyền/tenant |
| **D**enial of Service | Availability | Query nặng, không rate limit |
| **E**levation of Privilege | Authorization | Privilege escalation, RBAC/ABAC sai scope |

Kết hợp với #18 Authentication, #19 Authorization, #20 Permission Scope, #17 Multi-Tenant.

---

## E. Quality Attributes (ISO/IEC 25010) — dùng cho #28

Security · Performance Efficiency · Reliability · Availability · Scalability · Maintainability · Testability · Operability · Observability. Với mỗi thuộc tính: nêu **kịch bản chất lượng** (nguồn → kích thích → phản hồi → tiêu chí đo) thay vì nhận định chung chung.

---

## F. C4 Model & ADR (trình bày + ra quyết định)

- **C4 Model**: mô tả kiến trúc theo 4 mức — **Context → Container → Component → Code**. Dùng cho mục *Tóm Tắt Kiến Trúc* và *Application Architecture* (#12).
- **ADR (#27)**: mỗi quyết định ghi `Decision / Reason / Alternative / Trade-Off / Consequence`. Đánh số ADR-001, ADR-002…

---

## Bảng tra nhanh: khía cạnh → framework/technique

| Khía cạnh | Framework / Technique chính |
|-----------|-----------------------------|
| #1 | TOGAF Business Architecture, Business Capability Map |
| #2–#5 | DDD Strategic + Tactical, Context Mapping |
| #6–#7 | Event Storming, Domain Events, CQRS Read Model |
| #8–#11 | TOGAF Data Architecture, Data Ownership/Source-of-Truth/Temporal/Lifecycle |
| #12–#13 | C4 Model, Architecture Patterns, Clean/Hexagonal |
| #14 | API Design Guidelines (REST, versioning, idempotency) |
| #15–#16 | Integration Patterns, Resiliency (Retry/Timeout/Fallback/Circuit Breaker), ACL |
| #17 | Multi-Tenancy Patterns (isolation: silo/pool/bridge) |
| #18–#21 | STRIDE, RBAC/ABAC, IAM |
| #22–#23 | Performance & Scalability Analysis, Load Scenarios |
| #24 | Observability (Logs/Traces/Metrics), SLO/SLI |
| #25 | Deployment Strategies (Blue-Green/Canary/Feature Toggle) |
| #26 | Technical Debt & Coupling Analysis |
| #27 | ADR |
| #28 | Quality Attribute Analysis (ISO 25010) |
