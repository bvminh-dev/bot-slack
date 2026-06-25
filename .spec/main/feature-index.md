# Feature Index — Trạng thái hợp nhất (.spec/main)

> Danh mục tính năng hiện hành của hệ thống. Mỗi dòng gắn slug + mô tả + nguồn integration.

| Slug | Tính năng | Trạng thái | Nguồn (i-NNN) | Mô tả ngắn |
|------|-----------|------------|---------------|------------|
| review-pr-slack-azure | Slack bot review PR Azure | frd: approved · tech: approved · security: approved · test: approved · code: done · report: done (NO-GO) · review: done (5 bug đã sửa) | i-001 | Bot Slack `@tieu-nhi <project> review <link>` đọc PR Azure DevOps (PAT) + codebase + tài liệu, chạy skill `.claude` (auto theo loại file) bằng token Claude + **model/effort theo project**, trả review về thread Slack. Multi-project, secret mã hoá, Web Admin UI (login Azure PAT, **phân quyền theo chủ sở hữu — chỉ thấy project mình tạo**). |
