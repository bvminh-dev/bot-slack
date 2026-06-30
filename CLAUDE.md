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

| Bước | Lệnh | Skill | Đầu ra | Giải thích |
|------|------|-------|--------|------------|
| 0 (brownfield) | `/tn-khoi-tao` | `khoi-tao-tai-lieu` | `.spec/main/` as-built + baseline i-000 | Quét codebase có sẵn (dự án brownfield) để dựng tài liệu as-built và lập baseline `i-000` làm điểm xuất phát tri thức hệ thống. |
| 1 | `/tn-yeu-cau` | `phan-tich-nghiep-vu` | `frd.md` (hỏi làm rõ trước khi chốt) | Phân tích nghiệp vụ: làm rõ yêu cầu với người dùng, chốt phạm vi và viết đặc tả chức năng (FRD). |
| 2 | `/tn-thiet-ke` | `thiet-ke-he-thong` | `tech.md` → `sad.md` | Thiết kế kỹ thuật từ FRD: lựa chọn công nghệ/kiến trúc (`tech.md`) rồi tổng hợp thành tài liệu kiến trúc phần mềm (`sad.md`). |
| 3 | `/tn-bao-mat` | `bao-mat-he-thong` | `security.md` | Phân tích bảo mật: nhận diện rủi ro, mối đe doạ và biện pháp kiểm soát cho thiết kế đã chốt. |
| 4 | `/tn-kiem-thu` | `kiem-thu-phan-mem` | `test.md` (test design: condition/scenario/case + E2E Locators, mô tả bằng lời) | Thiết kế kiểm thử: xác định điều kiện/kịch bản/ca kiểm thử và các Locator cho E2E, mô tả bằng lời (chưa sinh code). |
| 4b | `/tn-sinh-test` | `sinh-test-cases` | phân tầng **Unit/Functional/E2E** + ma trận truy vết (append vào `test.md`) | Phân rã test design thành 3 tầng test pyramid (Unit/Functional/E2E) kèm ma trận truy vết về FRD; chỉ chạy khi `test.md` đã approved. |
| 5 | `/tn-ke-hoach` | (tổng hợp) | `plan.md` (task + phụ thuộc + tiêu chí Done) | Lập kế hoạch hiện thực: chia task, xác định phụ thuộc và tiêu chí hoàn thành (Done) trước khi code. |
| 6 | `/tn-code` | (hiện thực) | code + back-prop locator | Viết code theo plan; có gate cứng chặn nếu doc upstream chưa approved/còn open question; cập nhật ngược locator vào tài liệu. |
| 7 | `/tn-bao-cao` | `chay-kiem-thu` | `report.md` (chạy thật, expected vs actual) | Chạy kiểm thử thật và lập báo cáo so sánh kết quả mong đợi với thực tế. |
| 8 | `/tn-review` | `review-code` | review; bug → `bugfix.md` + rule (mục dưới) → sửa sau | Review code; mỗi bug ghi vào `bugfix.md` và rút thành 1 dòng rule kinh nghiệm (mục Rules) để lần sau không lặp lại. |

Test case mô tả **bằng lời** (Bước/Dữ liệu vào/Kết quả mong đợi); e2e dùng `data-testid`, **không sinh code Playwright/Cypress**. Bước 4 thiết kế test (condition/scenario/case + Locators); bước 4b phân rã thành **3 tầng test pyramid** (Unit nhiều → Functional vừa → E2E ít) kèm ma trận truy vết về FRD.

## Quy trình khi có 1 tính năng mới (các step + thứ tự ràng buộc)

Mỗi tính năng/thay đổi mới = **1 integration `i-NNN`** (xin số kế tiếp trong `registry.md`). Chạy **tuần tự** các lệnh, **không nhảy bước**:

```
(0 brownfield) tn-khoi-tao
   → 1 tn-yeu-cau (frd) → 2 tn-thiet-ke (tech) → 3 tn-bao-mat (security)
   → 4 tn-kiem-thu (test design) → 4b tn-sinh-test (phân tầng U/F/E2E)
   → 5 tn-ke-hoach (plan) → 6 tn-code → 7 tn-bao-cao (report) → 8 tn-review
```

