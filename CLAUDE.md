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

- Hàng đợi retry PHẢI có max-attempts + dead-letter ngay từ đầu, nếu không poison job sẽ chạy lại vô hạn và đốt tài nguyên/token (i-001).
- Phân loại lỗi tích hợp retryable vs permanent; lỗi tạm thời (timeout/5xx/rate-limit) phải requeue + backoff, chỉ fail cứng với lỗi permanent (i-001).
- Job có side-effect ngoài DB (post Slack, gọi API tốn tiền) phải có guard idempotency theo jobId trước khi tái thực thi (at-least-once → có thể chạy lại) (i-001).
- Tra cứu case-insensitive thì ràng buộc unique cũng phải case-insensitive — chuẩn hoá (vd lưu nameLower) để tránh trùng "LMS"/"lms" gây resolve nhầm (i-001).
- Field temporal/lineage (vd supersedesJobId) phải có logic ghi thực sự, không khai báo suông (i-001).
- Parse output máy của tiến trình con nên dựa delimiter rõ ràng, tránh regex tham lam `{[\s\S]*}` (i-001).
- Gọi API ngoài (Azure DevOps) phải dùng đúng `api-version` của route (profiles/me là `7.1-preview.3`, không phải `7.1`) và KHÔNG `res.json()` mù — Azure trả 200/203 + trang sign-in HTML khi PAT sai/thiếu scope, phải check content-type/HTML rồi map ValidationError (400) thay vì crash 500 (i-001).
- Khi spawn CLI con (Claude Code `-p`), LỖI có thể nằm ở **stdout** chứ không phải stderr (vd "Invalid API key") → phải capture cả 2 stream khi exit≠0, đừng `void stderr`/bỏ stdout, nếu không lỗi auth/quota bị che thành "exit 1" vô nghĩa; phân loại auth/quota để báo rõ cho user (i-001).
- Job mà MỌI skill đều fail KHÔNG được báo "✅ hoàn tất" với 0 finding — phải báo cảnh báo + lý do lỗi, tránh user hiểu nhầm PR sạch trong khi thực ra không review được gì (i-001).
- Credential Claude có 2 loại đi qua 2 env var khác nhau: Console API key `sk-ant-api…` → `ANTHROPIC_API_KEY`; OAuth/subscription token `sk-ant-oat…` → `CLAUDE_CODE_OAUTH_TOKEN`. Truyền nhầm loại → "Invalid API key"/"401 Invalid bearer token". Phải nhận diện theo prefix + trim() (i-001).
- Spawn `claude` con phải CÔ LẬP khỏi session đăng nhập của máy host: set `CLAUDE_CONFIG_DIR` riêng (không đọc `~/.claude/.credentials.json`) + xoá các env auth kế thừa, nếu không nó "mượn" tài khoản người chạy bot → sai tính tiền + vỡ tenant isolation. API key bắt buộc kèm `--bare` (ép dùng key, bỏ qua OAuth); `--bare` KHÔNG nhận OAuth token (i-001).
- Slack `files.upload` đã bị KHAI TỬ (trả `method_deprecated`) → đừng dùng để đính kèm output dài; chia nhỏ theo dòng (<~3000 ký tự/message) rồi post nhiều `chat.postMessage` trong thread (không cần scope `files:write`), hoặc dùng luồng `files.getUploadURLExternal`+`files.completeUploadExternal` nếu bắt buộc file (i-001).
- Slack dùng **mrkdwn** KHÔNG phải Markdown chuẩn: heading `#`/`###` và `**đậm**` render thành chữ thô. Đậm = `*text*`, danh sách dùng emoji/`•`; phải chuẩn hoá text trước khi post. Finding nên tách trường có cấu trúc (why/evidence/impact/fix) để render xuống dòng/blockquote thay vì dồn 1 đoạn (i-001).
<!-- tieu-nhi:end -->
