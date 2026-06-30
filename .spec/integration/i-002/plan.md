---
integration: i-002
feature: review-pr-slack-azure
stage: plan
status: approved
open_questions: 0
updated: 2026-06-30
---

# Tổng Quan & Phạm Vi

Hiện thực delta **cách giao kết quả review** về Slack (bám `frd.md` i-002), gồm 3 nhóm:
1. **Output file `.md` + tóm tắt inline** (ADR-012); **fallback chunk chat** khi upload lỗi.
2. **Fan-out** theo khóa `(projectId,prId,commitHash)` (ADR-013/016): lệnh trùng lúc đang chạy → đăng ký delivery target + ack chờ; xong → giao tới mọi target, **idempotent per-target**; **atomic upsert** enqueue-or-subscribe.
3. **Cache-serve** từ History (ADR-014/015): khóa đã `completed` hợp lệ → trả ngay (0 token); `fresh`/`rerun` ép chạy lại (`supersedes`).

Kèm cross-cutting: redaction secret + neutralize mention, `authorizeReviewCommand` mọi entrypoint, rate-limit gồm `fresh`, audit/metrics, Admin UI hiển thị deliveries/superseded/cache-hit, và **cập nhật regression i-001** (reject-duplicate → subscribe; output → file `.md`).

**Ngoài phạm vi:** đổi nội dung/độ sâu review hay chọn skill; TTL cache; lưu artifact `.md` (ADR-015 dựng từ History).

# Danh Sách Task

