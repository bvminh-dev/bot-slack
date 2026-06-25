---
description: "Bước 8 (Review): review-code chuyên sâu; nếu có bug → bugfix.md + rule vào CLAUDE.md → mới sửa"
argument-hint: "[i-NNN]"
---

Bạn đang chạy **`/tn-review`** — bước 8 (Review) của pipeline tài liệu-trước.

Integration: **$ARGUMENTS**. Nếu rỗng → đọc `.spec/integration/registry.md`, chọn i-NNN gần nhất đã `report` nhưng chưa `review`; nếu mơ hồ, hỏi người dùng.

## 0. Chuẩn bị
- Lấy ngày: `date +%F` (Bash). Đọc `.spec/integration/CONVENTION.md` và tuân thủ.
- Đọc `<slug>` (feature) từ frontmatter doc i-NNN. Xác định diff của thay đổi (vd `git diff`, `git diff main...HEAD`).
- (Tùy chọn) chạy built-in `/code-review` trước để bắt bug correctness + cleanup, rồi bổ sung lớp enterprise dưới đây.

## 1. Review
- Dùng skill **`review-code`** (gọi qua công cụ Skill) trên diff/code của i-NNN. Trình bày theo **template 29 mục** của skill; mỗi phát hiện gắn `[MỨC]` + `path:line` + tác động + cách sửa.
- Kiểm tra back-prop locator (bước `/tn-code` đã cập nhật `test.md` nếu locator đổi chưa).

## 2. Nếu phát hiện bug → theo ĐÚNG thứ tự (tài liệu trước, sửa sau)
1. **Ghi `.spec/integration/i-NNN/bugfix.md`** cho mỗi bug: triệu chứng · **nguyên nhân gốc (root cause)** · cách sửa đề xuất · cách phòng ngừa tái diễn. Gắn `[MỨC]` + `path:line`.
2. **Append `live-spec.md`** (i-NNN/ và .spec/main/): bug tìm thấy + quyết định sửa.
3. **Thêm rule vào `CLAUDE.md`** mục `## Rules / Bài học kinh nghiệm`: 1 dòng rule cô đọng rút từ bug để **lần sau không lặp lại** (vd: "Luôn kiểm tra X khi làm Y vì từng gây bug Z (i-NNN)"). Append, không xóa rule cũ.
4. **Sau cùng mới sửa code** theo bugfix.md. Sửa xong → chạy lại `/tn-bao-cao i-NNN` để cập nhật `report.md`.

## 3. Ghi nhận
- Cập nhật `registry.md` ô `review` = `done` (hoặc `blocked` nếu còn bug CRITICAL/HIGH chưa sửa). Append `live-spec.md`.
- Báo người dùng: số phát hiện theo mức, bug đã sửa, rule đã thêm vào CLAUDE.md, và trạng thái cuối của i-NNN.
