---
description: "Bước 7 (Run test + Report): chạy unit/functional/e2e, so expected vs actual, ghi report.md"
argument-hint: "[i-NNN]"
---

Bạn đang chạy **`/tn-bao-cao`** — bước 7 (Chạy test + Báo cáo) của pipeline tài liệu-trước.

Integration: **$ARGUMENTS**. Nếu rỗng → đọc `.spec/integration/registry.md`, chọn i-NNN gần nhất đã `code` nhưng chưa `report`; nếu mơ hồ, hỏi người dùng.

## 0. Chuẩn bị
- Lấy ngày: `date +%F` (Bash). Đọc `.spec/integration/CONVENTION.md` và tuân thủ.
- Đọc `<slug>` (feature) từ frontmatter doc i-NNN.

## 1. Gate
- Kiểm tra `registry.md` ô `code` của i-NNN là `done`/`partial`. Nếu chưa code → **DỪNG**, nhắc chạy `/tn-code i-NNN` trước.

## 2. Chạy test + đánh giá
- Dùng skill **`chay-kiem-thu`** (gọi qua công cụ Skill). Theo đúng quy trình:
  1) phát hiện test runner của dự án (package.json/Makefile/pytest...) và chạy **unit + functional**;
  2) thực thi **e2e** theo các case mô tả-bằng-lời trong `test.md`, định vị bằng `data-testid` (qua built-in `/run`·`/verify` hoặc đánh giá thủ công) — **không sinh code Playwright**;
  3) so sánh **expected vs actual**, gắn defect theo mức rủi ro.
- **Trung thực:** chưa chạy được → đánh `BLOCKED` + lý do, KHÔNG báo `PASS` giả.

## 3. Ghi `report.md` + cascade
- Ghi `.spec/integration/i-NNN/report.md` theo `templates/report-template.md` của skill `chay-kiem-thu` (frontmatter `stage: report`).
- Nếu phát hiện locator thực tế khác `test.md` → ghi mục back-prop và **cập nhật ngược** `test.md` (+ cascade) như CONVENTION mục 7.
- Cascade (MERGE, mục 5): `report.md` → `.spec/main/feature/<slug>/report.md`.
- Append `live-spec.md` (i-NNN/ và .spec/main/): số PASS/FAIL/BLOCKED, defect chính. Cập nhật `registry.md` ô `report`.
- Báo người dùng: tóm tắt PASS/FAIL/BLOCKED, defect mức cao, và bước kế `/tn-review i-NNN`.
