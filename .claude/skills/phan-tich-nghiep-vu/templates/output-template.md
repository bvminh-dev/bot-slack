# Template Định Dạng Kết Quả (BẮT BUỘC)

Trình bày kết quả phân tích theo **đúng 19 mục dưới đây, đúng thứ tự**. Không bỏ mục nào — mục không có phát hiện ghi rõ `Không phát hiện` thay vì xóa. Mỗi phát hiện gắn nhãn mức rủi ro `[CRITICAL|HIGH|MEDIUM|LOW]`; khi có thể, ghi kèm Technique BABOK đã dùng (ví dụ: _Business Rules Analysis_).

---

# Tóm Tắt Tính Năng

> Mô tả ngắn gọn tính năng/yêu cầu đang phân tích và phạm vi.

# Mục Tiêu Nghiệp Vụ

> Business Goal · Business Value · KPI kỳ vọng · Assumptions (giả định đang dựa vào).

# Luồng Chính

> Các bước của happy path.

# Luồng Thay Thế

> Các nhánh thay thế hợp lệ.

# Luồng Ngoại Lệ

> Các nhánh lỗi/ngoại lệ và cách xử lý mong đợi.

# Logic Còn Thiếu

- `[MỨC]` ...

# Business Rule Còn Thiếu

- `[MỨC]` ...

# Validation Còn Thiếu

- `[MỨC]` ...

# Phân Quyền Còn Thiếu

- `[MỨC]` ... (chú ý Self-Approval, Privilege Escalation, Data Leakage, SoD)

# Trạng Thái Còn Thiếu

- `[MỨC]` ... (trạng thái/chuyển trạng thái thiếu hoặc bất hợp lệ)

# Thông Báo Còn Thiếu

- `[MỨC]` ... (ai nhận / khi nào / kênh / xử lý gửi thất bại)

# Audit Còn Thiếu

- `[MỨC]` ... (log, approval/change history, traceability, rollback)

# Edge Cases

| Edge Case | Kỳ vọng xử lý | Mức rủi ro |
| --------- | ------------- | ---------- |
| ...       | ...           | `[MỨC]`    |

# Ảnh Hưởng Tính Năng Khác

- `[MỨC]` ... (duplicate feature, business/domain conflict)

# Ảnh Hưởng Component Dùng Chung

> Impact Matrix + Regression Risk cho shared component/workflow/permission/master data.

| Component dùng chung | Tính năng bị ảnh hưởng | Regression Risk |
| -------------------- | ---------------------- | --------------- |
| ...                  | ...                    | `[MỨC]`         |

# Rủi Ro Dữ Liệu

- `[MỨC]` ... (duplicate, orphan, corruption, inconsistency)

# Rủi Ro Bảo Mật

- `[MỨC]` ...

# Rủi Ro Đồng Thời

- `[MỨC]` ... (race condition, double-submit, lost update)

# Rủi Ro Mở Rộng

- `[MỨC]` ... (multi-company/branch/level/country/policy)

# Các Câu Hỏi Cần Làm Rõ

1. ...
2. ...

# Đề Xuất Cải Tiến

- `[Ưu tiên]` ...
