# Live-spec — Trạng thái hợp nhất (.spec/main)

> Nhật ký as-built rút gọn toàn hệ thống. Chi tiết theo từng i-NNN nằm trong `.spec/integration/i-NNN/live-spec.md`.

## [2026-06-25] /tn-yeu-cau (i-001) — review-pr-slack-azure
- Khởi tạo dự án (greenfield) + bootstrap pipeline `.spec`.
- Chốt FRD cho Slack bot review PR Azure DevOps: lệnh `@tieu-nhi <project> review <link>`; multi-project (repo + token Claude + Azure PAT, secret mã hoá); trả review về Slack thread; Web Admin UI (login Azure PAT); auto-select skill theo loại file; xử lý bất đồng bộ.
- Bước kế: `/tn-thiet-ke i-001`.
