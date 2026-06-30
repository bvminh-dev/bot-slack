# Feature Index — Trạng thái hợp nhất (.spec/main)

> Danh mục tính năng hiện hành của hệ thống. Mỗi dòng gắn slug + mô tả + nguồn integration.

| Slug | Tính năng | Trạng thái | Nguồn (i-NNN) | Mô tả ngắn |
|------|-----------|------------|---------------|------------|
| review-pr-slack-azure | Slack bot review PR Azure | frd/tech/security/test/code: done · report: done (i-002 GO, 85/85 PASS) · review: done (i-001 5 bug + i-002 6 bug đã sửa) | i-001, i-002 | Bot Slack `@tieu-nhi <project> review <link>` đọc PR Azure DevOps (PAT) + codebase + tài liệu, chạy skill `.claude` (auto theo loại file) bằng token Claude + **model/effort theo project**, trả review về thread Slack. Multi-project, secret mã hoá, Web Admin UI (login Azure PAT, **phân quyền theo chủ sở hữu — chỉ thấy project mình tạo**). **(i-002)** Giao kết quả **file `.md` + tóm tắt inline** (fallback chia nhỏ chat); **fan-out** tới mọi nơi hỏi cùng PR-commit; **cache-serve từ DB** khi đã review xong (lệnh `fresh` ép chạy lại). |
