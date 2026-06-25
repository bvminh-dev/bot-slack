# Template Baseline As-Built (BẮT BUỘC)

Khung rút gọn để sinh tài liệu **as-built** cho dự án có sẵn code. Mỗi tính năng tạo 5 file
trong `.spec/main/feature/<slug>/`. Mọi phát biểu quan trọng gắn `path` (line khi cần). Điều
chưa chắc → *Open Questions*, không khẳng định bừa. Mỗi file mở đầu bằng frontmatter
(theo CONVENTION mục 3) với `integration: i-000`, `status: baseline`.

---

## A. `feature/<slug>/frd.md` (as-built nghiệp vụ)

```yaml
---
integration: i-000
feature: <slug>
stage: frd
status: baseline
open_questions: <n>
updated: YYYY-MM-DD
---
```

- **Tóm Tắt Tính Năng** — tính năng làm gì, phạm vi, code chính (`path`).
- **Luồng Chính / Thay Thế / Ngoại Lệ** — suy từ controller/service/route (`path`).
- **Business Rule hiện có** — `path` · mô tả rule đang enforce.
- **Validation hiện có** — `path`.
- **Phân Quyền hiện có** — role/permission/scope đang kiểm tra (`path`).
- **Trạng Thái / Workflow** — state & transition trong code (`path`).
- **Open Questions** — chỗ chưa rõ / nghi vấn nghiệp vụ.

## B. `feature/<slug>/tech.md` (as-built kiến trúc — rút gọn từ template thiet-ke-he-thong)

- Domain/Module & trách nhiệm (`path`) · Data Ownership (bảng/entity nào, `path`).
- API/Endpoint chính (method, route, `path`).
- Tích hợp ngoài (SSO/Payroll/ERP/Email...) nếu có (`path`).
- Mô hình dữ liệu liên quan (bảng/migration, `path`).
- Open Questions kiến trúc.

## C. `feature/<slug>/security.md` (as-built bảo mật — rút gọn từ template bao-mat-he-thong)

- Authentication/Authorization hiện trạng (`path`).
- Permission scope thực tế · Multi-tenant isolation (nếu có) (`path`).
- Data protection (PII/secret) hiện trạng.
- Open Security Questions / rủi ro quan sát được (gắn mức `[MỨC]`).

## D. `feature/<slug>/test.md` (as-built test — mô tả bằng lời)

- Test case mô tả hành vi hiện có: **Bước · Dữ liệu vào · Kết quả mong đợi**.
- **E2E Locators**: bảng (Element/Mục đích → `data-testid`/selector tìm thấy trong UI → `path`).
- KHÔNG sinh code Playwright/Cypress.

## E. `feature/<slug>/report.md` (baseline kết quả)

- Nếu repo có test sẵn: chạy (skill `chay-kiem-thu`) và ghi baseline pass/fail.
- Nếu không: "Chưa chạy — baseline tài liệu" + lý do.

---

## F. Tổng hợp cấp hệ thống

### `main/feature-index.md`
| Tính năng (slug) | Mô tả ngắn | Code chính (`path`) | Trạng thái |
|------------------|------------|---------------------|------------|
| <slug> | ... | ... | baseline |

### `main/sad.md`
> Kiến trúc tổng: stack, sơ đồ module/bounded context, data ownership tổng, tích hợp tổng.
> Gộp từ các `tech.md`. Gắn `path` cho khối chính. Open Questions ở cuối.

### `main/security.md`
> Bảo mật tổng: mô hình authn/authz, multi-tenant, data protection, các rủi ro mức cao.
> Gộp từ các `security.md` tính năng.

### `main/live-spec.md` — ghi mốc baseline
```
## [YYYY-MM-DD] /tn-khoi-tao (i-000 baseline)
- Skill dùng: khoi-tao-tai-lieu
- Việc đã làm: quét codebase, phát hiện <n> tính năng, sinh .spec/main as-built
- Open Questions cần xác nhận: <tóm tắt>
```
