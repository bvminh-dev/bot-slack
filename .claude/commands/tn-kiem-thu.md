---
description: "Bước 4 (QA/Test Architect): thiết kế test + bảng E2E Locators (mô tả bằng lời), ghi test.md"
argument-hint: "[i-NNN]"
---

Bạn đang chạy **`/tn-kiem-thu`** — bước 4 (Thiết kế kiểm thử) của pipeline tài liệu-trước.

Integration: **$ARGUMENTS**. Nếu rỗng → đọc `.spec/integration/registry.md`, chọn i-NNN gần nhất đã xong `security` nhưng chưa xong `test`; nếu mơ hồ, hỏi người dùng.

## 0. Chuẩn bị
- Lấy ngày: `date +%F` (Bash). Đọc `.spec/integration/CONVENTION.md` và tuân thủ.
- Đọc `<slug>` (feature) từ frontmatter doc i-NNN.

## 1. Gate (CONVENTION mục 4)
- Đọc `.spec/integration/i-NNN/security.md`. Nếu `status != approved` hoặc `open_questions > 0` → **DỪNG**, in lý do. KHÔNG đi tiếp.

## 2. Thiết kế test
- Dùng skill **`kiem-thu-phan-mem`** (gọi qua công cụ Skill) trên `frd.md` + `tech.md` + `security.md` của i-NNN. Trình bày theo **template 19 mục** của skill (giữ đủ mục).
- Test case mô tả **bằng lời** theo định dạng: **Bước · Dữ liệu vào · Kết quả mong đợi**. **KHÔNG sinh code Playwright/Cypress** (CONVENTION mục 7).

## 3. Bổ sung section "E2E Locators"
Thêm vào `test.md` một bảng cho các thao tác cần auto e2e, ưu tiên `data-testid` ổn định:

| Element / Mục đích | data-testid đề xuất | Màn hình / Ngữ cảnh | Ghi chú |
|--------------------|---------------------|---------------------|---------|
| ... | `...` | ... | ... |

## 4. Ghi `test.md` (delta) + cascade
- Ghi `.spec/integration/i-NNN/test.md` + frontmatter `stage: test`. Lỗ hổng spec phát hiện → nếu chặn thì đếm `open_questions`; đặt `status` tương ứng.
- Cascade (MERGE, mục 5): `test.md` → `.spec/main/feature/<slug>/test.md`.
- Append `live-spec.md` ở `i-NNN/` và `.spec/main/`. Cập nhật `registry.md` ô `test`.
- Báo người dùng: trạng thái, bảng E2E Locators đã tạo, bước kế `/tn-ke-hoach i-NNN`.
