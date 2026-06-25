---
description: "Bước 5 (Plan): tổng hợp frd/tech/security/test thành plan.md (task + phụ thuộc + tiêu chí Done)"
argument-hint: "[i-NNN]"
---

Bạn đang chạy **`/tn-ke-hoach`** — bước 5 (Lập kế hoạch) của pipeline tài liệu-trước.

Integration: **$ARGUMENTS**. Nếu rỗng → đọc `.spec/integration/registry.md`, chọn i-NNN gần nhất đã xong `test` nhưng chưa có `plan`; nếu mơ hồ, hỏi người dùng.

## 0. Chuẩn bị
- Lấy ngày: `date +%F` (Bash). Đọc `.spec/integration/CONVENTION.md` và tuân thủ.
- Đọc `<slug>` (feature) từ frontmatter doc i-NNN.

## 1. Gate (CONVENTION mục 4)
- Đọc cả 4 doc của i-NNN: `frd.md`, `tech.md`, `security.md`, `test.md`. Nếu **bất kỳ** doc nào `status != approved` hoặc `open_questions > 0` → **DỪNG**, liệt kê doc còn vướng + open question. KHÔNG lập plan.

## 2. Lập plan
Tổng hợp 4 doc → `.spec/integration/i-NNN/plan.md` (frontmatter `stage: plan`), gồm:
- **Tổng quan & phạm vi** — bám frd.md.
- **Danh sách task** — mỗi task có **ID** (T1, T2...), mô tả, **input/output**, file/khu vực code dự kiến, và **tham chiếu ngược** (Requirement/Rule trong frd, ADR/section trong tech, biện pháp trong security, Case ID trong test).

  | Task | Mô tả | Phụ thuộc | Tham chiếu (frd/tech/security/test) | Tiêu chí Done |
  |------|-------|-----------|--------------------------------------|----------------|
  | T1 | ... | — | ... | ... |

- **Đồ thị phụ thuộc** — nêu rõ task nào chặn task nào (thứ tự thực thi an toàn).
- **Tiêu chí Done tổng** — checklist nghiệm thu cho cả thay đổi (gồm: mọi Security mitigation đã xử lý, mọi Test Case có cách kiểm chứng, không còn open question chặn).
- **Rủi ro & giả định** — kéo từ các doc.

## 3. Ghi nhận
- Đặt `status: approved, open_questions: 0` nếu plan đã đủ rõ để code; nếu còn vướng → `needs-clarification` + nêu rõ.
- `plan.md` **không cascade** (chỉ ở i-NNN). Append `live-spec.md` ở `i-NNN/` và `.spec/main/`. Cập nhật `registry.md` ô `plan`.
- Báo người dùng: số task, đường găng phụ thuộc, và bước kế `/tn-code i-NNN` (nhắc: gate cứng — phải hết open question).
