---
integration: i-002
feature: review-pr-slack-azure
stage: frd
status: approved
open_questions: 0
updated: 2026-06-30
---

# Tóm Tắt Tính Năng

**Thay đổi cách giao kết quả review về Slack** cho tính năng `review-pr-slack-azure` (delta trên i-001). Gồm 3 thay đổi nghiệp vụ:

1. **Giao kết quả dạng file `.md`** (thay vì post text dài trong thread). Khi review xong, bot đính kèm **một file `.md`** chứa toàn bộ nội dung review + **một dòng tóm tắt inline** (đếm finding theo severity + link PR) để xem nhanh. Lý do: review thường rất dài, vượt giới hạn ký tự/block của Slack.
2. **Fallback về chat khi gửi file lỗi**: nếu đính kèm file thất bại (API lỗi/deprecated/thiếu scope/quá giới hạn), bot **tự động fallback** đăng kết quả bằng cách **chia nhỏ message** (mrkdwn, <~3000 ký tự/message) trong thread — không để mất kết quả.
3. **Fan-out + tái dùng kết quả** theo khóa `(projectId, prId, commitHash)`:
   - Nếu **nhiều lệnh review cùng khóa** được gửi từ các nơi khác nhau (channel/thread/DM khác nhau) trong khi job **đang chạy** → mỗi nơi được **ack chờ** và **đăng ký nhận**; khi xong, kết quả (file + tóm tắt) được **fan-out tới TẤT CẢ** nơi đã đăng ký.
   - Nếu khóa đó **đã có review HOÀN TẤT** trong DB → bot **lấy kết quả từ DB trả về ngay** (không chạy lại, tiết kiệm token/thời gian). Có **cú pháp ép chạy lại** (`fresh`/`rerun`) để buộc review mới và tạo bản `supersedes`.

**Phạm vi (in-scope):**
- Thay đổi định dạng output Slack: build file `.md`, upload qua luồng `files.getUploadURLExternal` + `files.completeUploadExternal`; gắn dòng tóm tắt severity + link PR.
- Cơ chế fallback file→chat (chia nhỏ message) khi upload lỗi.
- Mô hình **delivery targets (subscribers)** trên `ReviewJob`: danh sách nơi cần trả kết quả (channel, thread_ts, userId), append khi có lệnh trùng lúc đang chạy.
- **Cache-serve**: trả kết quả từ DB khi khóa đã `completed`; cú pháp `fresh`/`rerun` để bỏ qua cache.
- Trạng thái giao kết quả per-target (đã giao / lỗi giao) để fan-out idempotent, tránh post trùng khi worker reclaim.

**Ngoài phạm vi (out-of-scope) lần này:**
- Thay đổi nội dung/độ sâu review hay cách chọn skill (giữ nguyên i-001).
- Đăng kết quả ngược lên Azure PR (vẫn out-of-scope theo i-001).
- TTL hết hạn cache (người dùng chọn: trả DB không giới hạn thời gian cho cùng commit; làm mới bằng commit mới hoặc lệnh `fresh`).
- Chia sẻ một file vật lý giữa nhiều channel (mỗi target up file riêng — xem giả định).

# Mục Tiêu Nghiệp Vụ

- **Business Goal:** Giao kết quả review dài một cách **đọc-được & không bị Slack cắt**, đồng thời **không lãng phí token** khi nhiều người/nhiều lần hỏi cùng một PR-commit.
- **Business Value:**
  - Review dài không còn vỡ định dạng/tràn block Slack → reviewer đọc trọn vẹn trong 1 file.
  - Tránh chạy lại review trùng (đốt token Claude) khi đã có kết quả → giảm chi phí, phản hồi tức thì.
  - Nhiều người quan tâm cùng 1 PR đều nhận được kết quả ở đúng nơi họ hỏi → không ai bị "treo" chờ.
