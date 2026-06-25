# Template Định Dạng Kết Quả (BẮT BUỘC)

Trình bày kết quả theo **đúng 19 mục dưới đây, đúng thứ tự**. Không bỏ mục nào — mục không áp dụng ghi rõ `Không áp dụng / Không phát hiện` thay vì xóa. Mỗi bug tiềm ẩn / risk gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`; mỗi loại test ghi kèm kỹ thuật ISTQB đã dùng (vd: *BVA*, *Decision Table*).

---

# Phân Tích Requirement
> Phạm vi kiểm thử, đối tượng, điều kiện kiểm thử, giả định (nếu spec thiếu).

# Test Conditions
- ...

# Test Scenarios
- ...

# Test Cases
| ID | Tiền điều kiện | Bước | Dữ liệu | Kết quả mong đợi | Kỹ thuật |
|----|----------------|------|---------|------------------|----------|
| TC-01 | ... | ... | ... | ... | ... |

# Boundary Values
> Áp dụng *Boundary Value Analysis*.

| Trường | Min-1 | Min | Max | Max+1 | Kết quả mong đợi |
|--------|-------|-----|-----|-------|------------------|
| ... | | | | | |

# Equivalence Partitions
> Áp dụng *Equivalence Partitioning*.

| Trường | Phân vùng hợp lệ | Phân vùng không hợp lệ |
|--------|------------------|------------------------|
| ... | | |

# Decision Table
| Rule | Điều kiện 1 | Điều kiện 2 | ... | Hành động / Kết quả |
|------|-------------|-------------|-----|---------------------|
| R1 | | | | |

# State Transition Matrix
| State hiện tại | Event | State kế tiếp | Hợp lệ? |
|----------------|-------|---------------|---------|
| ... | | | |

# Permission Matrix
| Role | Create | View | Edit | Delete | Approve | Reject | Export | Import |
|------|--------|------|------|--------|---------|--------|--------|--------|
| ... | | | | | | | | |

# Negative Test Cases
- `[MỨC]` ... (dữ liệu rỗng/sai/trùng/cực lớn/đặc biệt/Unicode; SQLi/XSS/HTML Injection)

# Edge Cases
- `[MỨC]` ... (min/max/null/đặc biệt: 0, -1, emoji, đa ngôn ngữ...)

# API Test Cases
- `[MỨC]` ... (status code, schema, authn/authz, error handling, idempotency, vượt quyền)

# Security Test Cases
- `[MỨC]` ... (authn/authz, session/JWT/refresh, CSRF, XSS, SQLi, Broken Access Control, Privilege Escalation)

# Concurrency Test Cases
- `[MỨC]` ... (2 actor song song → race condition, duplicate record, lost update)

# Integration Test Cases
- `[MỨC]` ... (API ngoài/SSO/Payroll/ERP/HRM: timeout, retry, mất kết nối, sai dữ liệu)

# Regression Risks
> Chức năng/component dùng chung bị ảnh hưởng.

| Hạng mục bị ảnh hưởng | Lý do | Regression Risk |
|-----------------------|-------|-----------------|
| ... | | `[MỨC]` |

# Missing Test Coverage
- `[MỨC]` ... (Requirement / Business Rule / State / Decision / Permission / API / Integration / Edge Case coverage còn hở)

# Dự Đoán Bug Tiềm Ẩn
- `[MỨC]` ... (Validation / Permission / Workflow / Concurrency / Data / Integration / Security Bug)

# Khuyến Nghị Kiểm Thử
- `[Ưu tiên]` ... (lỗ hổng spec cần làm rõ, thứ tự test ưu tiên theo Risk-Based, phạm vi regression đề xuất)
