---
doc: security
title: Security Baseline — tieu-nhi (Slack bot review PR Azure)
status: living
updated: 2026-06-25
sources: [i-001]
---

# Security Baseline — Trạng thái bảo mật hợp nhất

> Chuẩn bảo mật toàn hệ thống (living). Chi tiết theo tính năng: `main/feature/<slug>/security.md`.

## 1. Quyết định bảo mật cốt lõi (đã chốt)

| # | Quyết định | Nguồn |
|---|-----------|-------|
| Mã hoá secret | **AES-256-GCM** (IV riêng + auth tag + `keyVersion`); master key từ **ENV/secret file** (không ở DB) | i-001 (#3) |
| Định danh owner | Azure **userId/email** từ profile API (ổn định khi PAT xoay vòng), không dùng chuỗi PAT làm khoá | i-001 (#2) |
| Tạo project | **Self-service** — bất kỳ PAT Azure hợp lệ; KHÔNG allowlist; bù bằng rate-limit + quota + audit | i-001 (#2) |
| Slack review authz | **Mọi người trong workspace** review mọi project; residual data-leakage chéo **được chấp nhận**; giữ điểm chốt `authorizeReviewCommand` | i-001 (#8) |

## 2. Nguyên tắc bảo mật bắt buộc (cross-cutting)

1. **Tenant isolation:** ép `ownerId` ở **repository layer**; cấm query "all"; 404 cho tài nguyên người khác; test cross-tenant tự động. *(CRITICAL)*
2. **Secret write-only + mã hoá at-rest:** không serialize/không log/không trả API; truyền Claude key cho `claude -p` qua **ENV tiến trình con** (không qua arg). *(CRITICAL)*
3. **Chống mass assignment:** allowlist field create/update; gán `ownerId`/`status` server-side từ session. *(CRITICAL)*
4. **Chống injection:** spawn `claude`/`git` dạng **argv** (không shell); prompt qua stdin/file; CLI chạy quyền tool tối thiểu (đọc-only) để chống **prompt injection**; query Mongo tham số hoá. *(HIGH)*
5. **Auth & transport:** verify Slack signing secret + timestamp; **HTTPS bắt buộc**; JWT ngắn hạn httpOnly+Secure+SameSite; verify PAT với Azure, không lưu/không log PAT. *(HIGH)*
6. **DoS & cost control:** rate-limit per-user/period + quota token/project + concurrency 5 + idempotency `(project,pr,commit)`; alert anomaly chi phí & dò id project. *(HIGH)*
7. **Data lifecycle:** xoá temp clone trong `finally` + dọn rác mồ côi; mỗi job clone thư mục riêng; **data minimization** dữ liệu gửi Anthropic. *(MEDIUM)*
8. **Audit bất biến:** ghi vết lệnh review (ai/project/PR/commit/skill/chi phí) + thay đổi cấu hình/secret, KHÔNG log giá trị secret. *(HIGH)*

## 3. Tài sản nhạy cảm (hệ thống)

CRITICAL: Azure PAT & Claude API key (per project, AES-256-GCM), master key (ENV). HIGH: PAT login (không lưu), session JWT, Slack signing secret, PR code/tài liệu khách hàng (qua Anthropic), review history. MEDIUM: owner identity (PII), project config, audit log.

## 4. Rủi ro/residual nổi bật (toàn hệ thống)

- `[CRITICAL]` Broken Access Control / BOLA (đoán projectId) — kiểm ownership mọi tầng.
- `[CRITICAL]` Lộ secret (log/error/response) — mã hoá + write-only + lọc log.
- `[HIGH] (residual chấp nhận)` Slack "mọi người review" → lộ code/tài liệu project chéo qua thread; bù audit + cảnh báo owner.
- `[HIGH]` Code khách hàng đi qua Anthropic (bên thứ ba) — minimization + đồng ý hợp đồng (FRD #7, → nghiệp vụ).
- `[HIGH]` Prompt injection từ nội dung PR — đóng khung untrusted + tool tối thiểu.

## 5. Định tuyến / khuyến nghị mở (không chặn)

- `[→ nghiệp vụ/pháp lý]` Đồng ý/hợp đồng cho dữ liệu khách hàng qua Anthropic (FRD #7).
- `[→ nghiệp vụ #9]` Tên project **duy nhất toàn hệ thống** (hoặc resolve `owner/project`) vì Slack cho mọi người resolve `<project>` → repo.
- `[→ tương lai]` Entra ID OIDC thay PAT-login (giảm rủi ro lộ PAT); nâng master key sang **KMS/Vault** khi production diện rộng.

## 6. Tham chiếu chuẩn

STRIDE · OWASP Top 10:2021 (A01 Access Control, A02 Crypto, A03 Injection, A05 Misconfig, A07 Auth, A09 Logging) · OWASP API Security Top 10:2023 (API1 BOLA, API3 Excessive/Mass Assignment, API4 Resource Consumption) · Zero Trust (NIST SP 800-207) · Least Privilege · Defense in Depth.
</content>