- **KPI kỳ vọng:**
  - 0 trường hợp kết quả bị Slack cắt/mất do tràn giới hạn.
  - Tỉ lệ cache-hit (trả từ DB) > 0 với các PR được hỏi lại → token tiết kiệm đo được.
  - Mọi subscriber của một job đều nhận kết quả (tỉ lệ giao thành công ~100%, có fallback).
- **Assumptions (giả định tường minh — chốt cơ chế ở `/tn-thiet-ke`, `/tn-bao-mat`):**
  1. **Upload file Slack dùng luồng mới** `files.getUploadURLExternal` + `files.completeUploadExternal` (vì `files.upload` đã bị khai tử — xem Rules CLAUDE.md i-001). Cần scope `files:write`. *(giả định — xác nhận ở thiết kế)*
  2. **Khóa "cùng 1 yêu cầu" = `(projectId, prId, commitHash)`** (commit-aware). Commit mới ⇒ review mới, không tái dùng kết quả commit cũ. *(người dùng chốt)*
  3. **Cache-serve chỉ áp dụng khi job gần nhất của khóa có `status=completed`.** Nếu job gần nhất `failed` → coi như chưa có kết quả hợp lệ, chạy review mới. *(giả định — tránh trả lỗi cũ như "kết quả")*
  4. **Cú pháp ép chạy lại**: thêm từ khóa cuối lệnh, vd `@tieu-nhi LMS review <link> fresh` (hoặc `rerun`). Từ khóa chính xác chốt ở thiết kế. *(giả định)*
  5. **File `.md` dùng Markdown chuẩn** (file đính kèm, không phải tin nhắn) — chỉ **dòng tóm tắt inline** mới phải chuẩn hoá mrkdwn Slack (`*đậm*`, không `#`/`**`). *(giả định)*
  6. **Mỗi delivery target up file riêng** (mỗi channel/thread một lần upload + share). *(giả định — Slack chia sẻ file chéo kênh phức tạp)*
  7. **Fan-out tới mọi nơi đã hỏi** nhất quán với quyết định i-001 "mọi người trong workspace đều review được" — không thêm ràng buộc quyền mới ở i-002. *(kế thừa i-001)*

# Luồng Chính

1. Người dùng gõ `@tieu-nhi LMS review <link-PR>` (tuỳ chọn kèm `fresh`).
2. Bot ack < 3s, parse lệnh, resolve project + PR + **commit hiện tại** → khóa `(projectId, prId, commitHash)`.
3. Bot tra DB theo khóa:
   - **3a. Đã `completed` & không có `fresh`** → lấy kết quả từ DB, build file `.md` + dòng tóm tắt, **giao tới nơi vừa hỏi** (cache-serve). Kết thúc.
   - **3b. Đang `queued/running`** → ack "đang review, sẽ trả kết quả tại đây", **đăng ký nơi hỏi vào danh sách delivery targets** của job. Kết thúc (chờ worker fan-out).
   - **3c. Chưa có / job gần nhất `failed` / có `fresh`** → enqueue job mới (nếu `fresh` trên job đã completed: tạo job mới, đánh dấu `supersedes` bản cũ), khởi tạo delivery targets = [nơi vừa hỏi].
4. Worker chạy review (như i-001), tổng hợp finding, **lưu history DB trước khi giao** (ADR-010 i-001).
5. Worker build **file `.md`** (toàn bộ review) + **dòng tóm tắt** (đếm severity + link PR + commit).
6. Worker **fan-out**: với MỖI delivery target chưa được giao:
   - Upload file `.md` qua luồng external → share vào channel/thread của target, kèm dòng tóm tắt.
   - **Nếu upload lỗi** → **fallback**: chia nhỏ nội dung review thành nhiều message mrkdwn (<~3000 ký tự) post trong thread của target.
   - Đánh dấu target = `delivered` (idempotent: không giao lại nếu đã delivered).
7. (Tuỳ chọn) react ✅ ở mỗi nơi đã giao.

