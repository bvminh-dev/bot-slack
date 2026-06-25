---
description: "Bước 0 (dự án ĐÃ có code): quét codebase, sinh tài liệu .spec/main as-built + scaffold + baseline i-000"
argument-hint: "[phạm vi tùy chọn, vd: src/hr]"
---

Bạn đang chạy **`/tn-khoi-tao`** — bước 0 của pipeline tài liệu-trước, **chỉ dùng cho dự án ĐÃ CÓ CODE sẵn**.

Phạm vi quét (tùy chọn): `$ARGUMENTS` — nếu rỗng thì quét toàn repo.

## 0. Kiểm tra điều kiện
- Lấy ngày hiện tại: chạy `date +%F` (Bash).
- Nếu repo **không có code** (chỉ có `.claude/`) → DỪNG, báo người dùng: "Dự án trống, không cần `/tn-khoi-tao`; hãy bắt đầu bằng `/tn-yeu-cau`."

## 1. Bootstrap cây `.spec/` (nếu thiếu)
Tạo các thư mục `.spec/main/feature/`, `.spec/integration/`. Nếu **`.spec/integration/CONVENTION.md` chưa tồn tại**, tạo nó với CHÍNH XÁC nội dung trong khối "NỘI DUNG CONVENTION.md" ở cuối lệnh này. Nếu **`.spec/integration/registry.md` chưa tồn tại**, tạo với khối "NỘI DUNG registry.md khởi tạo".

## 2. Gọi skill & sinh baseline
- Đọc `.spec/integration/CONVENTION.md` và tuân thủ.
- Dùng skill **`khoi-tao-tai-lieu`** (gọi qua công cụ Skill). Theo đúng quy trình của skill:
  quét stack/module/route/schema/IAM/tích hợp → suy ra danh sách tính năng (mỗi tính năng 1 slug
  kebab-case không dấu) → sinh tài liệu **as-built** vào `.spec/main/feature/<slug>/{frd,tech,security,test,report}.md`
  theo `templates/baseline-template.md` của skill. Mọi phát biểu quan trọng gắn `path`.
- Tổng hợp cấp hệ thống: `.spec/main/feature-index.md`, `.spec/main/sad.md`, `.spec/main/security.md`.
- Nếu repo có test sẵn, có thể tái dùng skill `chay-kiem-thu` để ghi baseline `report.md`; nếu không, ghi "Chưa chạy — baseline tài liệu".

## 3. Đánh dấu baseline i-000
- Thêm dòng `i-000 | (baseline brownfield) | baseline | ... | <ngày>` vào `.spec/integration/registry.md`.
- Append vào `.spec/main/live-spec.md` một entry theo CONVENTION mục 6: skill dùng, số tính năng phát hiện, file đã tạo, Open Questions cần xác nhận.

## 4. Báo cáo cho người dùng
In tóm tắt: số tính năng phát hiện + slug, danh sách file `.spec/` đã tạo, và **Open Questions** (chỗ chưa chắc trong code) cần người dùng xác nhận. Nhắc: từ đây mọi thay đổi mới đi qua `/tn-yeu-cau` và cascade lên baseline này.

---

### NỘI DUNG CONVENTION.md (ghi nguyên văn vào `.spec/integration/CONVENTION.md`)

```markdown
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
```

### NỘI DUNG registry.md khởi tạo (nếu chưa có)

```markdown
# Registry — Sổ đăng ký thay đổi (.spec/integration)

| i-NNN | Tính năng (slug) | Loại | frd | tech | security | test | plan | code | report | review | Ngày |
|-------|------------------|------|-----|------|----------|------|------|------|--------|--------|------|
```
