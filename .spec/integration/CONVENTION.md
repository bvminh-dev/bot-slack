# CONVENTION — Pipeline tài liệu-trước (.spec)

> "Hợp đồng" dùng chung cho mọi lệnh `/tn-*`. Mọi lệnh PHẢI đọc file này trước khi chạy.
> KHÔNG sửa bằng tay trừ khi cố ý đổi quy ước cho toàn hệ thống.

## 1. Cấu trúc
.spec/
  main/                # trạng thái hợp nhất, hiện hành — copy .spec/main là clone tri thức hệ thống
    feature-index.md · sad.md · security.md · live-spec.md
    feature/<slug>/{frd,tech,security,test,report,live-spec}.md
  integration/         # mỗi thay đổi = 1 thư mục i-NNN (delta, BẤT BIẾN sau approved)
    registry.md · CONVENTION.md (file này)
    i-NNN/{frd,tech,security,test,plan,report,live-spec,bugfix}.md

## 2. Khái niệm
- i-NNN = một thay đổi/yêu cầu; tài liệu trong i-NNN là DELTA, không sửa sau khi approved.
- main/ = trạng thái hợp nhất hiện hành — đọc để biết "hệ thống đang có gì".
- cascade = sau khi ghi delta ở i-NNN thì MERGE lên main/ (mục 5).
- <slug> = kebab-case không dấu, ổn định. Một i-NNN gắn đúng 1 tính năng.

## 3. Frontmatter bắt buộc (frd/tech/security/test/plan/report)
---
integration: i-001
feature: <slug>
stage: frd          # frd|tech|security|test|plan|report
status: draft       # draft | needs-clarification | approved   (baseline cho i-000)
open_questions: 0   # số câu hỏi CHẶN còn lại
updated: YYYY-MM-DD
---

## 4. Gate
Thứ tự: [khoi-tao(0, brownfield)] -> yeu-cau(frd) -> thiet-ke(tech) -> bao-mat(security) -> kiem-thu(test) -> ke-hoach(plan) -> code -> bao-cao(report) -> review.
- Trước mỗi bước, đọc doc của bước NGAY TRƯỚC trong cùng i-NNN.
- Nếu upstream status != approved HOẶC open_questions > 0 -> DỪNG: in câu hỏi/việc thiếu, yêu cầu người dùng giải quyết hoặc chấp nhận giả định tường minh. KHÔNG tự đi tiếp.
- GATE CỨNG /tn-code: chặn nếu BẤT KỲ doc nào trong {frd,tech,security,test,plan} của i-NNN chưa approved hoặc open_questions > 0.

## 5. Cascade = MERGE (không ghi đè mù, không append mù)
1. File main đích chưa có -> tạo từ delta (giữ đúng section & thứ tự template).
2. Đã có -> MERGE: cập nhật section đổi; thêm mục mới; nội dung bị thay thế thì sửa và ghi chú "> [i-NNN] thay thế: ..." nếu quan trọng.
3. Giữ nguyên bộ section & thứ tự template skill tương ứng.
4. Mục/hàng quan trọng gắn dấu vết nguồn "(i-NNN)".
5. i-NNN BẤT BIẾN — chỉ sửa bản hợp nhất ở main.
Bản đồ:
- frd -> main/feature/<slug>/frd.md + cập nhật main/feature-index.md
- tech -> main/feature/<slug>/tech.md + main/sad.md
- security -> main/feature/<slug>/security.md + main/security.md
- test -> main/feature/<slug>/test.md
- report -> main/feature/<slug>/report.md
- live-spec -> main/feature/<slug>/live-spec.md + main/live-spec.md (rút gọn)
- plan -> KHÔNG cascade (chỉ ở i-NNN)

## 6. live-spec.md — nhật ký as-built (append xuống cuối)
## [YYYY-MM-DD] /tn-<lệnh> (i-NNN)
- Skill dùng: ...
- Việc đã làm: ...
- Quyết định/giả định: ...
- Lệch so với plan/spec: ...
- Kết quả test/locator/bug: ...

## 7. E2E Locators & test mô tả-bằng-lời
- test.md có section "E2E Locators": (Element/Mục đích -> data-testid đề xuất -> ghi chú).
- Ưu tiên data-testid ổn định; tránh selector theo text/vị trí.
- Test case mô tả bằng lời: Bước / Dữ liệu vào / Kết quả mong đợi. KHÔNG sinh code Playwright/Cypress.
- Back-prop: /tn-code tạo/đổi locator khác đề xuất -> cập nhật ngược test.md (+ cascade).

## 8. Registry & đánh số
Bảng registry.md: | i-NNN | tính năng | loại | frd | tech | security | test | plan | code | report | review | ngày |
- i-NNN tăng dần, zero-pad 3 số. i-000 = baseline brownfield (nếu có). i kế = max + 1.
- Mỗi lệnh cập nhật ô stage tương ứng (vd: draft/approved/done).

## 9. Mức rủi ro
CRITICAL | HIGH | MEDIUM | LOW (theo thang từng skill). Mục không phát hiện -> ghi "Không phát hiện" (giữ section).
