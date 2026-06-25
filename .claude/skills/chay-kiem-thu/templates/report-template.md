# Template Định Dạng `report.md` (BẮT BUỘC)

Trình bày theo **đúng các mục dưới đây, đúng thứ tự**. Không bỏ mục — mục không áp dụng ghi
`Không áp dụng / Chưa chạy được`. Mỗi defect gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`.

Frontmatter bắt buộc (theo CONVENTION mục 3, `stage: report`):

```yaml
---
integration: i-NNN
feature: <ten-tinh-nang>
stage: report
status: draft
open_questions: 0
updated: YYYY-MM-DD
---
```

---

# Tóm Tắt Lần Chạy
> Phạm vi test, ngày chạy, tổng số case, số PASS / FAIL / BLOCKED, kết luận go/no-go.

| Chỉ số | Unit | Functional | E2E | Tổng |
|--------|------|------------|-----|------|
| Tổng case | | | | |
| PASS | | | | |
| FAIL | | | | |
| BLOCKED (chưa chạy được) | | | | |

# Môi Trường & Runner
> Stack phát hiện được · lệnh chạy test đã dùng (vd `npm test`, `pytest`) · phiên bản/môi trường ·
> cách thực thi e2e (tự động qua `/run`·`/verify` hay thủ công). Nếu chưa có app/runner → ghi rõ.

# Kết Quả Theo Test Case
| Case ID | Loại (unit/func/e2e) | Bước tóm tắt | Dữ liệu vào | Kết quả mong đợi (expected) | Kết quả thực tế (actual) | Trạng thái | Mức |
|---------|----------------------|--------------|-------------|------------------------------|---------------------------|------------|-----|
| TC-01 | | | | | | PASS/FAIL/BLOCKED | `[MỨC]` |

# Defect Phát Hiện
> Mỗi defect: mô tả · bước tái hiện · expected vs actual · môi trường · Requirement/Rule liên quan (frd.md).

- `[MỨC]` **<tiêu đề defect>** — Case: TC-xx
  - Tái hiện: ...
  - Expected: ... / Actual: ...
  - Liên quan: <Requirement/Rule trong frd.md / path:line code>

# E2E & Locator
> Kết quả thực thi e2e theo `data-testid`. Locator thực tế **khác** đề xuất trong `test.md`?
> Liệt kê để back-prop (cập nhật ngược `test.md`).

| Element/Mục đích | data-testid trong test.md | Thực tế trong code | Cần cập nhật test.md? |
|------------------|---------------------------|--------------------|------------------------|
| ... | | | Có/Không |

# Coverage & Khoảng Hở
- `[MỨC]` Requirement/Rule/State/Permission/Edge case chưa có test thực thi: ...
- Coverage số liệu (nếu runner cung cấp): ...

# Case Chưa Chạy Được (BLOCKED)
- Case: ... — Lý do: (thiếu môi trường / thiếu dữ liệu / chưa có app / phụ thuộc tích hợp...)

# Kết Luận & Khuyến Nghị
- Đề xuất release/không release + lý do.
- Việc cần làm trước khi pass: (sửa defect nào trước, theo Risk-Based).
- Liên kết ngược: `test.md` (thiết kế), `plan.md` (task & tiêu chí Done liên quan).