# Luồng Thay Thế

- **Cache-hit nhưng người hỏi muốn bản mới** (`fresh`/`rerun`) → bỏ qua cache, chạy review mới, supersedes bản cũ.
- **Lệnh trùng lúc đang chạy nhưng cùng channel+thread đã đăng ký** → không đăng ký trùng target; chỉ ack lại (idempotent subscriber).
- **Review đủ ngắn để vừa Slack** → vẫn đính kèm file `.md` (người dùng chọn "luôn file .md + tóm tắt"); không có nhánh "post thẳng chat khi ngắn".
- **Fan-out giữa chừng có thêm lệnh trùng** (đăng ký sau khi worker bắt đầu giao) → target mới vẫn được giao ở vòng quét tiếp theo / hoặc cache-serve nếu job đã completed lúc đăng ký.

# Luồng Ngoại Lệ

- **Upload file lỗi** (deprecated/thiếu scope/quá giới hạn/timeout/5xx) → fallback chia nhỏ chat; nếu **cả file và chat đều lỗi** → đánh dấu target `delivery_failed`, log + (tuỳ chọn) báo lỗi ngắn trong thread, không nuốt lặng.
- **Job gần nhất của khóa `failed`** → không cache-serve; chạy review mới.
- **DB không truy được lúc tra cache** → coi như cache-miss, xử lý như job mới (không chặn người dùng); hoặc báo lỗi tạm thời nếu cả enqueue cũng fail.
- **Worker reclaim job đã giao một phần** (crash giữa fan-out) → chỉ giao tiếp target chưa `delivered`, không post trùng cho target đã giao.
- **Delivery target không còn hợp lệ** (channel đã xoá, bot bị kick, thread không tồn tại) → đánh dấu target lỗi, bỏ qua, không chặn các target khác.
- **`fresh` được gửi khi job cùng khóa đang chạy** → coi job đang chạy đã là "bản mới"; không chạy thêm bản trùng, chỉ đăng ký target + ack.

# Logic Còn Thiếu

- `[HIGH]` **Quy tắc cache-serve khi có NHIỀU job completed cùng khóa** (do từng `fresh` nhiều lần): phải trả **bản mới nhất không bị superseded**; cần định nghĩa rõ thứ tự ưu tiên. _(Business Rules Analysis)_
- `[HIGH]` **Định nghĩa "completed" hợp lệ để cache-serve**: review mà MỌI skill đều fail (theo Rules i-001) có tính là completed không? Đề xuất: KHÔNG cache-serve job không có finding hợp lệ do lỗi toàn phần. _(Business Rules Analysis)_
- `[MEDIUM]` **Nội dung & cấu trúc file `.md`**: thứ tự section (tóm tắt → finding theo severity → theo file/skill → metadata commit/skillVersion), header, footer. _(Scope Modelling)_
- `[MEDIUM]` **Quy tắc đặt tên file** `.md` (vd `review-<project>-PR<id>-<commit8>.md`) để truy vết & tránh trùng. _(Interface Analysis)_
- `[MEDIUM]` **Ngưỡng & cách chia nhỏ khi fallback chat** (tách theo finding/section, không cắt giữa câu; giới hạn số message để tránh spam thread). _(Interface Analysis)_
- `[MEDIUM]` **Thời điểm "giao" trong cache-serve có cần lưu lại như một delivery mới** vào history không (để audit ai đã nhận lại). _(Process Analysis)_
- `[LOW]` Lệnh phụ để xem lại kết quả cũ (vd `last`/`history`) — chưa thuộc i-002.

# Business Rule Còn Thiếu

