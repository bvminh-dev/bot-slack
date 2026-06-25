# Checklist 20 Khía Cạnh Kiểm Thử

Chạy qua **đầy đủ 20 khía cạnh** cho mỗi tính năng. Mỗi khía cạnh: sinh test condition/case, soi bug tiềm ẩn, gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`. Chi tiết kỹ thuật ISTQB xem [istqb-techniques.md](istqb-techniques.md).

---

## 1. Test Analysis
- **Xác định**: Chức năng cần kiểm thử, đối tượng kiểm thử, điều kiện kiểm thử, phạm vi.
- **Sinh**: Test Condition → Test Scenario → Test Case.
- **Đảm bảo**: Không bỏ sót requirement, business rule, validation.

## 2. ISTQB Test Design Techniques (bắt buộc áp dụng)
Equivalence Partitioning · Boundary Value Analysis · Decision Table Testing · State Transition Testing · Use Case Testing · Pairwise Testing · Error Guessing · Experience-Based Testing · Cause-Effect Graph · Risk-Based Testing. → Chi tiết & cách chọn xem [istqb-techniques.md](istqb-techniques.md).

## 3. Business Rule Testing
- **Kiểm tra**: Business Rule, Validation Rule, Workflow Rule, Approval Rule.
- **Tìm**: Rule bị thiếu, rule bị sai, rule mâu thuẫn.

## 4. Validation Testing
- **Kiểm tra**: Required field, length, format, range, duplicate, cross-field validation.
- **Ví dụ**: Ngày bắt đầu > ngày kết thúc; lương âm; email không hợp lệ; mã nhân viên trùng.

## 5. State Transition Testing
- **Sinh đầy đủ**: State / Event / Expected State.
- **Kiểm tra**: Chuyển trạng thái hợp lệ, chuyển bất hợp lệ, quay lui, nhảy trạng thái.
- **Ví dụ**: Draft → Submit; Submit → Approve / Reject; Approve → Cancel.

## 6. Decision Table Testing
- **Sinh**: Conditions / Actions / Expected Results.
- **Tìm**: Missing Rule, Missing Combination.

## 7. Permission Testing
- **Kiểm tra theo từng Role**: Create / View / Edit / Delete / Approve / Reject / Export / Import.
- **Câu hỏi**: User có xem dữ liệu người khác không? Sửa dữ liệu ngoài quyền không? Duyệt chính mình không?

## 8. Workflow Testing
- **Kiểm tra**: Main Flow, Alternative Flow, Exception Flow.
- **Tìm**: Dead End Flow, Missing Flow, Loop Flow.

## 9. Negative Testing
- **Luôn sinh**: Dữ liệu rỗng, sai, trùng, cực lớn, đặc biệt, Unicode; SQL Injection, XSS, HTML Injection.

## 10. Edge Case Testing
- **Luôn kiểm tra**: Giá trị min/max/null/đặc biệt.
- **Ví dụ**: 0, -1, 999999999, khoảng trắng, emoji, tiếng Việt có dấu, tiếng Nhật, tiếng Trung.

## 11. Concurrency Testing
- **Kiểm tra**: 2 người cùng sửa, 2 người cùng duyệt, 2 request cùng lúc.
- **Tìm**: Race Condition, Duplicate Record, Lost Update.

## 12. Data Integrity Testing
- **Kiểm tra**: Duplicate Data, Missing Data, Corrupted Data, Orphan Data.

## 13. API Testing
- **Kiểm tra**: Status Code, Response Schema, Authentication, Authorization, Error Handling, Idempotency.
- **Đánh giá**: API có trả dữ liệu vượt quyền không? Có validate đủ không?

## 14. Security Testing
- **Kiểm tra**: Authentication, Authorization, Session, JWT, Refresh Token, CSRF, XSS, SQL Injection, Broken Access Control, Privilege Escalation.

## 15. Audit Testing
- **Kiểm tra**: Audit Log, History, Tracking.
- **Đảm bảo**: Hành động được ghi nhận, có thể truy vết.

## 16. Notification Testing
- **Kiểm tra kênh**: Email, SMS, Push, In-App.
- **Tình huống**: Thành công, thất bại, retry.

## 17. Integration Testing
- **Kiểm tra**: API ngoài, SSO, Payroll, ERP, HRM.
- **Tình huống**: Timeout, retry, mất kết nối, sai dữ liệu.

## 18. Regression Impact Analysis
- **Đánh giá**: Chức năng bị ảnh hưởng, component dùng chung, shared service, shared workflow.
- **Tìm**: Regression Risk.

## 19. Test Coverage Analysis
- **Đánh giá coverage**: Requirement, Business Rule, State, Decision, Permission, API, Integration, Edge Case.

## 20. Bug Prediction
- **Dự đoán bug có khả năng xuất hiện**: Validation Bug, Permission Bug, Workflow Bug, Concurrency Bug, Data Bug, Integration Bug, Security Bug.
