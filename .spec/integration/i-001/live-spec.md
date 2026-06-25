# Live-spec — i-001 (review-pr-slack-azure)

## [2026-06-25] /tn-yeu-cau (i-001)
- Skill dùng: phan-tich-nghiep-vu (BABOK, checklist 16 khía cạnh, template 19 mục).
- Việc đã làm: Bootstrap `.spec` (CONVENTION, registry, main/). Phân tích nghiệp vụ yêu cầu Slack bot review PR Azure; hỏi làm rõ 7 điểm qua 2 vòng AskUserQuestion; ghi `frd.md` (approved, open_questions=0); cascade lên main/feature + feature-index.
- Quyết định/giả định:
  - Kết quả review trả về **Slack thread** (không comment Azure PR ở i-001).
  - Tài liệu hệ thống **mặc định trong repo đích** + có **config nguồn bổ sung**.
  - Setup project qua **Web Admin UI**, **đăng nhập bằng Azure PAT**.
  - **Mọi người trong workspace** ra lệnh review được.
  - Skill **auto-select theo loại file**.
  - Xử lý **bất đồng bộ** (ack ngay, trả kết quả sau).
  - GIẢ ĐỊNH chốt sau: chạy skill bằng Claude Agent SDK headless + token Claude theo project (cô lập chi phí); cơ chế mã hoá secret & phân quyền admin → `/tn-bao-mat`.
- Lệch so với plan/spec: Không (greenfield, baseline mới).
- Kết quả test/locator/bug: Chưa có (bước FRD).

## [2026-06-25] /tn-yeu-cau — cập nhật FRD (i-001)
- Bổ sung theo yêu cầu người dùng: (1) project cấu hình thêm **model Claude + effort**; (2) Admin UI **phân quyền theo chủ sở hữu** — mỗi người chỉ thấy/sửa project do chính mình tạo.
- Cập nhật các mục: Tóm tắt, Assumptions (#1,#3,#7), Phân quyền (ownership + tenant isolation thay cho CRITICAL admin trước đó), Business Rule (owner, unique-scope, model/effort), Validation, Logic, Edge case, Câu hỏi mở #2/#8/#9/#10.
- Câu hỏi mở mới (không chặn → thiết kế/bảo mật): danh tính chủ sở hữu; xung đột "ai cũng review được" vs cô lập owner; phạm vi duy nhất tên project; danh sách model/effort + default.
- Cascade lại lên main/feature + feature-index. Trạng thái giữ approved, open_questions=0.