- `[HIGH]` **Cache-serve = chỉ đọc, không tạo job mới**: lệnh trùng trên khóa đã completed KHÔNG tốn token (không gọi Claude). Phải đảm bảo đây là rule cứng. _(Business Rules Analysis)_
- `[HIGH]` **Fan-out idempotent**: mỗi (job, target) chỉ giao **đúng 1 lần** kết quả thành công; chống post trùng khi reclaim/retry. _(Business Rules Analysis)_
- `[MEDIUM]` **`fresh` chỉ áp dụng cho job đã completed/failed**; nếu đang chạy thì không nhân đôi (xem luồng ngoại lệ).
- `[MEDIUM]` **Quyền dùng `fresh`**: mọi người (kế thừa i-001) hay chỉ owner project? Đề xuất kế thừa "mọi người review được" nhưng cân nhắc chống lạm dụng token (rate-limit i-001 vẫn áp dụng). _(SoD / cost control)_
- `[MEDIUM]` **Một target = (channel, thread_ts) duy nhất**; cùng thread hỏi nhiều lần không nhân bản giao.
- `[LOW]` Ngôn ngữ/format dòng tóm tắt (severity emoji, thứ tự) thống nhất với i-001.

# Validation Còn Thiếu

- `[MEDIUM]` Validate **file `.md` không rỗng / không vượt giới hạn kích thước file Slack** trước khi upload; nếu vượt → cắt/chia hoặc fallback. _(Interface)_
- `[MEDIUM]` Validate **từ khóa `fresh`/`rerun`** parse đúng (không nhầm với phần của link/tham số); normalize khoảng trắng. _(Interface)_
- `[MEDIUM]` Validate **commitHash resolve được** tại thời điểm enqueue (PR có commit hợp lệ) trước khi tạo/khớp khóa. _(Data)_
- `[LOW]` Validate delivery target hợp lệ (channel id, thread_ts định dạng đúng) trước khi lưu.

# Phân Quyền Còn Thiếu