**Ràng buộc (gate cứng — định nghĩa ở `CONVENTION.md` mục 4):**
- **Trước mỗi bước, đọc doc của bước NGAY TRƯỚC trong cùng `i-NNN`.** Nếu doc upstream `status != approved` **hoặc** `open_questions > 0` → **DỪNG**, không tự đi tiếp (hỏi người dùng hoặc chốt giả định tường minh rồi mới chạy).
- **Thứ tự bắt buộc:** `frd → tech → security → test → (test phân tầng) → plan → code → report → review`. Mỗi bước phụ thuộc đầu ra bước trước; không có frd thì không thiết kế, không có test thì không phân tầng, không có plan thì không code.
- **4b phụ thuộc 4:** `/tn-sinh-test` chỉ chạy khi `test.md` đã `approved` (vì nó phân rã chính test.md). Phân tầng nằm cùng `stage: test`, append vào `test.md`, **không tạo stage mới**.
- **GATE CỨNG `/tn-code`:** chặn nếu **bất kỳ** doc nào trong `{frd, tech, security, test, plan}` của `i-NNN` chưa `approved` hoặc còn `open_questions > 0`. → **KHÔNG code khi còn open question.**
- **Bất biến & cascade:** doc trong `i-NNN` là delta, **bất biến sau khi approved**; mọi thay đổi tri thức hợp nhất chỉ sửa ở `.spec/main/` qua cascade (MERGE, mục 5). Mỗi bước cập nhật `registry.md` + append `live-spec.md`.

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
- Lỗi credential (login/PAT/token sai hoặc hết hạn) phải map HTTP **401** (`AuthError`), KHÔNG để rơi vào **400** (`ValidationError`): service login phải bọc lời gọi xác thực hệ ngoài và dịch lỗi sang `AuthError`, nếu không client không phân biệt được "request sai" vs "cần đăng nhập lại" (i-001, F-1/BUG-07).
- Side-effect quan trọng (giao kết quả/fan-out) phải hoàn tất TRƯỚC khi đánh dấu trạng-thái-cuối làm job mất khả năng reclaim (`complete()` đặt status=completed → claimNext bỏ qua): đặt sai thứ tự → crash giữa 2 bước làm kết quả không bao giờ được giao và không thể khôi phục. Đánh dấu hoàn tất là bước CUỐI; side-effect cần idempotent để reclaim chạy lại an toàn (i-002, BUG-09).
- Switch trên union-status phải xử lý TƯỜNG MINH mọi nhánh; cấm `else` gom nhánh có ngữ nghĩa khác (vd `race_none` lọt vào `subscribed`) → ack "đang xử lý" nhưng không có job/không phản hồi (im lặng) — đúng anti-pattern "job fail không được im lặng" (i-002, BUG-10).
- Redaction secret là best-effort → BẮT BUỘC có test data-driven liệt kê biến thể thật (GitHub `ghp_/gho_/ghu_/ghs_/github_pat_`, AWS `AKIA/ASIA`+session token, `key="value có dấu cách"`); value-class `[^\s]` sẽ bỏ sót chuỗi có dấu cách trong ngoặc kép. Đo false-negative mỗi lần đổi pattern, vì dữ liệu đã rời lên Slack KHÔNG xoá được (i-002, BUG-14).
- Không tái dùng query có bộ lọc nghiệp vụ cho mục đích khác: dùng `findCacheEligibleByKey` (loại failed/empty) để tìm bản supersede → mất lineage đúng lúc hay rerun nhất (bản trước lỗi). Mỗi mục đích một query đúng ngữ nghĩa (i-002, BUG-12).
- Tránh `$set` mù lên mảng dùng-chung bởi nhiều đường ghi (worker `recordDeliveries` vs cache-serve `appendDelivery`) → ghi đè mất bản ghi của đường kia; hợp nhất có khoá `(channel,threadTs,mode)` (i-002, BUG-13).
- Không nhúng ký tự zero-width/điều khiển dạng literal trong source (vd chèn U+200B để chặn mention Slack) — dùng escape `\uXXXX` để diff/review đọc được (i-002, BUG-11).
<!-- tieu-nhi:end -->
