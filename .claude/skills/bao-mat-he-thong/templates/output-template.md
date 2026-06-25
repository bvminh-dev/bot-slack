# Template Định Dạng Kết Quả (BẮT BUỘC)

Trình bày kết quả theo **đúng 27 mục dưới đây, đúng thứ tự**. Không bỏ mục nào — mục không phát hiện ghi rõ `Không phát hiện`. Mỗi lỗ hổng gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]` và ghi kèm: **STRIDE/OWASP mapping · tác động khai thác · khuyến nghị khắc phục**.

---

# Asset Inventory
| Tài sản | Loại | Độ nhạy cảm | Nơi lưu | Ai truy cập |
|---------|------|-------------|---------|-------------|
| Payroll Data / Token / Secret... | | | | |

# Threat Model (STRIDE)
| STRIDE | Threat cụ thể | Phần tử/Trust boundary | Tác động | Mitigation | Mức |
|--------|---------------|------------------------|----------|------------|-----|
| S/T/R/I/D/E | | | | | `[MỨC]` |

# Attack Surface
> Web UI / API / Mobile / SSO / Upload / Import / Export / Webhook / Third-Party · điểm phơi nhiễm & `[MỨC]`.

# Authentication Review
- `[MỨC]` ... (login/logout/password policy/MFA/JWT/refresh/remember-me/reset) — *OWASP A07*

# SSO Review
- `[MỨC]` ... (issuer/audience/nonce/state/redirect URI/token validation; OIDC/OAuth2/SAML)

# Session Review
- `[MỨC]` ... (fixation/hijacking/concurrent/timeout/revocation)

# Authorization Review
- `[MỨC]` ... (RBAC/ABAC/scope/delegation/hierarchy) — *OWASP A01/API5*

# Permission Scope Review
| Permission | Scope dự kiến | Scope thực tế | Rủi ro nới quyền | Mức |
|------------|---------------|---------------|------------------|-----|
| View Employee | | | | `[MỨC]` |

# Multi Tenant Security Review
- `[MỨC]` ... (tenant isolation/cross-tenant access/shared cache/storage) ⚠️

# API Security Review
| OWASP API | Endpoint | Vấn đề | Tác động | Mức |
|-----------|----------|--------|----------|-----|
| API1 BOLA / API3 / API5... | | | | `[MỨC]` |

# Injection Risks
- `[MỨC]` ... (SQL/NoSQL/LDAP/Command/Path Traversal/Template) — *OWASP A03*

# XSS Risks
- `[MỨC]` ... (Stored/Reflected/DOM)

# CSRF Risks
- `[MỨC]` ... (anti-forgery token/SameSite cookie)

# File Upload Risks
- `[MỨC]` ... (malware/executable/double extension/large file/zip bomb)

# Data Protection Review
- `[MỨC]` ... (PII/Payroll/National ID: masking, minimization, lưu trữ) — *OWASP A02*

# Encryption Review
- `[MỨC]` ... (at rest/in transit/key management/secret storage)

# Secret Management Review
- `[MỨC]` ... (connection string/API key/JWT secret/OAuth secret/certificate; rò rỉ trong code/log?)

# Audit Review
- `[MỨC]` ... (audit log/security log/login history/permission change history; bất biến & truy vết) — *OWASP A09*

# Security Event Catalog
| Sự kiện | Có ghi log? | Có cảnh báo? | Mức |
|---------|-------------|--------------|-----|
| Login Failed / Password Changed / Permission Changed / Role Changed / User Disabled | | | `[MỨC]` |

# Monitoring Gaps
- `[MỨC]` ... (SIEM/alert/threat detection/anomaly detection)

# Data Leakage Risks ⚠️
- `[MỨC]` ... (API response/export Excel/audit log/search result/error message) — *OWASP API3*

# Privilege Escalation Risks ⚠️
- `[MỨC]` ... (role change/permission change/approval delegation/manager change; horizontal & vertical)

# Security Misconfiguration Risks
- `[MỨC]` ... (CORS/cookie/header/TLS/server config) — *OWASP A05/API8*

# Incident Response Risks
- `[MỨC]` ... (account lock/token revoke/emergency disable/breach recovery)

# Zero Trust Assessment
| Nguyên tắc | Hiện trạng | Khoảng trống | Mức |
|------------|------------|--------------|-----|
| Never Trust / Always Verify / Least Privilege / Continuous Validation | | | `[MỨC]` |

# Open Security Questions
1. ...

# Security Recommendations
- `[Ưu tiên]` ... (theo thứ tự: Broken Access Control → Privilege Escalation → Data Leakage → Auth/Authz Flaw → Tenant Isolation → API Security; kèm quick-win vs long-term)
