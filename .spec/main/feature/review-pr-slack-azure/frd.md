---
integration: i-001
feature: review-pr-slack-azure
stage: frd
status: approved
open_questions: 0
updated: 2026-06-25
---

# Tóm Tắt Tính Năng

Xây dựng **Slack bot "tieu-nhi"** giúp **review tự động Pull Request trên Azure DevOps** ngay từ Slack.
Người dùng ra lệnh trong Slack:

```
@tieu-nhi <project> review <link-PR-Azure>
```

Bot dùng **token Claude + Azure PAT** (theo cấu hình từng project) để truy cập Azure DevOps, đọc **code change của PR + codebase + tài liệu hệ thống**, sau đó chạy **các skill review sẵn có trong `.claude/skills`** (review-code, bao-mat-he-thong, kiem-thu-phan-mem, phan-tich-nghiep-vu, thiet-ke-he-thong) và **trả kết quả review về thread Slack**.

Hệ thống **quản lý nhiều project** (vd `LMS` ↔ `https://dev.azure.com/torus-engineering/C-Keppel/_git/Leasing-Management-System`). Mỗi project cấu hình: tên project, link repo, token Claude, Azure PAT, **model Claude** (vd `claude-opus-4-8`, `claude-sonnet-4-6`…) và **effort** (mức reasoning, vd `low|medium|high`) — **token Claude và PAT được mã hoá khi lưu**. Việc setup project qua **Web Admin UI**, **đăng nhập bằng Azure PAT**; **mỗi người chỉ thấy & quản lý project do chính mình tạo** (phân quyền theo chủ sở hữu / ownership-based).

**Phạm vi (in-scope):**
- Slack command listener + parser (`@tieu-nhi <project> review <link>`).
- Multi-project registry + mã hoá secret + Web Admin UI quản trị project (cấu hình gồm cả **model Claude + effort** mỗi project; **phân quyền theo chủ sở hữu**).
- Lấy PR (metadata, diff, file thay đổi) + clone/đọc codebase + tài liệu hệ thống từ Azure DevOps.
- Điều phối chạy skill review theo loại file (auto-select).
- Đăng kết quả review (tóm tắt + chi tiết theo mức rủi ro) vào thread Slack; xử lý bất đồng bộ (ack ngay, trả kết quả sau).

**Ngoài phạm vi (out-of-scope) lần này:**
- Đăng comment ngược lên Azure PR (đã chọn chỉ trả Slack thread).
- Tự động approve/reject/merge PR.
- Hỗ trợ GitHub/GitLab/Bitbucket (chỉ Azure DevOps Git).
- Review tự động khi có PR mới (chỉ chạy khi được ra lệnh thủ công).

# Mục Tiêu Nghiệp Vụ

- **Business Goal:** Rút ngắn thời gian & nâng chất lượng review PR bằng cách tự động hoá review dựa trên bộ skill chuẩn của tổ chức (nghiệp vụ + kiến trúc + bảo mật + test + code), ngay trong công cụ làm việc hằng ngày (Slack).
- **Business Value:** Reviewer con người được hỗ trợ checklist nhất quán; phát hiện sớm gap nghiệp vụ/bảo mật/bug; chuẩn hoá chất lượng review xuyên nhiều project/khách hàng.
- **KPI kỳ vọng:**
  - Thời gian từ lúc ra lệnh đến lúc có review < vài phút cho PR cỡ vừa.
  - ≥ X% PR được review qua bot trước khi merge (X cấu hình theo team).
  - Tỉ lệ finding hợp lệ (không nhiễu) ≥ ngưỡng chấp nhận của reviewer.
