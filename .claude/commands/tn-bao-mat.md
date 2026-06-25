---
description: "Bước 3 (Security Architect): threat model + đánh giá bảo mật, ghi security.md, cascade"
argument-hint: "[i-NNN]"
---

Bạn đang chạy **`/tn-bao-mat`** — bước 3 (Bảo mật hệ thống) của pipeline tài liệu-trước.

Integration: **$ARGUMENTS**. Nếu rỗng → đọc `.spec/integration/registry.md`, chọn i-NNN gần nhất đã xong `tech` nhưng chưa xong `security`; nếu mơ hồ, hỏi người dùng.

## 0. Chuẩn bị
- Lấy ngày: `date +%F` (Bash). Đọc `.spec/integration/CONVENTION.md` và tuân thủ.
- Đọc `<slug>` (feature) từ frontmatter doc i-NNN.

## 1. Gate (CONVENTION mục 4)
- Đọc `.spec/integration/i-NNN/tech.md`. Nếu `status != approved` hoặc `open_questions > 0` → **DỪNG**, in lý do. KHÔNG đi tiếp.

## 2. Đánh giá bảo mật
- Đọc `.spec/main/security.md` + `.spec/main/feature/<slug>/security.md` (nếu có) để biết hiện trạng bảo mật.
- Dùng skill **`bao-mat-he-thong`** (gọi qua công cụ Skill) trên thiết kế trong `frd.md`/`tech.md`. Trình bày theo **template 27 mục** của skill (giữ đủ mục; mục không phát hiện ghi "Không phát hiện"). Mỗi lỗ hổng kèm STRIDE/OWASP + tác động + mitigation.

## 3. Ghi `security.md` (delta)
- Ghi `.spec/integration/i-NNN/security.md` + frontmatter `stage: security`. Open Security Questions → đếm `open_questions`; > 0 → `needs-clarification`, ngược lại `approved`.

## 4. Cascade + ghi nhận
- Cascade (MERGE, mục 5): `security.md` → `.spec/main/feature/<slug>/security.md` **và** `.spec/main/security.md`.
- Append `live-spec.md` ở `i-NNN/` và `.spec/main/`. Cập nhật `registry.md` ô `security`.
- Báo người dùng: trạng thái, open question (nếu có), bước kế `/tn-kiem-thu i-NNN`.
