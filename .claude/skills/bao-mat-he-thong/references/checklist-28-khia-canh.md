# Checklist 28 Khía Cạnh Đánh Giá Bảo Mật

Chạy qua **đầy đủ 28 khía cạnh** cho mỗi hệ thống/tính năng/API. Mỗi khía cạnh: soi lỗ hổng theo góc nhìn attacker, gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`, nêu tác động + khuyến nghị khắc phục. Chi tiết STRIDE/OWASP xem [stride-owasp.md](stride-owasp.md).

> ⚠️ **4 mục BẮT BUỘC PHÂN TÍCH** (không được bỏ qua): #8 Broken Access Control, #10 Multi-Tenant Security, #24 Data Leakage, #25 Privilege Escalation.

---

## 1. Threat Modeling (STRIDE)
- **Phân tích**: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege.
- **Output**: Threat Model, Attack Surface, Risk Assessment.

## 2. Asset Identification
- **Xác định tài sản**: User Data, Employee Data, Payroll Data, Permission Data, SSO Data, Audit Data, Access Token, Refresh Token, Secret, API Key.
- **Output**: Asset Inventory.

## 3. Attack Surface Analysis
- **Xác định bề mặt**: Web UI, API, Mobile, SSO, File Upload, Import Excel, Export Data, Webhook, Third-Party Integration.
- **Output**: Attack Surface Map.

## 4. Authentication Review
- **Kiểm tra**: Login, Logout, Password Policy, MFA, SSO, Session, JWT, Refresh Token, Remember Me, Password Reset.
- **Output**: Authentication Risks.

## 5. SSO Security Review
- **Giao thức**: OIDC, OAuth2, SAML, Microsoft Entra ID, Google Login.
- **Kiểm tra**: Issuer Validation, Audience Validation, Nonce, State, Redirect URI, Token Validation.
- **Output**: SSO Risks.

## 6. Session Management Review
- **Kiểm tra**: Session Fixation, Session Hijacking, Concurrent Session, Session Timeout, Session Revocation.
- **Output**: Session Risks.

## 7. Authorization Review
- **Kiểm tra**: RBAC, ABAC, Permission, Scope, Delegation, Hierarchy.
- **Output**: Authorization Risks.

## 8. Broken Access Control Review ⚠️ BẮT BUỘC
- **Kiểm tra**: Horizontal & Vertical Privilege Escalation, Insecure Direct Object Reference (IDOR), Mass Assignment, Forced Browsing.
- **Output**: Access Control Risks.

## 9. Permission Scope Review
- **Phạm vi**: Company, Branch, Department, Team, Employee.
- **Câu hỏi**: User được xem dữ liệu tới đâu? Scope có bị nới rộng ngoài ý định không?
- **Output**: Permission Scope Risks.

## 10. Multi-Tenant Security Review ⚠️ BẮT BUỘC
- **Kiểm tra**: Tenant Isolation, Cross-Tenant Access, Shared Resource, Shared Cache, Shared Storage.
- **Output**: Tenant Security Risks.

## 11. API Security Review (theo OWASP API Security)
- **Kiểm tra**: Broken Object Level Authorization (BOLA), Broken Authentication, Excessive Data Exposure, Mass Assignment, Rate Limiting, Function Level Authorization.
- **Output**: API Security Risks.

## 12. Input Validation Review
- **Kiểm tra injection**: SQL, NoSQL, LDAP, Command, Path Traversal, Template Injection.
- **Output**: Injection Risks.

## 13. XSS Review
- **Kiểm tra**: Stored XSS, Reflected XSS, DOM XSS.
- **Output**: XSS Risks.

## 14. CSRF Review
- **Kiểm tra**: CSRF Protection, Anti-Forgery Token, SameSite Cookie.
- **Output**: CSRF Risks.

## 15. File Upload Security Review
- **Kiểm tra**: Malware Upload, Executable Upload, Double Extension, Large File Attack, Zip Bomb.
- **Output**: Upload Risks.

## 16. Data Protection Review
- **Dữ liệu nhạy cảm**: PII, Payroll, National ID, Personal Information.
- **Output**: Data Protection Risks.

## 17. Encryption Review
- **Kiểm tra**: Encryption at Rest, Encryption in Transit, Key Management, Secret Storage.
- **Output**: Encryption Risks.

## 18. Secret Management Review
- **Kiểm tra**: Connection String, API Key, JWT Secret, OAuth Secret, Certificate.
- **Output**: Secret Management Risks.

## 19. Audit & Non-Repudiation Review
- **Kiểm tra**: Audit Log, Security Log, Login History, Permission Change History.
- **Output**: Audit Risks.

## 20. Security Event Review
- **Xác định sự kiện**: Login Success, Login Failed, Password Changed, Permission Changed, Role Changed, User Disabled.
- **Output**: Security Event Catalog.

## 21. Security Monitoring Review
- **Kiểm tra**: SIEM, Alert, Threat Detection, Anomaly Detection.
- **Output**: Monitoring Gaps.

## 22. Rate Limiting Review
- **Endpoint nhạy cảm**: Login, API, Export, Import, Password Reset.
- **Output**: DoS Risks.

## 23. Integration Security Review
- **Hệ ngoài**: Payroll, ERP, AD, SSO, Webhook, Third-Party API.
- **Output**: Integration Risks.

## 24. Data Leakage Review ⚠️ BẮT BUỘC
- **Kiểm tra điểm rò rỉ**: API Response, Export Excel, Audit Log, Search Result, Error Message.
- **Output**: Data Leakage Risks.

## 25. Privilege Escalation Review ⚠️ BẮT BUỘC
- **Kiểm tra**: Role Change, Permission Change, Approval Delegation, Manager Change.
- **Output**: Privilege Escalation Risks.

## 26. Security Misconfiguration Review (theo OWASP)
- **Kiểm tra**: CORS, Cookie, Header, TLS, Server Config.
- **Output**: Misconfiguration Risks.

## 27. Incident Response Review
- **Đánh giá năng lực ứng phó**: Account Lock, Token Revoke, Emergency Disable, Breach Recovery.
- **Output**: Incident Response Risks.

## 28. Zero Trust Review
- **Đánh giá nguyên tắc**: Never Trust, Always Verify, Least Privilege, Continuous Validation.
- **Output**: Zero Trust Assessment.