- **Assumptions (giả định đang dựa vào — cần xác nhận ở bước thiết kế/bảo mật):**
  1. **Bot chạy skill bằng Claude Agent SDK / Claude Code headless**, xác thực bằng **token Claude của từng project** (Anthropic API key), dùng đúng **model + effort cấu hình của project**. → Token/model/effort theo project nhằm **cô lập chi phí/ngữ cảnh & cho phép chọn chất lượng-vs-chi phí theo từng khách hàng**. *(GIẢ ĐỊNH — chốt ở `/tn-thiet-ke`.)*
  2. **Tài liệu hệ thống mặc định nằm trong chính repo đích** (vd thư mục `.spec/` hoặc `docs/`), **và có thêm trường cấu hình theo project để khai báo đường dẫn/nguồn bổ sung**. *(theo lựa chọn người dùng)*
  3. **Đăng nhập Web Admin UI bằng Azure PAT** của người dùng (xác thực PAT với Azure DevOps để chứng minh danh tính). **Phân quyền theo chủ sở hữu**: người tạo project chỉ thấy/sửa/xoá project do chính mình tạo, không thấy project của người khác. *(theo lựa chọn người dùng — cơ chế định danh chủ sở hữu & cô lập dữ liệu chi tiết ở `/tn-bao-mat`)*
  4. **Mọi người trong Slack workspace** đều có thể ra lệnh review (không giới hạn user/kênh). *(theo lựa chọn người dùng)*
  5. Xử lý **bất đồng bộ**: ack ngay (< 3s theo yêu cầu Slack), trả kết quả vào thread khi xong. *(theo lựa chọn người dùng)*
  6. Skill review chọn **tự động theo loại file**. *(theo lựa chọn người dùng)*
  7. **Model + effort cấu hình mỗi project** áp dụng cho mọi lần chạy review của project đó; có **giá trị mặc định** khi không nhập. *(theo lựa chọn người dùng)*

# Luồng Chính

1. Người dùng gõ trong Slack: `@tieu-nhi LMS review https://dev.azure.com/.../pullrequest/123`.
2. Bot nhận event mention, **ack ngay** (vd reply "⏳ Đang nhận lệnh review PR #123 của project LMS…" hoặc emoji react) trong < 3s.
3. Bot **parse** lệnh: tách `project = LMS`, `action = review`, `pr_url`.
4. Bot tra **project registry** theo tên `LMS` → lấy repo URL, token Claude (giải mã), Azure PAT (giải mã), cấu hình nguồn tài liệu bổ sung.
5. Bot dùng **PAT** gọi Azure DevOps API: xác thực PR tồn tại, lấy **metadata** (title, description, source/target branch, danh sách file thay đổi, diff).
6. Bot **lấy ngữ cảnh**: clone/đọc nhánh nguồn của PR (code change + codebase), đọc **tài liệu hệ thống** (trong repo + nguồn bổ sung cấu hình).
7. Bot **phân loại file** thay đổi và **map sang skill** (code→review-code, frd/spec→phan-tich-nghiep-vu, tech/kiến-trúc→thiet-ke-he-thong, file nhạy cảm→bao-mat-he-thong, test→kiem-thu-phan-mem).
8. Bot chạy các skill (qua Claude, dùng token Claude của project), tổng hợp finding theo mức rủi ro `CRITICAL/HIGH/MEDIUM/LOW`.
9. Bot **đăng kết quả** vào **thread Slack** của lệnh: tóm tắt (đếm theo mức) + chi tiết finding theo file/skill + link PR.
10. (Tuỳ chọn) Bot react ✅ báo hoàn tất.

# Luồng Thay Thế

- **PR rất lớn / nhiều file:** bot chia batch theo file/skill, có thể đăng kết quả từng phần hoặc một bản tổng hợp khi xong; báo tiến độ trong thread.
- **PR chỉ chứa tài liệu (frd/spec, không có code):** chỉ chạy skill nghiệp vụ/kiến trúc tương ứng, không chạy review-code.
- **PR chỉ chứa code:** chạy review-code (+ bao-mat nếu chạm file nhạy cảm).
- **Người dùng ra lệnh lại trên cùng PR:** chạy review mới (idempotent về kết quả, không phá dữ liệu) — xem Edge Case về review trùng.
- **Project có nhiều repo / mono-repo:** map theo cấu hình project (1 project ↔ 1 repo ở phạm vi i-001).

