# Kỹ Thuật Thiết Kế Test Theo ISTQB

Dùng file này để chọn đúng **ISTQB Test Design Technique** cho từng loại test, lấy nền tảng chuẩn cho việc sinh test case và đánh giá coverage. (Tham chiếu ISTQB Foundation/Advanced Level — Test Design Techniques.)

---

## Phân nhóm kỹ thuật (ISTQB)

| Nhóm | Bản chất | Kỹ thuật |
|------|----------|----------|
| **Black-box (Specification-based)** | Dựa trên đặc tả/hành vi, không cần biết code | Equivalence Partitioning, Boundary Value Analysis, Decision Table, State Transition, Use Case, Pairwise/Combinatorial, Cause-Effect Graph |
| **White-box (Structure-based)** | Dựa trên cấu trúc code | Statement Coverage, Branch/Decision Coverage |
| **Experience-based** | Dựa trên kinh nghiệm & trực giác tester | Error Guessing, Exploratory Testing, Checklist-based |
| **Risk-based (quản trị test)** | Ưu tiên theo mức rủi ro × khả năng xảy ra | Risk-Based Testing |

---

## 10 kỹ thuật bắt buộc và cách áp dụng

| # | Kỹ thuật | Nhóm | Dùng cho khía cạnh / Output | Lưu ý bối cảnh ERP/HRM/CRM |
|---|----------|------|-----------------------------|-----------------------------|
| 1 | **Equivalence Partitioning (EP)** | Black-box | Validation, Edge Case → *Equivalence Partitions* | Chia miền hợp lệ/không hợp lệ (vd: lương <0, =0, >0; số ngày phép theo bậc). Mỗi phân vùng tối thiểu 1 case. |
| 2 | **Boundary Value Analysis (BVA)** | Black-box | Validation, Edge Case → *Boundary Values* | Test biên min/max ± 1 (vd: ngày công 0/1/31, hạn nộp đơn, ngưỡng duyệt theo số tiền). |
| 3 | **Decision Table Testing** | Black-box | Business Rule, Permission → *Decision Table* | Tổ hợp điều kiện × hành động cho rule duyệt/tính lương; soi missing rule & missing combination. |
| 4 | **State Transition Testing** | Black-box | Workflow, State → *State Transition Matrix* | Bảng State/Event/Expected; test chuyển hợp lệ, bất hợp lệ, quay lui, nhảy trạng thái (Draft→Approve trực tiếp?). |
| 5 | **Use Case Testing** | Black-box | Workflow, Notification → *Test Scenarios* | Sinh scenario từ main/alternative/exception flow theo vai trò người dùng đầu-cuối. |
| 6 | **Pairwise / Combinatorial Testing** | Black-box | Đa cấu hình → *Test Cases* | Giảm bùng nổ tổ hợp (công ty × phòng ban × chính sách × vai trò) mà vẫn phủ mọi cặp tham số. |
| 7 | **Error Guessing** | Experience | Negative, Edge Case → *Negative Test Cases* | Dựa kinh nghiệm đoán điểm dễ lỗi: null, trùng, Unicode/emoji, double-submit, copy-paste khoảng trắng. |
| 8 | **Experience-Based / Exploratory** | Experience | Toàn bộ → *Khuyến Nghị Kiểm Thử* | Khám phá tự do quanh khu vực rủi ro cao; ghi lại charter & phát hiện ngoài kịch bản. |
| 9 | **Cause-Effect Graph** | Black-box | Business Rule phức tạp → *Decision Table* | Mô hình hóa quan hệ nguyên nhân→kết quả khi nhiều điều kiện liên kết logic AND/OR/NOT. |
| 10 | **Risk-Based Testing** | Risk-based | Bug Prediction, Coverage → *Regression Risks*, *Dự Đoán Bug* | Ưu tiên test theo (mức ảnh hưởng × xác suất); tập trung vào payroll, approval, phân quyền, tích hợp. |

---

## Bổ trợ: kỹ thuật cho coverage & loại test phi chức năng

| Mục tiêu | Kỹ thuật / Tiêu chí ISTQB |
|----------|---------------------------|
| Đánh giá độ phủ logic | Statement Coverage, Branch/Decision Coverage |
| API / Integration | Contract testing, Schema validation, Idempotency check, Negative path (timeout/retry/mất kết nối) |
| Security | Test theo OWASP (kết hợp ISTQB Security Tester): Broken Access Control, Privilege Escalation, Injection, Session/JWT |
| Concurrency | Test thiết kế từ Race Condition scenario (2 actor song song) — kết hợp Error Guessing |

---

## Gợi ý sử dụng

- Mỗi loại đầu ra trong template nên gắn rõ kỹ thuật đã dùng (vd: *Boundary Values — BVA*).
- Với rule nghiệp vụ nhiều điều kiện, ưu tiên **Decision Table** (hoặc **Cause-Effect Graph** khi quan hệ phức tạp) để không sót tổ hợp.
- Với vòng đời chứng từ (đơn từ, phê duyệt), bắt buộc **State Transition Testing** phủ cả chuyển bất hợp lệ.
- Khi tài nguyên test hạn chế, dùng **Risk-Based Testing** để xếp ưu tiên và **Pairwise** để cắt giảm tổ hợp cấu hình.
- Toàn bộ phát hiện cuối cùng quy về **Risk-Based Testing** để gán mức CRITICAL/HIGH/MEDIUM/LOW và đề xuất phạm vi regression.
