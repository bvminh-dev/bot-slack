# Luật Phân Tầng Test (Test Pyramid) — Unit · Functional · E2E

> Dùng để quyết định MỖI assertion thuộc tầng nào. Nguyên tắc vàng:
> **đặt assertion ở tầng RẺ NHẤT kiểm được nó** (Unit < Functional < E2E về chi phí & độ giòn).

---

## 1. Cây quyết định chọn tầng

Với mỗi assertion, hỏi lần lượt:

1. **Có thể kiểm bằng 1 hàm/đơn vị logic thuần, không I/O (không DB/HTTP/file/process), input→output xác định không?**
   → **UNIT**.
2. Nếu cần đi qua 1 endpoint/handler/service, **chạm DB hoặc gọi hệ ngoài (mock được)**, nhưng **không cần UI thật**?
   → **FUNCTIONAL** (hệ ngoài stub/mock; DB thật hoặc in-memory).
3. Nếu chỉ chứng minh được khi **đi hết luồng người dùng** (UI thật qua `data-testid`, hoặc luồng dịch vụ đầu-cuối qua mô phỏng event)?
   → **E2E** — chỉ dùng cho luồng quan trọng/nhạy cảm, đừng lạm dụng.

Nếu assertion lọt được tầng thấp hơn → **luôn chọn tầng thấp hơn**.

---

## 2. Dấu hiệu nhận biết từng tầng

### UNIT — logic thuần, cô lập, chạy mili-giây
- Parser / normalizer (vd: bóc link Slack bọc `<...>` + query param → trích PR id).
- Parser cú pháp lệnh (tách `<project>` / `<pr-url>` / từ khóa `review`).
- Logic biên/đếm: số file ≤50/51, số dòng diff ≤5.000/5.001, bộ đếm rate-limit, so sánh lease timeout.
- Hàm map file→skill (Decision Table R1–R7) khi cho 1 đường dẫn file.
- Chuẩn hoá: `nameLower` (case-insensitive), builder khóa idempotency `(project,pr,commit)`.
- Phân loại credential theo prefix (`sk-ant-api…` vs `sk-ant-oat…`).
- Phân loại lỗi retryable vs permanent; tính backoff.
- Aggregate/parse finding từ output skill (đếm theo severity) — kiểm bằng chuỗi mẫu cố định.

### FUNCTIONAL — 1 tính năng qua API/handler, hệ ngoài mock
- Slack command handler: ack < 3s, resolve project, validate PR, enqueue job (mock Slack/Azure/DB-queue).
- Admin API CRUD project; validate model/effort/repo; duplicate → 409.
- IDOR/BOLA: `GET /projects/:id` của owner khác → 404 đồng nhất; response schema KHÔNG chứa secret.
- Auth: thiếu/sai session → 401/403; chữ ký Slack/timestamp; mass assignment bị bỏ qua.
- State machine ReviewJob (Queued→Running→Completed/Failed/reclaim) ở mức service.
- Security functional: NoSQL/command/arg injection, prompt injection (review không bị thao túng).
- **Integration test** (một nhánh của functional): Azure/Claude/Slack/Mongo timeout/500/hết credit → retry/backoff/fallback/circuit breaker. Dùng stub hệ ngoài.
- Concurrency test: double-submit atomic, 2 worker claim 1 job, >5 job xếp hàng, reclaim sau crash.

### E2E — luồng đầu-cuối, ít & chọn lọc
- **UI (ReactJS, có DOM):** đăng nhập PAT (đúng/sai), tạo project + test-connection, validate form, secret write-only (cờ "đã cấu hình"), XSS render escape, xoá có confirm, bảng lịch sử review. → dùng `data-testid` từ section *E2E Locators* của `test.md`.
- **Luồng dịch vụ không-DOM (Slack):** happy path "ra lệnh review → ack < 3s → post kết quả theo severity trong thread" kiểm qua **mô phỏng Slack event** đầu-cuối (không có DOM). Xếp E2E-luồng, KHÔNG phải E2E-UI.

---

## 3. Luật khử trùng lặp giữa tầng

- Logic đã có **Unit** (vd normalize link) → ở Functional chỉ kiểm "handler gọi đúng & enqueue", KHÔNG kiểm lại từng biến thể link.
- Quy tắc map file→skill: liệt kê đủ R1–R7 ở **Unit**; ở Functional/E2E chỉ kiểm 1–2 luồng đại diện (vd PR chỉ-doc, PR code+nhạy cảm).
- Biên (BVA) số file/dòng/rate-limit: kiểm cạnh ở **Unit**; ở Functional chỉ 1 case xác nhận giới hạn có hiệu lực end-to-end (vd PR 60 file → cắt + báo).

---

## 4. Quy tắc hình dạng kim tự tháp

- **Unit nhiều nhất** (đáy) → **Functional vừa** (giữa) → **E2E ít nhất** (đỉnh).
- E2E chỉ cho: bảo mật, tiền/credit, **tenant isolation**, happy path chính, luồng có rủi ro cao nếu vỡ.
- Nếu E2E ≳ Functional hoặc ≳ Unit → cảnh báo **"ice-cream cone"** (ngược kim tự tháp): test chậm, giòn, đắt bảo trì → đề xuất hạ assertion xuống tầng thấp hơn.

---

## 5. Bảng map nhanh (ví dụ từ i-001)

| Assertion / TC gốc | Tầng | Lý do |
|--------------------|------|-------|
| Normalize link `<...>?_a=files>` → PR id 123 (TC-04) | Unit | parser thuần |
| Cú pháp thiếu/sai thứ tự (TC-02/03) | Unit (lõi parse) + Functional (handler trả guide) | tách lõi & luồng |
| Map file→skill R1–R7 | Unit | hàm phân loại theo path |
| Biên file/diff/rate-limit (Boundary Values) | Unit | so sánh số học |
| Resolve project case-insensitive (TC-06) | Functional | chạm registry/DB |
| IDOR 404 (TC-15), schema no-secret (TC-14) | Functional | qua API |
| Double-submit / reclaim / >5 job (Concurrency) | Functional | qua DB-queue thật/in-memory |
| Azure/Claude/Slack/Mongo lỗi (Integration) | Functional | stub hệ ngoài |
| Login PAT, tạo project + test-connection, XSS render (TC-09/10/11, security UI) | E2E-UI | cần DOM + data-testid |
| Happy path Slack ack<3s → post severity (TC-01/SC-1) | E2E-luồng | mô phỏng event đầu-cuối |