- `[HIGH]` **Fan-out tới nơi khác có thể lộ kết quả review (trích đoạn code/tài liệu) cho người ở channel/thread đó.** Kế thừa rủi ro i-001 (#8: mọi người review/xem được), nhưng i-002 **mở rộng bề mặt**: kết quả nay tới NHIỀU nơi cùng lúc. Cần xác nhận không vượt phạm vi quyền i-001. _(Data Leakage / SoD)_
- `[MEDIUM]` **Cache-serve cho người KHÁC owner**: người B hỏi lại PR của project người A và nhận kết quả từ DB → nhất quán với i-001 "mọi người review được", nhưng ghi nhận là điểm lộ dữ liệu chéo. _(Data Leakage)_
- `[MEDIUM]` Ai được phép `fresh` (đốt token) — xem Business Rule trên. _(Cost / Authorization)_

# Trạng Thái Còn Thiếu

- `[HIGH]` **Trạng thái giao per-target**: `pending → delivered | delivery_failed` (+ retry). Cần để fan-out idempotent & quan sát được. _(State Machine)_
- `[MEDIUM]` **Trạng thái job bổ sung cho cache**: phân biệt `completed-có-finding-hợp-lệ` vs `completed-lỗi-toàn-phần` (chỉ bản đầu mới cache-serve được). _(State Machine)_
- `[MEDIUM]` **Trạng thái `superseded`** của job cũ khi `fresh` → UI/cache chỉ trả bản mới nhất. (i-001 đã nêu `supersedes` ở mức MEDIUM — i-002 dùng thực sự.) _(State Machine)_
- `[LOW]` Trạng thái file `.md` đã build (cache artifact) để fan-out nhiều target không build lại nhiều lần.

# Thông Báo Còn Thiếu

- `[HIGH]` **Ack "đang chạy, sẽ trả kết quả tại đây"** cho lệnh trùng lúc job đang chạy (subscriber) — phải rõ ràng để người dùng không gõ lại. _(Notification)_
- `[MEDIUM]` **Thông báo khi fallback file→chat** (vd "⚠️ không gửi được file, gửi dạng chat") để người dùng hiểu vì sao định dạng khác. _(Notification)_
- `[MEDIUM]` **Thông báo khi cache-serve** ("📄 kết quả review đã có từ trước, lúc <time>, commit <hash>") để người dùng biết đây là kết quả cũ chứ không phải chạy mới; gợi ý `fresh` nếu muốn mới. _(Notification)_
- `[MEDIUM]` **Thông báo lỗi giao** khi cả file lẫn chat fail (không nuốt lặng — Rule i-001). _(Notification)_

# Audit Còn Thiếu

- `[MEDIUM]` **Audit mỗi lần giao kết quả** (job, target, kiểu giao: file/chat-fallback/cache-serve, thành công/lỗi, thời điểm) — phục vụ truy vết "ai đã nhận kết quả nào ở đâu". _(Process Analysis)_
- `[MEDIUM]` **Audit cache-hit vs run mới** để đo token tiết kiệm (KPI) và phát hiện lạm dụng `fresh`. _(Process Analysis)_
- `[LOW]` Lưu artifact file `.md` (hoặc tái dựng từ history) để giao lại nhất quán giữa các target/lần hỏi.

# Edge Cases

| Edge Case | Kỳ vọng xử lý | Mức rủi ro |
| --------- | ------------- | ---------- |
| Upload file lỗi (deprecated/thiếu scope/timeout) | Fallback chia nhỏ chat mrkdwn trong thread | `[HIGH]` |
| Cả file lẫn chat fallback đều lỗi | Đánh dấu `delivery_failed`, log + báo lỗi ngắn, không nuốt lặng | `[HIGH]` |
| Nhiều lệnh cùng khóa lúc đang chạy (nhiều channel/thread) | Ack chờ + đăng ký target; fan-out tới tất cả khi xong | `[HIGH]` |
| Worker crash giữa fan-out (đã giao 1 phần) | Reclaim → chỉ giao target `pending`, không post trùng target `delivered` | `[HIGH]` |
| Lệnh trùng cùng channel+thread lúc đang chạy | Không đăng ký target trùng; chỉ ack lại | `[MEDIUM]` |
| Khóa đã completed, người khác hỏi lại (không `fresh`) | Cache-serve từ DB, không tốn token, kèm chú thích "kết quả cũ" | `[MEDIUM]` |
| Job gần nhất của khóa `failed` | Không cache-serve; chạy review mới | `[HIGH]` |
| `fresh` trên khóa đã completed | Chạy review mới, đánh dấu supersedes bản cũ | `[MEDIUM]` |
| `fresh` lúc job cùng khóa đang chạy | Không nhân đôi job; đăng ký target + ack | `[MEDIUM]` |
| File `.md` vượt giới hạn kích thước file Slack | Cắt/chia hoặc fallback chat; không để upload fail câm | `[MEDIUM]` |
| Review rỗng (PR không file thay đổi) | Thông báo "không có gì review", không tạo file rỗng | `[LOW]` |
| Commit mới push sau khi đã completed (khóa cũ) | Lệnh mới resolve commit mới → khóa mới → review mới | `[MEDIUM]` |
| Bot bị kick khỏi channel của 1 target | Bỏ qua target đó, giao các target còn lại | `[MEDIUM]` |
| Nhiều `fresh` liên tiếp cùng khóa | Mỗi lần tạo job mới supersedes; rate-limit i-001 áp dụng chống đốt token | `[MEDIUM]` |
| Dòng tóm tắt inline chứa ký tự mrkdwn | Chuẩn hoá mrkdwn (`*đậm*`, không `#`/`**`) — Rule i-001 | `[LOW]` |

# Ảnh Hưởng Tính Năng Khác

- `[HIGH]` **Thay đổi hành vi i-001**: ADR-007 i-001 hiện **TỪ CHỐI** lệnh trùng lúc đang chạy ("đang chạy"). i-002 **đổi sang đăng ký + fan-out**. Đây là **conflict/override** trực tiếp — phải cập nhật ADR và logic dedup. _(Business Conflict)_
- `[MEDIUM]` **Override output Slack i-001**: i-001 nêu "tóm tắt + đính kèm snippet/file khi dài" (có điều kiện); i-002 chuyển sang **luôn file `.md`** + tóm tắt. Cập nhật mô tả output. _(Domain Conflict nhẹ)_
- `[LOW]` `supersedes` (i-001 mức MEDIUM, "cần đánh dấu") nay được **kích hoạt thật** bởi `fresh` — không mâu thuẫn, là hiện thực hoá.

# Ảnh Hưởng Component Dùng Chung

| Component dùng chung | Tính năng bị ảnh hưởng | Regression Risk |
| -------------------- | ---------------------- | --------------- |
| Slack Gateway (post/ack/parse) | Thêm parse `fresh`, ack subscriber, upload file, fallback chat | `[HIGH]` |
| Slack file upload (luồng external mới) | Mọi lần giao kết quả | `[HIGH]` (API deprecated nếu dùng sai) |
| ReviewJob model (DB) | Thêm `deliveryTargets[]` + trạng thái giao + `supersedes` thực | `[HIGH]` |
| Dedup/idempotency logic (ADR-007) | Đổi reject → subscribe; cache-serve | `[HIGH]` |
| Review history / read model | Cache-serve đọc lại; phân biệt completed hợp lệ | `[MEDIUM]` |
| Worker fan-out loop | Giao nhiều target idempotent | `[HIGH]` |

# Rủi Ro Dữ Liệu

- `[HIGH]` **`deliveryTargets[]` phình** nếu một PR "hot" bị hỏi rất nhiều lần lúc đang chạy → giới hạn/độ dài hợp lý; dedup theo (channel, thread). _(Data growth)_
- `[MEDIUM]` **Trạng thái giao không nhất quán** (đánh dấu delivered nhưng post thực tế fail, hoặc ngược lại) → cần ghi trạng thái sau khi xác nhận API thành công. _(Data Inconsistency)_
- `[MEDIUM]` **Cache-serve trả kết quả cho commit cũ** mà người dùng tưởng là code hiện tại → giảm thiểu bằng chú thích commit/thời điểm + gợi ý `fresh`. _(Stale data)_
- `[MEDIUM]` **Lưu file `.md`/nội dung review chứa trích đoạn code nhạy cảm** ở nhiều nơi (DB + nhiều channel Slack) → mở rộng bề mặt lưu trữ dữ liệu nhạy cảm (kế thừa rủi ro i-001). _(Data Leakage)_

# Rủi Ro Bảo Mật

- `[HIGH]` **Fan-out mở rộng bề mặt lộ dữ liệu**: kết quả review (code/tài liệu private) được đẩy tới nhiều channel/thread/DM cùng lúc — kẻ xấu có thể "đăng ký" để hứng kết quả PR người khác. Cần đánh giá ở `/tn-bao-mat` (kế thừa #8 i-001). _(Authorization / Data Leakage)_
- `[MEDIUM]` **`fresh` đốt token** → lạm dụng chi phí; rate-limit/quota i-001 phải bao phủ cả `fresh`. _(DoS / Cost)_
- `[MEDIUM]` **Scope Slack token rộng thêm** (`files:write`) → nguyên tắc least-privilege; bảo vệ token. _(Secret management)_
- `[LOW]` Nội dung tóm tắt/lỗi không được lộ secret/stacktrace (Rule i-001).

# Rủi Ro Đồng Thời

- `[HIGH]` **Race khi 2 lệnh cùng khóa enqueue đồng thời**: phải atomic — một bên tạo job, bên kia trở thành subscriber (không tạo 2 job). Dùng upsert/atomic trên unique key + append target. _(Race condition)_
- `[HIGH]` **Race fan-out vs đăng ký muộn**: target đăng ký ngay khi worker đang giao → phải đảm bảo target mới hoặc được giao ở vòng quét sau, hoặc cache-serve khi job đã completed (không bị "rơi"). _(Lost update)_
- `[MEDIUM]` **Double-delivery khi reclaim** job đang fan-out → trạng thái per-target + cập nhật atomic chống giao trùng. _(Double-submit/delivery)_
- `[MEDIUM]` **Cache-serve đọc job lúc nó vừa chuyển trạng thái** (đang chạy → completed) → đọc nhất quán để không vừa subscribe vừa miss kết quả. _(Read consistency)_

# Rủi Ro Mở Rộng

- `[MEDIUM]` **PR "hot" nhiều subscriber** → fan-out tuần tự có thể chậm; cân nhắc giới hạn/ batch khi số target lớn. _(Scalability)_
- `[MEDIUM]` **Nhiều bản `fresh`/supersedes** tích luỹ → history phình; cần retention/đánh dấu bản mới nhất hiệu quả (index). _(Scalability)_
- `[LOW]` Artifact file `.md` lưu trữ tăng theo số review — cần chính sách dọn/không lưu nếu tái dựng được từ history.

# Các Câu Hỏi Cần Làm Rõ

> Các câu **chặn** đã được giải quyết qua AskUserQuestion (khóa = commit-aware; cache-serve + lệnh `fresh`; luôn file `.md` + tóm tắt; lệnh trùng → đăng ký + fan-out). Các mục dưới là **giả định tường minh / câu hỏi không chặn**, chốt ở `/tn-thiet-ke` & `/tn-bao-mat`:

1. **(→ thiết kế)** Từ khóa ép chạy lại chính xác (`fresh` vs `rerun` vs cờ `--fresh`) và vị trí trong cú pháp lệnh. *(giả định: `fresh` ở cuối)*
2. **(→ thiết kế)** Cấu trúc & quy tắc đặt tên file `.md`; ngưỡng kích thước file Slack & cách xử lý khi vượt.
3. **(→ thiết kế)** Quy tắc chia nhỏ khi fallback chat (tách theo section/finding, giới hạn số message).
4. **(→ thiết kế/bảo mật)** Có lưu artifact file `.md` không, hay luôn tái dựng từ history khi giao lại? (ảnh hưởng lưu trữ dữ liệu nhạy cảm)
5. **(→ bảo mật)** Đánh giá lại bề mặt lộ dữ liệu khi fan-out tới nhiều nơi; có cần giới hạn target theo owner/kênh không (mở rộng #8 i-001)?
6. **(→ thiết kế)** "Completed hợp lệ để cache-serve": loại trừ job lỗi-toàn-phần/0-finding-do-lỗi; định nghĩa chính xác.
7. **(→ thiết kế)** Giới hạn số delivery target / chính sách khi PR hot (batch/throttle fan-out).

# Đề Xuất Cải Tiến

- `[Cao]` **Trạng thái giao per-target + fan-out idempotent** thiết kế ngay từ đầu (chống double-delivery khi reclaim).
- `[Cao]` **Atomic upsert theo khóa** (tạo-job-hoặc-thêm-subscriber) để tránh race tạo 2 job.
- `[Cao]` **Cập nhật ADR-007 i-001**: reject-duplicate → subscribe-and-fanout; ghi rõ override.
- `[Trung bình]` **Chú thích cache-serve** (thời điểm + commit + gợi ý `fresh`) để người dùng phân biệt kết quả cũ.
- `[Trung bình]` **Đo cache-hit & token tiết kiệm** (KPI) + audit `fresh` để kiểm soát lạm dụng.
- `[Trung bình]` **Tái dựng file `.md` từ history** thay vì lưu artifact để giảm bề mặt lưu trữ dữ liệu nhạy cảm (nếu chi phí dựng chấp nhận được).
- `[Thấp]` Lệnh phụ `last`/`history` để chủ động lấy lại kết quả cũ mà không cần gõ lại link.
