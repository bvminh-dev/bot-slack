---
integration: i-001
feature: review-pr-slack-azure
stage: bugfix
status: draft
open_questions: 0
updated: 2026-06-26
---

# Bugfix — Phát hiện từ /tn-review (review-code, 28 khía cạnh)

> Tài liệu trước, sửa sau. Mỗi bug: triệu chứng · root cause · cách sửa · phòng ngừa tái diễn.

## BUG-01 `[HIGH]` Reclaim không có max-attempts → poison job chạy lại vô hạn, đốt token
- **path:** [src/adapters/mongo/reviewJobRepository.ts:46-63](../../../src/adapters/mongo/reviewJobRepository.ts) (`claimNext`) + [src/worker/worker.ts](../../../src/worker/worker.ts)
- **Triệu chứng:** Một job luôn lỗi (vd repo hỏng, PR gây crash) bị reclaim sau mỗi lease timeout và chạy lại mãi mãi → tốn token Claude + chiếm slot worker.
- **Root cause:** `claimNext` `$inc: attempts` nhưng KHÔNG có ngưỡng; không có dead-letter. Khía cạnh #8 Concurrency / #17 Event Processing (poison message).
- **Cách sửa:** Thêm `MAX_ATTEMPTS` (vd 3). Trong `claimNext` chỉ reclaim khi `attempts < MAX_ATTEMPTS`; vượt ngưỡng → chuyển `failed` (dead-letter) + thông báo. Hoặc check ở worker sau khi claim.
- **Phòng ngừa:** Mọi hàng đợi retry phải có max-attempts + dead-letter ngay từ đầu.

## BUG-02 `[HIGH]` IntegrationError tạm thời → job failed vĩnh viễn, không requeue/backoff
- **path:** [src/application/reviewOrchestrator.ts](../../../src/application/reviewOrchestrator.ts) (catch block) + `IntegrationError.retryable`
- **Triệu chứng:** Azure 500/timeout hoặc Claude rate-limit (lỗi tạm thời, `retryable=true`) làm job bị `fail()` ngay, không thử lại — trái test.md Integration "retry/backoff; quá ngưỡng mới fail".
- **Root cause:** Catch gộp mọi lỗi → `fail()`; không phân biệt `IntegrationError.retryable`. `IntegrationError` đã có cờ `retryable` nhưng chưa dùng.
- **Cách sửa:** Trong catch, nếu `err instanceof IntegrationError && err.retryable && job.attempts < MAX_ATTEMPTS` → requeue (set `status:'queued'`, `availableAt = now + backoff`) thay vì fail. Backoff theo `attempts`.
- **Phòng ngừa:** Phân loại lỗi retryable vs permanent ở mọi tích hợp; chỉ fail cứng với lỗi permanent.

## BUG-03 `[MEDIUM]` Re-run sau crash (đã post Slack, chưa complete) → post Slack & history trùng
- **path:** [src/application/reviewOrchestrator.ts](../../../src/application/reviewOrchestrator.ts) (`process`)
- **Triệu chứng:** Worker chết sau khi `postResult`/`save history` nhưng trước `complete()` → job còn `running`, hết lease → reclaim → chạy lại toàn bộ → đốt token lần 2 + post Slack lần 2 + 2 bản history cùng jobId.
- **Root cause:** Pipeline at-least-once nhưng side-effect (Slack post, token) không idempotent theo jobId; history không unique theo jobId.
- **Cách sửa:** Đầu `process`, nếu đã tồn tại history cho `jobId` → coi như hoàn tất, chỉ `complete()` và bỏ qua chạy lại. Hoặc unique index `review_history.jobId` + ghi history sau cùng atomic với complete.
- **Phòng ngừa:** Job có side-effect ngoài DB phải có guard idempotency theo jobId trước khi tái thực thi.

