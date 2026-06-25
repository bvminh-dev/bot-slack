# Checklist 16 Khía Cạnh Phân Tích Nghiệp Vụ

Chạy qua **đầy đủ 16 khía cạnh** cho mỗi yêu cầu. Với mỗi khía cạnh: *Xác định gì → Kiểm tra gì → Câu hỏi phản biện → Kết quả đầu ra*. Mọi phát hiện gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`.

---

## 1. Phân tích Mục tiêu nghiệp vụ
- **Xác định**: Mục tiêu nghiệp vụ, giá trị mang lại, bài toán đang giải quyết, KPI kỳ vọng.
- **Kiểm tra/Đánh giá**: Tính năng này tồn tại để làm gì? Nếu bỏ đi có sao không? Có cách đơn giản hơn không? Có đang giải quyết đúng vấn đề không?
- **Kết quả**: Business Goal, Business Value, Business KPI, Assumptions.

## 2. Phân tích Luồng nghiệp vụ
- **Phân tích**: Luồng chính, luồng thay thế, luồng ngoại lệ, luồng khôi phục.
- **Tìm**: Missing Flow, Dead End Flow, Circular Flow, Invalid Flow.
- **Câu hỏi phản biện**: Quy trình có bị kẹt không? Có bước nào bỏ qua được không? Có trạng thái nào không thoát được không? Nếu người dùng thao tác sai thì sao?

## 3. Phân tích State Machine
- **Xác định**: Các trạng thái, điều kiện chuyển trạng thái, điều kiện vào, điều kiện thoát.
- **Ví dụ vòng đời**: Nháp → Chờ duyệt → Đã duyệt / Từ chối / Hủy.
- **Kiểm tra**: Thiếu trạng thái nào? Có chuyển trạng thái bất hợp lệ không? Có thể bỏ qua bước nào không? Có thể quay ngược không? Có thể duyệt nhiều lần không?

## 4. Phân tích Business Rule
- **Xác định**: Rule nghiệp vụ hiện hữu, rule ngầm định, rule pháp lý, rule vận hành.
- **Kiểm tra**: Rule nào còn thiếu? Rule nào mâu thuẫn? Rule nào chưa rõ?
- **Ví dụ**: Mỗi nhân viên chỉ có 1 quản lý trực tiếp; Không được duyệt đơn của chính mình; Không được chấm công tương lai.

## 5. Phân tích Validation
- **Kiểm tra**: Bắt buộc nhập, định dạng dữ liệu, khoảng giá trị, validation liên trường, validation nghiệp vụ, duplicate validation.
- **Câu hỏi phản biện**: Dữ liệu nào bắt buộc? Dữ liệu nào không hợp lệ? Có thể nhập trùng không? Có thể nhập sai logic không?

## 6. Phân tích Phân quyền
- **Kiểm tra**: Ai được tạo / xem / sửa / xóa / duyệt / từ chối / export?
- **Luôn kiểm tra rủi ro**: Self Approval, Privilege Escalation, Data Leakage, Segregation of Duties.
- **Ví dụ**: Trưởng phòng có được duyệt đơn của chính mình không? HR có được sửa đơn đã duyệt không?

## 7. Phân tích Cơ cấu tổ chức
- **Xem xét**: Công ty, chi nhánh, phòng ban, nhóm, chức vụ, quản lý.
- **Câu hỏi phản biện**: Nếu đổi phòng ban thì sao? Nếu đổi quản lý thì sao? Nếu nghỉ việc giữa quy trình thì sao? Nếu tái cơ cấu tổ chức thì sao?

## 8. Phân tích Dữ liệu
- **Kiểm tra**: Quan hệ dữ liệu, dữ liệu lịch sử, chủ sở hữu dữ liệu, dữ liệu tham chiếu.
- **Tìm**: Duplicate Data, Orphan Data, Data Corruption, Data Inconsistency.

## 9. Phân tích Component dùng chung
- **Xác định**: Shared Component, Shared Workflow, Shared Permission, Shared Master Data.
- **Đánh giá**: Tính năng nào đang dùng chung? Thay đổi này ảnh hưởng gì? Có phát sinh regression không?
- **Kết quả**: Impact Matrix, Regression Risk.

## 10. Phân tích Ảnh hưởng chéo
- **Đối chiếu với**: Tính năng hiện có, rule hiện có, workflow hiện có.
- **Tìm**: Duplicate Feature, Business Conflict, Domain Conflict.
- **Câu hỏi phản biện**: Có đang làm trùng tính năng không? Có phá vỡ logic cũ không? Có xung đột quy trình không?

## 11. Phân tích Edge case
- **Luôn tạo kịch bản**: Dữ liệu rỗng, dữ liệu sai, dữ liệu trùng, mất mạng, refresh trình duyệt, đổi quyền, đổi quản lý, đổi phòng ban, xóa dữ liệu liên quan.
- **Kết quả**: Edge Case + Kỳ vọng xử lý + Mức độ rủi ro.

## 12. Phân tích Concurrency
- **Kiểm tra**: 2 người cùng sửa, 2 người cùng duyệt, 2 request cùng lúc, 2 workflow cùng lúc.
- **Câu hỏi phản biện**: Có race condition không? Có duplicate không? Có mất dữ liệu không?

## 13. Phân tích Audit
- **Kiểm tra**: Audit Log, Approval History, Change History, Traceability.
- **Câu hỏi phản biện**: Có cần lưu lịch sử không? Có cần truy vết không? Có cần rollback không?

## 14. Phân tích Thông báo
- **Kiểm tra**: Email, In-App Notification, SMS, Push Notification.
- **Câu hỏi phản biện**: Ai nhận thông báo? Khi nào gửi? Nếu gửi thất bại thì sao?

## 15. Phân tích Khả năng mở rộng
- **Đánh giá**: Nhiều công ty, nhiều phòng ban, nhiều cấp duyệt, nhiều quốc gia, nhiều chính sách.
- **Câu hỏi phản biện**: Thiết kế này có dùng được 5 năm nữa không? Có phải sửa lại toàn bộ khi mở rộng không?

## 16. Phân tích Tích hợp
- **Kiểm tra**: API, SSO, Payroll, ERP, HRM, hệ thống ngoài.
- **Câu hỏi phản biện**: Hệ thống nào phụ thuộc? Nếu tích hợp lỗi thì sao? Dữ liệu đồng bộ thế nào?