# Luồng Ngoại Lệ

- **Sai cú pháp lệnh** (thiếu project/link, sai thứ tự): bot trả hướng dẫn cú pháp đúng.
- **Project không tồn tại trong registry:** bot báo "project chưa được cấu hình" + gợi ý liên hệ admin.
- **Link PR không hợp lệ / không thuộc repo của project:** bot báo lỗi rõ ràng (mismatch repo ↔ project).
- **PAT/token Claude sai/hết hạn/không đủ quyền:** bot báo lỗi xác thực, không lộ giá trị secret; gợi ý admin cập nhật.
- **PR không tồn tại / đã hoàn tất / đã abandon / không có quyền xem:** bot báo trạng thái không review được.
- **Azure DevOps hoặc Claude API lỗi/timeout/đụng rate-limit:** bot báo lỗi tạm thời + cơ chế retry/backoff; không treo thread vô hạn.
- **Clone repo thất bại / repo quá lớn vượt giới hạn:** báo lỗi + (nếu được) fallback review chỉ trên diff.
- **Skill chạy lỗi giữa chừng:** trả phần kết quả đã có + ghi rõ skill nào lỗi.

# Logic Còn Thiếu

- `[HIGH]` **Quy tắc map "tên project (Slack)" → repo Azure** chưa định nghĩa chặt: phân biệt hoa/thường, trùng tên, alias. _(Business Rules Analysis)_
- `[HIGH]` **Quy tắc chọn skill theo loại file** chưa có bảng mapping chuẩn (extension/đường dẫn → skill), xử lý file không khớp loại nào, file vừa-code-vừa-nhạy-cảm chạy nhiều skill. _(Decision Analysis)_
- `[HIGH]` **Định nghĩa "tài liệu hệ thống"**: thư mục/định dạng nào được coi là tài liệu (`.spec/`, `docs/`, README…), và cách hợp nhất nguồn-trong-repo với nguồn-bổ-sung-cấu-hình. _(Scope Modelling)_
- `[MEDIUM]` **Giới hạn kích thước review** (số file, số dòng diff, token Claude tối đa/PR) chưa định nghĩa → ảnh hưởng chi phí & thời gian. _(Non-Functional Requirements Analysis)_
- `[MEDIUM]` **Định dạng & độ dài output trong Slack** (Slack giới hạn ký tự/block) — cần quy tắc rút gọn/đính kèm file khi review dài. _(Interface Analysis)_
- `[MEDIUM]` **Danh sách model + effort hợp lệ** và **giá trị mặc định** chưa định nghĩa; cần đồng bộ với model Claude hiện hành (vd Opus 4.8 / Sonnet 4.6) và cập nhật khi model mới ra. _(Decision Analysis)_
- `[MEDIUM]` **Branch nào được đọc làm codebase ngữ cảnh** (source branch của PR vs target branch) chưa nêu rõ.
- `[LOW]` Lệnh phụ ngoài `review` (vd `help`, `status`, `cancel`) chưa định nghĩa.

# Business Rule Còn Thiếu

- `[HIGH]` **Project name duy nhất**: cần xác định phạm vi duy nhất — toàn hệ thống hay **theo từng chủ sở hữu** (vì mỗi người chỉ thấy project mình tạo, hai người khác nhau có thể đặt trùng tên `LMS`). Ảnh hưởng cách Slack resolve `<project>` → repo. _(Business Rules Analysis)_ → câu hỏi mở #9.
- `[MEDIUM]` **Mỗi project gắn đúng 1 chủ sở hữu** (người tạo); chuyển nhượng/chia sẻ quyền chưa thuộc i-001.
- `[MEDIUM]` **Model + effort hợp lệ**: chỉ chấp nhận model Claude được hỗ trợ & effort trong tập cho phép; nếu trống → dùng mặc định hệ thống.
- `[HIGH]` **PR phải thuộc đúng repo** đã cấu hình cho project được nêu — nếu lệch phải từ chối.
- `[MEDIUM]` **Quy tắc chống spam/lạm dụng**: số lệnh review tối đa/người/khoảng thời gian (vì token Claude tốn tiền và mọi người trong workspace đều ra lệnh được).
- `[MEDIUM]` **Ngưỡng phân loại finding** (khi nào CRITICAL/HIGH…) — theo thang trong từng skill, cần thống nhất khi tổng hợp đa-skill.
- `[LOW]` Ngôn ngữ output review (mặc định tiếng Việt theo skill) — quy tắc cho repo/PR tiếng Anh.

