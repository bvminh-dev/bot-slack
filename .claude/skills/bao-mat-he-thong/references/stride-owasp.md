# STRIDE + OWASP — Bản Đồ Kỹ Thuật Bảo Mật

Dùng file này để gắn nền tảng phương pháp luận chuẩn cho mỗi phát hiện bảo mật.

---

## A. STRIDE Threat Modeling

| Threat | Thuộc tính bị vi phạm | Câu hỏi đánh giá | Đối ứng điển hình |
|--------|----------------------|------------------|-------------------|
| **S**poofing | Authentication | Có thể giả danh user/service/token không? | MFA, mutual TLS, chữ ký token |
| **T**ampering | Integrity | Có thể sửa dữ liệu/request/đơn đã duyệt? | Chữ ký số, checksum, validation phía server |
| **R**epudiation | Non-repudiation | Có thể chối hành động do thiếu log? | Audit log bất biến, log có ký |
| **I**nformation Disclosure | Confidentiality | API/Export/Error có lộ dữ liệu vượt quyền/tenant? | Mã hóa, field-level authz, mask dữ liệu |
| **D**enial of Service | Availability | Endpoint nào dễ bị làm quá tải? | Rate limit, quota, circuit breaker |
| **E**levation of Privilege | Authorization | Có đường nâng quyền ngang/dọc? | Least Privilege, kiểm tra authz mọi tầng |

> Quy trình STRIDE: phân rã hệ thống (DFD) → xác định trust boundary → liệt kê threat theo từng phần tử → đánh giá rủi ro → đề xuất mitigation. Gắn vào khía cạnh #1.

---

## B. OWASP Top 10 (2021)

| Mã | Hạng mục | Khía cạnh liên quan |
|----|----------|---------------------|
| **A01** | Broken Access Control | #8, #9, #25 |
| **A02** | Cryptographic Failures | #16, #17, #18 |
| **A03** | Injection (SQL/NoSQL/LDAP/Command/XSS) | #12, #13 |
| **A04** | Insecure Design | #1 (threat modeling), Secure by Design |
| **A05** | Security Misconfiguration | #26, CORS/Header/TLS |
| **A06** | Vulnerable & Outdated Components | #23 (dependency/third-party) |
| **A07** | Identification & Authentication Failures | #4, #5, #6 |
| **A08** | Software & Data Integrity Failures | #15, #23, supply chain |
| **A09** | Security Logging & Monitoring Failures | #19, #20, #21 |
| **A10** | Server-Side Request Forgery (SSRF) | #23, webhook/integration |

---

## C. OWASP API Security Top 10 (2023)

| Mã | Hạng mục | Khía cạnh liên quan |
|----|----------|---------------------|
| **API1** | Broken Object Level Authorization (BOLA/IDOR) | #8, #11 |
| **API2** | Broken Authentication | #4, #11 |
| **API3** | Broken Object Property Level Authorization (Excessive Data Exposure + Mass Assignment) | #11, #24 |
| **API4** | Unrestricted Resource Consumption | #22 (rate limit/quota) |
| **API5** | Broken Function Level Authorization | #7, #11 |
| **API6** | Unrestricted Access to Sensitive Business Flows | #11, business logic abuse |
| **API7** | Server-Side Request Forgery | #23 |
| **API8** | Security Misconfiguration | #26 |
| **API9** | Improper Inventory Management | #3 (attack surface), shadow/zombie API |
| **API10** | Unsafe Consumption of APIs | #23 (third-party API) |

> Bản OWASP Top 10 mới hơn có thể đã phát hành — luôn đối chiếu phiên bản hiện hành; ánh xạ trên dùng OWASP Top 10:2021 và API Security Top 10:2023 làm chuẩn nền.

---

## D. Nguyên tắc thiết kế bảo mật (xuyên suốt)

| Nguyên tắc | Ý nghĩa | Áp dụng |
|------------|---------|---------|
| **Zero Trust** | Never trust, always verify; xác thực & ủy quyền liên tục theo từng request | #28; mọi call nội bộ/ngoại bộ đều phải verify |
| **Defense in Depth** | Nhiều lớp phòng thủ, không dựa vào một chốt chặn | Kết hợp WAF + authz + validation + monitoring |
| **Principle of Least Privilege** | Cấp quyền tối thiểu đủ dùng, theo scope | #7, #8, #9, #25 |
| **Secure by Design** | Bảo mật từ thiết kế, không vá về sau (OWASP A04) | #1 threat modeling ngay từ đầu |
| **IAM** | Quản lý danh tính & truy cập tập trung, nhất quán | #4–#10 |

---

## E. Bảng tra nhanh: khía cạnh → framework

| Khía cạnh | Framework / Mục chính |
|-----------|------------------------|
| #1 Threat Modeling | STRIDE, OWASP A04 |
| #2–#3 Asset & Attack Surface | STRIDE DFD, OWASP API9 |
| #4–#6 Auth/SSO/Session | OWASP A07; OAuth2/OIDC/SAML best practices |
| #7 Authorization | OWASP A01, API5; RBAC/ABAC |
| #8 Broken Access Control ⚠️ | OWASP A01, API1; IDOR/Mass Assignment |
| #9 Permission Scope | OWASP A01; Least Privilege |
| #10 Multi-Tenant ⚠️ | OWASP A01; tenant isolation (silo/pool) |
| #11 API Security | OWASP API Top 10 toàn bộ |
| #12 Injection | OWASP A03 |
| #13 XSS | OWASP A03 |
| #14 CSRF | SameSite, anti-forgery token |
| #15 File Upload | OWASP A08; content-type/AV scan |
| #16–#18 Data/Encryption/Secret | OWASP A02; KMS/Vault |
| #19–#21 Audit/Event/Monitoring | OWASP A09; SIEM, SOC |
| #22 Rate Limiting | OWASP API4; DoS mitigation |
| #23 Integration | OWASP A10, API10, SSRF (A10/API7) |
| #24 Data Leakage ⚠️ | OWASP API3; field masking |
| #25 Privilege Escalation ⚠️ | OWASP A01; horizontal/vertical |
| #26 Misconfiguration | OWASP A05, API8; CORS/TLS/Header |
| #27 Incident Response | NIST IR lifecycle; token revoke, account lock |
| #28 Zero Trust | Zero Trust Architecture (NIST SP 800-207) |
