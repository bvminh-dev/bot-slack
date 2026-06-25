---
description: "Bước 2 (Solution Architect): thiết kế kiến trúc, ghi tech.md, cascade lên sad.md + feature/"
argument-hint: "[i-NNN]"
---

Bạn đang chạy **`/tn-thiet-ke`** — bước 2 (Thiết kế hệ thống) của pipeline tài liệu-trước.

Integration: **$ARGUMENTS**. Nếu rỗng → đọc `.spec/integration/registry.md`, chọn i-NNN gần nhất đã xong `frd` nhưng chưa xong `tech`; nếu mơ hồ, hỏi người dùng.

## 0. Chuẩn bị
- Lấy ngày: `date +%F` (Bash). Đọc `.spec/integration/CONVENTION.md` và tuân thủ.
- Đọc `<slug>` (feature) từ frontmatter của doc i-NNN.

## 1. Gate (CONVENTION mục 4)
- Đọc `.spec/integration/i-NNN/frd.md`. Nếu `status != approved` hoặc `open_questions > 0` → **DỪNG**, in lý do + việc còn thiếu. KHÔNG đi tiếp.

## 2. Thiết kế
- Đọc `.spec/main/sad.md` + `.spec/main/feature/<slug>/tech.md` (nếu có) để biết kiến trúc hiện hành.
- Dùng skill **`thiet-ke-he-thong`** (gọi qua công cụ Skill) cho yêu cầu trong `frd.md`. Trình bày theo **template 28 mục** của skill (giữ đủ mục; mục không áp dụng ghi "Không áp dụng / Không phát hiện"). Mọi quyết định kiến trúc ghi dạng ADR.

## 3. Ghi `tech.md` (delta)
- Ghi `.spec/integration/i-NNN/tech.md` + frontmatter `stage: tech`. Open question kiến trúc (Open Questions) → đếm vào `open_questions`; nếu > 0 đặt `status: needs-clarification`, ngược lại `approved`.

## 4. Cascade + ghi nhận
- Cascade (MERGE, CONVENTION mục 5): `tech.md` → `.spec/main/feature/<slug>/tech.md` **và** `.spec/main/sad.md`.
- Append `live-spec.md` ở `i-NNN/` và `.spec/main/` (mục 6). Cập nhật `registry.md` ô `tech`.
- Báo người dùng: trạng thái, open question (nếu có), bước kế `/tn-bao-mat i-NNN`.