# Validation Còn Thiếu

- `[HIGH]` Validate **định dạng link PR Azure** (đúng host `dev.azure.com`/`*.visualstudio.com`, có `pullrequest/<id>`).
- `[HIGH]` Validate **project tồn tại & active** trước khi xử lý.
- `[HIGH]` Validate **token Claude / PAT** khi nhập ở Admin UI (test-connection trước khi lưu) để tránh lưu secret sai.
- `[MEDIUM]` Validate **repo URL hợp lệ** & bot có quyền truy cập khi setup project.
- `[MEDIUM]` Validate **model** thuộc danh sách model Claude được hỗ trợ và **effort** thuộc tập cho phép (vd `low|medium|high`); chặn giá trị tự do/không hợp lệ.
- `[MEDIUM]` Chặn **duplicate project** (trùng tên hoặc trùng repo) khi tạo.
- `[LOW]` Trim/normalize input lệnh (khoảng trắng thừa, link bị Slack bọc `<...>`).

# Phân Quyền Còn Thiếu

- `[HIGH]` **Phân quyền theo chủ sở hữu (ownership-based)**: người dùng đăng nhập Admin UI bằng Azure PAT **chỉ thấy/sửa/xoá project do chính mình tạo**, không truy cập project của người khác. Cần định nghĩa **danh tính chủ sở hữu** ổn định (vd Azure user id/email suy từ PAT, không phải chính chuỗi PAT vì PAT có thể xoay vòng). _(Roles and Permissions Matrix)_ → cơ chế định danh chi tiết ở `/tn-bao-mat`.
- `[HIGH]` **Cô lập dữ liệu giữa các chủ sở hữu (tenant isolation)**: mọi truy vấn project ở Admin UI/API phải lọc theo owner; chặn IDOR (đoán id project của người khác). _(Data Leakage)_
- `[CRITICAL]` **Không hiển thị lại secret** (token Claude/PAT) sau khi lưu — chỉ cho ghi đè (write-only), tránh data leakage qua Admin UI.
- `[HIGH]` **Mọi người trong workspace ra lệnh review được** → bất kỳ ai cũng kích hoạt việc đọc codebase/tài liệu của mọi project & tiêu token Claude. Cần cân nhắc rủi ro lộ thông tin project chéo. _(Data Leakage / SoD)_
- `[HIGH]` **Xung đột phạm vi quyền**: Admin UI cô lập theo chủ sở hữu (chỉ thấy project của mình), nhưng lệnh review trong Slack **mọi người đều dùng được trên mọi project**. ⇒ Người không sở hữu project vẫn xem được kết quả review (gồm trích đoạn code/tài liệu) của project đó. Cần làm rõ chủ đích này có chấp nhận được không (vd hạn chế theo kênh, hay chỉ owner mới review được). _(SoD / Data Leakage)_ → câu hỏi mở #8.
- `[MEDIUM]` Phân tách quyền: ai được xem **lịch sử review** / log chứa nội dung code.

# Trạng Thái Còn Thiếu

- `[MEDIUM]` **Vòng đời một lệnh review**: `Nhận lệnh → Đang xử lý → Hoàn tất / Lỗi / Huỷ`. Trạng thái và cách hiển thị/cập nhật trong Slack thread chưa định nghĩa.
- `[MEDIUM]` Trạng thái **project**: active / disabled (tạm ngừng nhận lệnh) / lỗi-cấu-hình.
- `[LOW]` Trạng thái secret: hợp lệ / hết hạn / cần xoay vòng (rotation).

