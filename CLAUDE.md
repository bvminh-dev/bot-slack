<!-- tieu-nhi:start -->
## Pipeline tài liệu-trước (documentation-first)

Dự án theo quy trình **tài liệu là tài sản chính, code là bước cuối**. Mọi tài liệu nằm trong
`.spec/`. Mỗi yêu cầu/thay đổi = 1 "integration" `i-NNN` (delta, bất biến sau khi approved);
`.spec/main/` là trạng thái hợp nhất hiện hành — **copy `.spec/main/` là clone được tri thức hệ thống**.

**Luật sắt:**
- Mỗi tính năng phải có đủ: `frd.md` · `tech.md` · `security.md` · `test.md` · `plan.md` · `report.md` · `live-spec.md`.
- **KHÔNG code khi còn open question** — `/tn-code` có gate cứng, chặn nếu bất kỳ doc nào chưa `approved` hoặc còn `open_questions > 0`.
- Quy ước đầy đủ (cấu trúc, frontmatter, gate, cascade, live-spec, locators, registry) ở `.spec/integration/CONVENTION.md` — mọi lệnh phải đọc trước khi chạy.

**Pipeline (lệnh từng bước, prefix `tn-`):**

| Bước | Lệnh | Skill | Đầu ra |
|------|------|-------|--------|
| 0 (brownfield) | `/tn-khoi-tao` | `khoi-tao-tai-lieu` | `.spec/main/` as-built + baseline i-000 |
| 1 | `/tn-yeu-cau` | `phan-tich-nghiep-vu` | `frd.md` (hỏi làm rõ trước khi chốt) |
| 2 | `/tn-thiet-ke` | `thiet-ke-he-thong` | `tech.md` → `sad.md` |
| 3 | `/tn-bao-mat` | `bao-mat-he-thong` | `security.md` |
| 4 | `/tn-kiem-thu` | `kiem-thu-phan-mem` | `test.md` (+ bảng E2E Locators, mô tả bằng lời) |
| 5 | `/tn-ke-hoach` | (tổng hợp) | `plan.md` (task + phụ thuộc + tiêu chí Done) |
| 6 | `/tn-code` | (hiện thực) | code + back-prop locator |
| 7 | `/tn-bao-cao` | `chay-kiem-thu` | `report.md` (chạy thật, expected vs actual) |
| 8 | `/tn-review` | `review-code` | review; bug → `bugfix.md` + rule (mục dưới) → sửa sau |

Test case mô tả **bằng lời** (Bước/Dữ liệu vào/Kết quả mong đợi); e2e dùng `data-testid`, **không sinh code Playwright/Cypress**.

## Rules / Bài học kinh nghiệm

> `/tn-review` append vào đây mỗi khi phát hiện bug — 1 dòng rule rút kinh nghiệm để lần sau không lặp lại (kèm `(i-NNN)`).

_(chưa có rule)_
<!-- tieu-nhi:end -->