| Task | Mô tả | Phụ thuộc | Tham chiếu (frd/tech/security/test) | Tiêu chí Done |
|------|-------|-----------|--------------------------------------|----------------|
| **T1** | **Config & hằng số** (fail-safe defaults): bộ pattern redaction (`sk-ant-`, `AKIA`, `password=`, `.env` value…), `slackFileSizeLimit`, `deliveryTargetCap=50`, từ khoá `fresh|rerun`, bật rate-limit-fresh | — | tech ADR-012/013; sec Misconfig (fail-safe); test Khoảng trống (redaction/file-size) | Config nạp được, có default an toàn (không trống = vô hạn); tài liệu hoá giá trị |
| **T2** | **Mở rộng model `ReviewJob`** + Mongo: `deliveryTargets[]` (`{channel,threadTs,userId,status,mode,deliveredAt,error}`), `supersedesJobId`/`supersededByJobId`, `cacheEligible` (dẫn xuất); index `(projectId,prId,commitHash,status,completedAt)` + `supersededByJobId`; đọc job cũ an toàn (migration) | — | tech Aggregate, ADR-013/014/016; test FT-219, State Transition | Schema + index tạo; doc job i-001 cũ đọc không lỗi; unit serialize/deserialize ok |
| **T3** | **Builders/utils thuần**: `buildMarkdownReport`, `buildReportFilename`+`sanitizeFilename`, `buildSummaryLine` (mrkdwn-safe), `redactSecrets`, `neutralizeMentions`, `chunkMrkdwn`, `isFileWithinSlackLimit`, `buildStaleNote` | T1 | frd in-scope 1/2; tech ADR-012/015; sec Data Protection/Injection; test UT-201..207,217,218 | UT-201..207, UT-217, UT-218 PASS |
| **T4** | **Logic định tuyến/cache thuần**: `parseFreshFlag`, `routeCommand` (R1–R6), `isCacheEligible`, `selectLatestNonSuperseded`, `dedupTarget`, `withinTargetCap`, `buildIdempotencyKey` commit-aware, `pickDeliveryMode`, `targetStatusTransition` | T1 | tech ADR-013/014/016; test Decision Table, UT-208..216 | UT-208..216 PASS (gồm route R1–R6) |
| **T5** | **`ISlackPort` mở rộng** (ACL): `uploadMarkdown` (getUploadURLExternal→PUT→completeUploadExternal), `postChunked`, `postSummary`; chỉ "thành công" sau `completeUploadExternal` OK; scope `files:write` | T1 | tech Integration, ADR-011/012; sec Encryption (TLS)/Secret(token); test API TC, FT-211/215 | Adapter + test mock 2-bước; lỗi giữa 2 bước = chưa giao |
| **T6** | **EnqueueOrSubscribe** (atomic upsert): route enqueue / register-target / cache-serve theo trạng thái khóa; idempotent theo `(key,channel,thread)` (Slack-retry) | T2, T4 | tech ADR-013, Event Storming; test FT-201/202/214, TC-206/218 | FT-201, FT-202, FT-214 PASS |
| **T7** | **ReviewResultQuery** (cache-serve read): lấy bản completed hợp lệ mới nhất chưa superseded; dựng report (T3) + stale note; **0 token** (không gọi Claude) | T2, T3, T4 | tech ADR-014/015, SoT; sec Data Protection (redact đường cache); test FT-205/206/207, TC-207..209 | FT-205, FT-206, FT-207 PASS (spy Claude không gọi) |
| **T8** | **`fresh`/`rerun`**: bypass cache → enqueue job mới `supersedes` bản cũ (set `supersededByJobId`); `fresh` lúc đang chạy → register (không nhân đôi) | T2, T6 | tech ADR-014; test FT-208/209, TC-210/211 | FT-208, FT-209 PASS; lineage ghi thực |
| **T9** | **FanoutDeliverer**: lặp target `pending` → `uploadMarkdown`→fallback `postChunked`→`delivery_failed`; cập nhật status **atomic** (arrayFilters status=pending) → reclaim không double; 429 `Retry-After`; bot-kick skip; không nuốt lặng | T2, T3, T5 | frd Luồng chính 6 + Ngoại lệ; tech ADR-013, Integration Failure; sec IR; test FT-203/204/211/212/213/215, TC-202..205,217,219 | FT-203/204/211/212/213/215 PASS |
| **T10** | **Slack Gateway**: parse `fresh`; nối routing (T6); ack subscriber ("đang chạy, trả tại đây"), chú thích cache-serve & fallback | T4, T6 | frd Thông báo; tech API Review; test TC-204/207, Negative (flag) | Parse + 3 loại ack đúng; lệnh cũ không vỡ |
| **T11** | **Authorization & rate-limit**: `authorizeReviewCommand` áp cho review+subscribe+cache-serve+`fresh`; target lấy từ **event đã verify**; rate-limit gồm `fresh` | T6, T7, T8 | sec Authorization/Permission/STRIDE; test FT-216/218, Permission Matrix | FT-216, FT-218 PASS (bypass bị chặn) |
| **T12** | **Audit & Observability**: audit delivery/cache-hit/rerun/redaction (không log nội dung/secret); metrics `cache_hit/tokens_saved/fanout_count/delivery_by_mode/rerun_count`; alert `delivery_failed`/spike `fresh`; correlationId→targetId | T7, T8, T9 | sec Audit/Monitoring; tech Observability; test FT-220 | FT-220 PASS; metrics phát ra; alert cấu hình |
| **T13** | **Admin API** `/reviews`: thêm `deliveries[]`+`supersededByJobId`, owner-scoped, không serialize PII/secret thừa | T2 | tech API Review; sec API3/Data Leakage; test FT-219, API TC | FT-219 PASS; 404 cross-owner giữ nguyên |
| **T14** | **Admin UI**: badge giao theo target, danh sách targets, badge superseded + link bản mới, chỉ báo cache-hit, nút xem report, filter — đúng `data-testid` | T13 | test E2E Locators, E2E-204..207 | E2E-204..207 PASS (locator khớp) |
| **T15** | **Regression i-001**: đổi hành vi lệnh trùng reject→subscribe (TC-16/FT-16/E2E-07); output tóm-tắt+đính-kèm → **luôn file `.md`** (TC-01); cập nhật/â test liên quan | T6, T9 | frd Ảnh hưởng; tech (override ADR-007); test Regression Risks | Test i-001 bị ảnh hưởng cập nhật & xanh; không vỡ luồng cũ |
| **T16** | **E2E luồng Slack (không-DOM)** + nghiệm thu: fan-out (E2E-201), cache-serve (E2E-202), fallback+reclaim (E2E-203) | T6,T7,T9,T10,T11 | test E2E-201/202/203, SC-2.* | E2E-201/202/203 PASS |

# Đồ Thị Phụ Thuộc

```
T1 ─┬─▶ T3 ─┬───────────────▶ T7 ─┐
    └─▶ T4 ─┼─▶ T6 ─┬─▶ T8 ──┼─▶ T11 ─┐
T2 ─────────┴───────┼─▶ T10  │        ├─▶ T16 (nghiệm thu luồng)
T2 ─▶ T5 ───────────┼─▶ T9 ──┴─▶ T12 ─┘
T2 ─▶ T13 ─▶ T14    └─▶ T15 (regression)
```

- **Nền tảng (song song):** T1, T2.
- **Logic thuần (song song sau T1):** T3, T4; adapter T5 (sau T1); Admin API T13 (sau T2).
- **Lõi điều phối:** T6 (cần T2,T4) → mở khoá T8, T10, T15.
- **Đọc cache:** T7 (cần T2,T3,T4).
- **Giao kết quả:** T9 (cần T2,T3,T5).
- **Đường găng (critical path):** **T2 → T6 → T8 → T11 → T16** (và nhánh song song T9 → T12). T15 regression chạy sau T6+T9. T14 sau T13.

