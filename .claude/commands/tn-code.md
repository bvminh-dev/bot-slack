---
description: "Bước 6 (Code): hiện thực theo plan.md — GATE CỨNG chặn nếu còn open question; back-prop locator"
argument-hint: "[i-NNN]"
---

Bạn đang chạy **`/tn-code`** — bước 6 (Hiện thực) của pipeline tài liệu-trước. Đây là bước **gần cuối**; tài liệu phải clear trước khi code.

Integration: **$ARGUMENTS**. Nếu rỗng → đọc `.spec/integration/registry.md`, chọn i-NNN gần nhất đã xong `plan` nhưng chưa `code`; nếu mơ hồ, hỏi người dùng.

## 0. Chuẩn bị
- Lấy ngày: `date +%F` (Bash). Đọc `.spec/integration/CONVENTION.md` và tuân thủ.
- Đọc `<slug>` (feature) từ frontmatter doc i-NNN.

## 1. GATE CỨNG (CONVENTION mục 4) — KHÔNG được bỏ qua
- Đọc cả 5 doc của i-NNN: `frd.md`, `tech.md`, `security.md`, `test.md`, `plan.md`.
- Nếu **bất kỳ** doc nào `status != approved` HOẶC `open_questions > 0` → **DỪNG NGAY**. In rõ doc nào còn vướng + danh sách open question. **Tuyệt đối KHÔNG viết/sửa code.** Hướng dẫn người dùng quay lại bước tương ứng để làm rõ.

## 2. Code theo plan
- Hiện thực đúng `plan.md`, theo **thứ tự phụ thuộc** task; bám Requirement/Rule (frd), thiết kế/ADR (tech), mitigation (security).
- UI: dùng **đúng `data-testid`** trong bảng "E2E Locators" của `test.md`.
- Viết code khớp văn phong/idiom của codebase hiện có. Không tự ý mở rộng phạm vi ngoài plan.

## 3. Back-propagation locator (CONVENTION mục 7)
- Nếu khi code phát sinh/đổi `data-testid` khác đề xuất trong `test.md` → **cập nhật ngược** bảng E2E Locators trong `.spec/integration/i-NNN/test.md` rồi **cascade** sang `.spec/main/feature/<slug>/test.md`.

## 4. Ghi nhận
- Append `live-spec.md` (i-NNN/ và .spec/main/): task đã làm (theo ID), file/khu vực đã đổi, kết quả chạy/biên dịch nhanh nếu có, locator phát sinh, lệch so với plan (nếu có).
- Cập nhật `registry.md` ô `code` = `done` (hoặc `partial` nếu chưa xong hết task — nêu task còn lại).
- **KHÔNG** chạy skill review ở bước này. Báo người dùng bước kế `/tn-bao-cao i-NNN` để chạy test + report.