## BUG-04 `[MEDIUM]` Resolve Slack case-insensitive nhưng unique index case-sensitive → trùng tên hoa/thường
- **path:** [src/adapters/mongo/projectRepository.ts:88-96](../../../src/adapters/mongo/projectRepository.ts) (`resolveByNameForSlack`) + [client.ts uniq_project_name](../../../src/adapters/mongo/client.ts)
- **Triệu chứng:** "LMS" và "lms" cùng tạo được (unique index phân biệt hoa-thường), nhưng resolve Slack dùng regex `^name$` opt `i` → `findOne` trả về tuỳ ý 1 trong 2 → review nhầm repo (test.md Edge "2 owner trùng tên LMS"; bảo mật #9 yêu cầu duy nhất toàn hệ thống).
- **Root cause:** Bất nhất giữa uniqueness (case-sensitive) và resolve (case-insensitive).
- **Cách sửa:** Lưu `nameLower` (lowercase) + unique index trên `nameLower`; resolve theo `nameLower` (so khớp chính xác, không regex). Cập nhật existsByName/create/update.
- **Phòng ngừa:** Khi tra cứu case-insensitive, ràng buộc unique cũng phải case-insensitive (cùng chuẩn hoá).

## BUG-05 `[MEDIUM]` `supersedesJobId` không bao giờ được set → history không liên kết bản review lại
- **path:** [src/application/reviewCommandService.ts](../../../src/application/reviewCommandService.ts) (enqueue) + [reviewOrchestrator.ts](../../../src/application/reviewOrchestrator.ts) (`setSnapshot` gọi không truyền supersedes)
- **Triệu chứng:** Review lại cùng PR commit khác/sau → tạo history mới nhưng không trỏ `supersedes` về bản trước (test.md State Transition "Completed mới (supersedes)").
- **Root cause:** Trường `supersedesJobId` khai báo nhưng không có logic tra job/history trước đó để gán.
- **Cách sửa:** Khi enqueue, tra history/job gần nhất của `(projectId, prId)`; nếu có → set `supersedesJobId`. Truyền vào `setSnapshot`.
- **Phòng ngừa:** Field temporal/lineage phải có logic ghi, không để "khai báo suông".

## BUG-06 `[LOW]` parseSkillOutput regex tham lam có thể bắt nhầm nhiều JSON block
- **path:** [src/adapters/skillrunner/skillRunner.ts](../../../src/adapters/skillrunner/skillRunner.ts) (`parseSkillOutput`)
- **Triệu chứng:** `\{[\s\S]*"findings"[\s\S]*\}` greedy → nếu output có nhiều khối JSON, bắt từ `{` đầu tới `}` cuối → JSON.parse fail → rơi về fallback markdown.
- **Cách sửa:** Tìm khối JSON cuối/đúng (vd lấy từ dòng có `"findings"` ngược về `{` gần nhất) hoặc yêu cầu CLI bọc kết quả trong delimiter cố định.
- **Phòng ngừa:** Parse output máy nên dựa delimiter rõ ràng, tránh regex tham lam.

# Bugfix — đợt 2 (/tn-review lần 3, 2026-06-26, sau khi dựng auto-test 3 tầng)

## BUG-07 `[LOW]` (F-1) login PAT sai trả HTTP 400 thay vì 401
- **path:** [src/application/identityService.ts:23](../../../src/application/identityService.ts) (`login`) + [src/api/middleware.ts:64](../../../src/api/middleware.ts) (errorHandler `ValidationError → 400`)
- **Triệu chứng:** `POST /api/v1/auth/login` với PAT sai/hết hạn trả **400 Bad Request**; thiết kế TC-10/FT-06/Permission Matrix quy ước **401 Unauthorized**. Phát hiện khi viết functional test FT-06 (expected 401, actual 400).
- **Root cause:** `login()` để lọt `ValidationError` từ `azure.verifyPatIdentity` ra ngoài; `errorHandler` map `ValidationError → 400`. Credential sai bị phân loại nhầm là "request không hợp lệ" thay vì "chưa xác thực". Khía cạnh #19 Authentication / #11 API (error handling).
- **Cách sửa (khu trú):** Trong `login()`, bọc lời gọi `verifyPatIdentity` bằng try/catch; lỗi xác thực PAT → ném `AuthError` (→401), message chung không lộ chi tiết. KHÔNG đổi kiểu lỗi gốc của `verifyPatIdentity` (vì `testConnection` bắt lỗi generic, không phụ thuộc kiểu) → không ảnh hưởng `registryService.testConnection`. Không breaking UI (api.ts chỉ đọc `error` message, không rẽ theo status).
- **Phòng ngừa:** Lỗi credential (login/PAT/token sai-hết hạn) phải map về 401, KHÔNG để rơi vào 400 (ValidationError) — service login phải dịch lỗi xác thực hệ ngoài sang `AuthError`.

## BUG-08 `[MEDIUM]` Không ghi audit cho login THẤT BẠI (mù trước brute-force PAT)
- **path:** [src/application/identityService.ts:31](../../../src/application/identityService.ts) (`login` chỉ append audit khi thành công)
- **Triệu chứng:** Chỉ login thành công được `auditRepository.append('login')`. Login thất bại (PAT sai/hết hạn) không để lại vết → security monitoring (FRD Audit HIGH) không phát hiện được dò/brute-force PAT.
- **Root cause:** Audit đặt sau `verifyPatIdentity` thành công; nhánh lỗi không audit.
- **Cách sửa (đề xuất):** Append audit `action: 'login.failed'` (KHÔNG log PAT) ở nhánh lỗi trước khi ném `AuthError`. Cần khoá audit không định danh ownerId (chưa biết owner) → ghi theo IP/thời điểm.
- **Trạng thái:** **GHI NHẬN — chưa sửa trong đợt này.** Thuộc nhóm "audit/anomaly detection" còn là khoảng trống trong test.md & FRD (#token anomaly). Đề xuất gom vào 1 integration audit riêng để định nghĩa schema audit-fail + ngưỡng anomaly cùng lúc.

# Tóm tắt mức độ
- HIGH: BUG-01, BUG-02 (đốt token / mất khả năng retry).
- MEDIUM: BUG-03 (trùng side-effect), BUG-04 (resolve nhầm repo), BUG-05 (lineage), **BUG-08 (audit login-fail)**.
- LOW: BUG-06 (parser), **BUG-07/F-1 (401 vs 400)**.
- KHÔNG phát hiện: CRITICAL (transaction boundary, cross-tenant leak — tenant isolation ép `ownerId` ở repository đã đúng; secret write-only/redaction đúng).

# Trạng thái sửa
- Đợt 1 (review lần 2): sửa BUG-01, BUG-02, BUG-03, BUG-04, BUG-05 (code).
- Đợt 2 (review lần 3): **sửa BUG-07/F-1** (code + cập nhật assertion FT-06 về 401).
- Hạ ưu tiên/ghi nhận: BUG-06 (sửa kèm khi tối ưu parser), **BUG-08 (gom vào integration audit riêng)**.
</content>