# Thông Báo Còn Thiếu

- `[MEDIUM]` Thông báo **lỗi xử lý** về đúng người ra lệnh trong thread (đã có nguyên tắc ack); cần rõ nội dung lỗi an toàn (không lộ secret/stacktrace nhạy cảm).
- `[MEDIUM]` Thông báo **tiến độ** cho PR lớn (đang chạy skill nào / còn bao nhiêu).
- `[LOW]` Thông báo cho **admin** khi secret hết hạn / project lỗi cấu hình liên tục.

# Audit Còn Thiếu

- `[HIGH]` **Audit log lệnh review**: ai ra lệnh, project nào, PR nào, lúc nào, kết quả/skill chạy, chi phí token. Cần cho truy vết & kiểm soát chi phí. _(Process Analysis)_
- `[HIGH]` **Audit thay đổi cấu hình project / secret** ở Admin UI (ai tạo/sửa/xoá, khi nào) — không log giá trị secret.
- `[MEDIUM]` Lưu **lịch sử review** để tra cứu lại (và tránh chạy lại không cần thiết).

# Edge Cases

| Edge Case | Kỳ vọng xử lý | Mức rủi ro |
| --------- | ------------- | ---------- |
| Link PR bị Slack bọc trong `<...>` hoặc kèm tham số query | Normalize trước khi parse | `[MEDIUM]` |
| Tên project sai hoa/thường hoặc có dấu cách | Match case-insensitive / báo lỗi gợi ý project gần đúng | `[MEDIUM]` |
| PR mở rồi cập nhật commit mới sau khi review | Review phản ánh commit tại thời điểm chạy; ghi rõ commit hash đã review | `[MEDIUM]` |
| Ra lệnh review cùng PR 2 lần liên tiếp (double-submit) | Chống chạy trùng / hàng đợi / báo "đang chạy" | `[HIGH]` |
| PR rỗng (không file thay đổi) | Báo "không có gì để review" | `[LOW]` |
| Diff khổng lồ (vd file generated, lock file, binary) | Bỏ qua/giới hạn file không cần review (lock, binary, ảnh) | `[MEDIUM]` |
| Repo private, bot/PAT không đủ quyền | Báo lỗi quyền truy cập rõ ràng | `[HIGH]` |
| Token Claude của project hết hạn mức / hết credit | Báo lỗi, không nuốt lặng | `[HIGH]` |
| Tài liệu hệ thống không tồn tại trong repo & chưa cấu hình nguồn bổ sung | Review trên code, ghi chú "thiếu tài liệu đối chiếu" | `[MEDIUM]` |
| Nhiều người ra lệnh review cùng lúc (nhiều project) | Hàng đợi/đồng thời có kiểm soát, cô lập token theo project | `[HIGH]` |
| Mention bot nhưng không phải lệnh review | Trả hướng dẫn `help` | `[LOW]` |
| PR thuộc repo khác repo đã cấu hình cho project | Từ chối, báo mismatch | `[HIGH]` |
| Model cấu hình của project không còn được hỗ trợ / bị deprecate | Báo lỗi cấu hình, gợi ý admin cập nhật model (không tự ý đổi) | `[MEDIUM]` |
| Hai chủ sở hữu khác nhau cùng đặt tên project `LMS` | Resolve theo phạm vi duy nhất đã chốt (xem business rule #project name) | `[MEDIUM]` |
| Người dùng đoán/sửa id project của người khác trong Admin UI/API | Chặn (lọc theo owner), trả 403/404 — không lộ tồn tại | `[HIGH]` |
| Project để trống model/effort | Áp dụng giá trị mặc định hệ thống | `[LOW]` |

# Ảnh Hưởng Tính Năng Khác

- `[LOW]` **Không phát hiện trùng lặp** với tính năng hiện có — đây là dự án greenfield (chỉ có bộ pipeline tài liệu `.claude` + `CLAUDE.md`, chưa có code sản phẩm).
- `[MEDIUM]` Bot **tái sử dụng chính bộ skill `.claude/skills`** của pipeline tài liệu-trước → bất kỳ thay đổi nào ở skill (review-code, bao-mat…) sẽ ảnh hưởng trực tiếp kết quả review của bot. Cần coi skill là **shared dependency có version**.

# Ảnh Hưởng Component Dùng Chung

| Component dùng chung | Tính năng bị ảnh hưởng | Regression Risk |
| -------------------- | ---------------------- | --------------- |
| Bộ skill `.claude/skills/*` | Toàn bộ kết quả review của bot | `[HIGH]` (đổi skill → đổi output) |
| Project registry + lớp mã hoá secret | Mọi lệnh review (giải mã token) + Admin UI | `[HIGH]` |
| Slack listener/parser | Mọi lệnh tương lai của bot | `[MEDIUM]` |
| Azure DevOps client (PAT) | Lấy PR + clone repo + (login admin) | `[HIGH]` |
| Claude runtime (Agent SDK) | Mọi lần chạy skill | `[HIGH]` |

# Rủi Ro Dữ Liệu

- `[CRITICAL]` **Lưu secret (token Claude/PAT) sai cách** → rò rỉ. Bắt buộc mã hoá at-rest + quản lý master key (chi tiết `/tn-bao-mat`).
- `[HIGH]` **Code/tài liệu private của khách hàng** đi qua Claude (bên thứ ba) khi review → vấn đề bảo mật dữ liệu/đồng ý của khách hàng & cô lập theo project. _(Data Inconsistency/Leakage)_
- `[MEDIUM]` **Bản clone repo tạm** trên máy bot không được dọn → tồn dữ liệu nhạy cảm. Cần xoá sau xử lý.
- `[MEDIUM]` Lịch sử review/log chứa trích đoạn code nhạy cảm — cần kiểm soát lưu trữ & truy cập.

# Rủi Ro Bảo Mật

- `[CRITICAL]` Admin UI chứa secret + đăng nhập bằng PAT → nếu thiếu kiểm soát quyền/transport (HTTPS) là lỗ hổng nghiêm trọng. → `/tn-bao-mat`.
- `[CRITICAL]` Mọi người trong workspace ra lệnh được → kẻ xấu trong workspace có thể trigger review trên project bất kỳ, đọc thông tin chéo & đốt token Claude. _(Authorization)_
- `[HIGH]` Slack request **chưa xác thực signature** → giả mạo event. Cần verify Slack signing secret.
- `[HIGH]` Injection qua nội dung lệnh / nội dung PR vào prompt skill (prompt injection) → kết quả review bị thao túng.
- `[MEDIUM]` Lộ secret qua log/thông báo lỗi.

# Rủi Ro Đồng Thời

- `[HIGH]` **Double-submit** cùng PR → chạy trùng, tốn token, kết quả đua nhau ghi vào thread. Cần khoá/idempotency theo (project, PR, commit).
- `[HIGH]` Nhiều lệnh đồng thời nhiều project → cần hàng đợi/worker pool có giới hạn, cô lập token theo project, tránh cạn tài nguyên.
- `[MEDIUM]` Sửa cấu hình project ở Admin UI **trong lúc** một review đang chạy → review dùng cấu hình cũ hay mới? Cần snapshot cấu hình lúc nhận lệnh.

# Rủi Ro Mở Rộng

- `[HIGH]` **Multi-tenant từ đầu**: nhiều project/nhiều khách hàng, mỗi project token+PAT riêng — thiết kế registry & cô lập secret/chi phí phải sẵn cho mở rộng. _(Scalability)_
- `[MEDIUM]` Một project nhiều repo / mono-repo / nhiều nhánh — i-001 giới hạn 1 project ↔ 1 repo; cần đường mở rộng.
- `[MEDIUM]` Khối lượng PR tăng → cần scale worker, kiểm soát chi phí token, hàng đợi.
- `[LOW]` Mở rộng nguồn khác (GitHub/GitLab) sau này — nên trừu tượng hoá "VCS provider".

# Các Câu Hỏi Cần Làm Rõ

> Các câu chặn đã được giải quyết qua AskUserQuestion. Các mục dưới đây là **giả định tường minh** / câu hỏi **không chặn**, sẽ được chốt ở `/tn-thiet-ke` và `/tn-bao-mat`:

1. **(→ thiết kế)** Cơ chế chạy skill: Claude Agent SDK / Claude Code headless dùng token Claude của project — xác nhận và cách truyền skill `.claude` cho từng repo. *(giả định mục Assumptions #1)*
2. **(→ bảo mật)** "Đăng nhập Admin UI bằng Azure PAT" + phân quyền theo chủ sở hữu — **danh tính chủ sở hữu** suy ra từ đâu cho ổn định (Azure user id/email, không dùng chuỗi PAT vì PAT xoay vòng)? Có cần allowlist người được phép tạo project không, hay bất kỳ PAT hợp lệ đều tạo & sở hữu project riêng? *(HIGH — Phân quyền)*
8. **(→ nghiệp vụ)** Xung đột phạm vi: Admin UI cô lập theo chủ sở hữu, nhưng Slack cho **mọi người review mọi project** → người ngoài vẫn xem được kết quả review (code/tài liệu). Có chấp nhận không, hay giới hạn review theo owner/kênh? *(HIGH — SoD/Data Leakage)*
9. **(→ nghiệp vụ)** Phạm vi **duy nhất tên project**: toàn hệ thống hay theo từng chủ sở hữu? Ảnh hưởng cách Slack resolve `<project>` → repo (nếu trùng tên giữa các owner).
10. **(→ thiết kế)** Danh sách **model + effort** được phép và **giá trị mặc định**; cách cập nhật khi Anthropic ra model mới.
3. **(→ bảo mật)** Thuật toán/cơ chế mã hoá secret at-rest & quản lý master key (env / KMS / vault). *(CRITICAL — Rủi ro dữ liệu)*
4. **(→ nghiệp vụ/thiết kế)** Bảng mapping chi tiết loại file → skill (extension/đường dẫn), xử lý file đa-skill và file không khớp.
5. **(→ thiết kế)** Định nghĩa chính thức "tài liệu hệ thống" (thư mục/định dạng) và cách hợp nhất nguồn-trong-repo + nguồn-bổ-sung-cấu-hình.
6. **(→ thiết kế)** Giới hạn an toàn: số file/dòng diff/token tối đa mỗi PR; rate-limit chống lạm dụng; định dạng & rút gọn output Slack.
7. **(→ nghiệp vụ)** Dữ liệu nhạy cảm khách hàng đi qua Claude (bên thứ ba) — có cần đồng ý/ràng buộc hợp đồng theo project không?

# Đề Xuất Cải Tiến

- `[Cao]` Coi **skill `.claude` là dependency có version**; ghi version skill vào mỗi báo cáo review để truy vết.
- `[Cao]` **Idempotency theo (project, PR, commit hash)** + chống double-submit ngay từ thiết kế.
- `[Trung bình]` **Rate-limit & quota token** theo project/người để kiểm soát chi phí (vì mọi người trong workspace ra lệnh được).
- `[Trung bình]` **Test-connection** khi nhập token/PAT ở Admin UI; secret **write-only** (không hiển thị lại).
- `[Trung bình]` Lưu **audit log + lịch sử review** (không chứa secret) để truy vết và tránh chạy lại.
- `[Thấp]` Lệnh phụ `help`/`status`/`cancel` để cải thiện UX.
- `[Thấp]` Trừu tượng hoá "VCS provider" để sau mở rộng GitHub/GitLab.
