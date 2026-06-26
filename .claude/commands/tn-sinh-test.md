---
description: "Bước 4b (Test Pyramid): phân tầng test.md thành Unit/Functional/E2E test case + ma trận truy vết"
argument-hint: "[i-NNN]"
---

Bạn đang chạy **`/tn-sinh-test`** — bước 4b (Sinh & phân tầng test case) của pipeline tài liệu-trước.

Integration: **$ARGUMENTS**. Nếu rỗng → đọc `.spec/integration/registry.md`, chọn i-NNN gần nhất đã xong `test` nhưng chưa phân tầng; nếu mơ hồ, hỏi người dùng.

## 0. Chuẩn bị
- Lấy ngày: `date +%F` (Bash). Đọc `.spec/integration/CONVENTION.md` và tuân thủ.
- Đọc `<slug>` (feature) từ frontmatter doc i-NNN.

## 1. Gate (CONVENTION mục 4)
- Đọc `.spec/integration/i-NNN/test.md`. Nếu `status != approved` hoặc `open_questions > 0` → **DỪNG**, in lý do. KHÔNG đi tiếp.

## 2. Phân tầng test case
- Dùng skill **`sinh-test-cases`** (gọi qua công cụ Skill) trên `test.md` + `frd.md`/`tech.md`/`security.md` của i-NNN.
- Trình bày theo template của skill: **Tổng quan kim tự tháp** + 3 bảng **Unit / Functional / E2E** + **Ma trận truy vết** + Khoảng trống.
- Mỗi case mô tả **bằng lời** (SUT/Bước · Dữ liệu · Mong đợi · Kỹ thuật) + cột **Map test.md** về TC gốc. **KHÔNG sinh code Playwright/Cypress**; E2E chỉ tham chiếu `data-testid` từ section *E2E Locators*.

## 3. Ghi vào `test.md` (cùng stage `test`) + cascade
- Append vào `.spec/integration/i-NNN/test.md` các section: `# Phân Tầng Test Case (Test Pyramid)`, `# Tổng Quan Kim Tự Tháp`, `# 1. Unit Test Cases`, `# 2. Functional Test Cases`, `# 3. E2E Test Cases`, `# Ma Trận Truy Vết (Traceability)`, `# Khoảng Trống & Khuyến Nghị Đặt Tầng`.
- Giữ nguyên `stage: test`. Nếu phát hiện yêu cầu chưa phủ được tầng nào (CRITICAL) → tăng `open_questions` + đặt `status: needs-clarification`.
- Cascade (MERGE, mục 5): `test.md` → `.spec/main/feature/<slug>/test.md`.
- Append `live-spec.md` ở `i-NNN/` và `.spec/main/`. Cập nhật `registry.md` ô `test` (ghi chú "phân tầng xong").
- Báo người dùng: số case mỗi tầng, hình dạng kim tự tháp, khoảng trống, bước kế `/tn-ke-hoach i-NNN`.