# Tiêu Chí Done Tổng (checklist nghiệm thu)

**Chức năng**
- [ ] Review xong → upload **1 file `.md`** (`review-<project>-PR<id>-<commit8>.md`) + **1 dòng tóm tắt** mrkdwn; fallback chunk chat khi upload lỗi; cả 2 fail → `delivery_failed`+alert (không báo "✅" sai).
- [ ] Lệnh trùng khóa lúc đang chạy → ack chờ + **fan-out** tới mọi target khi xong; **đúng 1 job** (atomic upsert); dedup target; cap 50.
- [ ] Khóa đã `completed` hợp lệ → **cache-serve 0 token**; loại job `failed`/lỗi-toàn-phần/superseded; trả bản mới nhất + stale note.
- [ ] `fresh`/`rerun` → job mới `supersedes`; `fresh` khi đang chạy → register (không nhân đôi).
- [ ] Commit mới → khóa mới → review mới (không trúng cache cũ).
- [ ] Reclaim giữa fan-out → **không double-delivery** (per-target atomic).

**Bảo mật (mọi mitigation security.md i-002 đã xử lý)**
- [ ] `authorizeReviewCommand` áp cho review + subscribe + cache-serve + `fresh`.
- [ ] Cache-serve đọc theo **khóa resolve** (không jobId tự do → chống BOLA).
- [ ] Delivery target lấy từ **Slack event đã verify** (không payload tự do).
- [ ] **Redaction** secret-pattern trước upload (gồm đường cache-serve); **neutralize mention** trong fallback.
- [ ] Rate-limit gồm `fresh`; cap deliveryTargets bật mặc định; scope Slack token chỉ `files:write`.
- [ ] Audit delivery/cache-hit/rerun (không log nội dung/secret).

**Test (mọi case có cách kiểm chứng)**
- [ ] Unit i-002 UT-201..218 xanh; Functional FT-201..220 xanh; E2E E2E-201..207 xanh.
- [ ] Regression i-001 bị ảnh hưởng (TC-16/FT-16/E2E-07, output TC-01) đã cập nhật & xanh.
- [ ] Ma trận truy vết i-002: 17 yêu cầu đều có tầng phủ.

**Pipeline**
- [ ] Không còn open question chặn (frd/tech/security/test = approved, open_questions = 0).
- [ ] Back-prop locator: nếu `data-testid` thực tế khác đề xuất → cập nhật ngược `test.md` (+cascade).

# Rủi Ro & Giả Định

**Rủi ro (kéo từ doc):**
- `[CRITICAL]` Upsert enqueue-or-subscribe không atomic → 2 job/khóa (double token). → T6 dùng `findOneAndUpdate` upsert + unique index (test FT-201).
- `[CRITICAL]` Quên authorize ở subscribe/cache-serve → bypass quyền. → T11 (test FT-216).
- `[HIGH]` Mark `delivered` trước khi `completeUploadExternal` OK → lost delivery khi reclaim. → T5/T9 chỉ mark sau xác nhận (test FT-204).
- `[HIGH]` Cache trả nhầm `failed`/`superseded` → kết quả sai/cũ. → T4/T7 `isCacheEligible` (test FT-205/206/207).
- `[HIGH]` Redaction sót pattern → secret rời lên Slack vĩnh viễn. → T3 + bộ pattern T1; theo dõi false-negative.
- `[HIGH]` Regression i-001: override ADR-007 (reject→subscribe) + output → file. → T15 (cập nhật TC-16/FT-16/E2E-07/TC-01).
- `[MEDIUM]` `deliveryTargets[]` phình (PR hot) → cap 50 + dedup (T2/T4); fan-out 429 backoff (T9).
- `[MEDIUM]` Mention injection trong fallback → neutralize (T3); file an toàn hơn.

**Giả định (đã chốt, không chặn):**
- Khóa = `(projectId,prId,commitHash)` commit-aware; cú pháp `fresh|rerun` cuối lệnh; "completed hợp lệ" = `completed` & ≥1 finding & không lỗi-toàn-phần; cap mặc định 50; không lưu artifact (dựng từ History); fan-out & cache-serve cross-owner = **residual chấp nhận** nối tiếp #8 i-001.
- **Giá trị cấu hình chốt khi code (T1, có default an toàn — KHÔNG chặn):** bộ pattern redaction cụ thể; `slackFileSizeLimit` thực tế; ngưỡng rate-limit `fresh`.
