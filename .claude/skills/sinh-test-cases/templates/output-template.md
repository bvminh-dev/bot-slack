# Template Định Dạng Kết Quả — Phân Tầng Test Case (BẮT BUỘC)

Trình bày đúng **các mục dưới đây, đúng thứ tự**. Không bỏ mục nào — mục không áp dụng ghi
`Không áp dụng / Không phát hiện`. Mỗi case **mô tả bằng lời**, gắn **kỹ thuật ISTQB** và
**map về TC gốc** trong `test.md`. Khoảng trống gắn nhãn `[CRITICAL|HIGH|MEDIUM|LOW]`.
**KHÔNG sinh code Playwright/Cypress** — E2E chỉ tham chiếu `data-testid`.

---

# Phân Tầng Test Case (Test Pyramid)
> Nguồn: `test.md` (i-NNN). Mục tiêu: đặt mỗi assertion ở tầng rẻ nhất kiểm được nó.

# Tổng Quan Kim Tự Tháp
| Tầng | Số case | Tỉ lệ | Ghi chú hình dạng |
|------|---------|-------|-------------------|
| Unit | | % | (đáy — nhiều nhất) |
| Functional | | % | (giữa) |
| E2E | | % | (đỉnh — ít nhất) |

> Nhận xét hình dạng: pyramid khỏe mạnh / cảnh báo "ice-cream cone" (E2E phình) + đề xuất.

# 1. Unit Test Cases
> Logic thuần, không I/O. Kiểm hàm/đơn vị độc lập.

| ID | Hàm/Đơn vị (SUT) | Input | Expected output | Kỹ thuật | Map test.md |
|----|------------------|-------|-----------------|----------|-------------|
| UT-01 | | | | | TC-.. |

# 2. Functional Test Cases
> 1 tính năng qua API/handler/service; hệ ngoài mock/stub; DB thật hoặc in-memory.

| ID | Tính năng / Endpoint | Tiền điều kiện | Bước | Dữ liệu vào | Kết quả mong đợi | Mock/Stub | Kỹ thuật | Map test.md |
|----|----------------------|----------------|------|-------------|------------------|-----------|----------|-------------|
| FT-01 | | | | | | | | TC-.. |

# 3. E2E Test Cases
> Luồng đầu-cuối: qua UI (`data-testid`) hoặc qua mô phỏng event (luồng không-DOM, vd Slack).
> KHÔNG sinh code automation — chỉ khai báo bước + locator.

| ID | Luồng | Tiền điều kiện | Bước (qua UI/event) | Dữ liệu vào | Kết quả mong đợi | data-testid dùng | Kỹ thuật | Map test.md |
|----|-------|----------------|---------------------|-------------|------------------|------------------|----------|-------------|
| E2E-01 | | | | | | `...` | | TC-.. |

# Ma Trận Truy Vết (Traceability)
> Mỗi yêu cầu/Business Rule trong `frd.md` phải có ≥1 tầng phủ.

| Yêu cầu / Business Rule (FRD) | Unit | Functional | E2E | Ghi chú |
|-------------------------------|------|------------|-----|---------|
| | UT-.. | FT-.. | E2E-.. | |

# Khoảng Trống & Khuyến Nghị Đặt Tầng
- `[MỨC]` ... (yêu cầu chưa phủ tầng nào / assertion đặt sai tầng / trùng lặp giữa tầng / E2E phình → đề xuất hạ tầng)
