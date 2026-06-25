# Ánh Xạ 16 Khía Cạnh → BABOK v3 (Knowledge Areas + Techniques)

Dùng file này để gắn nền tảng phương pháp luận chuẩn cho mỗi phát hiện: chọn đúng **Knowledge Area (KA)** và **Technique** của BABOK v3 (*A Guide to the Business Analysis Body of Knowledge*).

---

## 6 Knowledge Areas của BABOK v3 (tóm tắt)

| KA | Mục đích |
|----|----------|
| **BAPM** — Business Analysis Planning & Monitoring | Lập kế hoạch cách tiếp cận, quản trị, governance cho hoạt động BA. |
| **EC** — Elicitation & Collaboration | Khai thác yêu cầu, làm việc với stakeholder, xác nhận thông tin. |
| **RLCM** — Requirements Life Cycle Management | Truy vết, ưu tiên, quản lý thay đổi và phê duyệt yêu cầu xuyên suốt vòng đời. |
| **SA** — Strategy Analysis | Xác định nhu cầu, trạng thái hiện tại/tương lai, đánh giá rủi ro và chiến lược thay đổi. |
| **RADD** — Requirements Analysis & Design Definition | Mô hình hóa, đặc tả, xác minh yêu cầu và thiết kế giải pháp. |
| **SE** — Solution Evaluation | Đánh giá hiệu năng và giá trị của giải pháp, nhận diện hạn chế. |

---

## Bảng ánh xạ 16 khía cạnh

| # | Khía cạnh | Knowledge Area | Techniques BABOK chính | Lưu ý bối cảnh ERP/HRM/CRM |
|---|-----------|----------------|------------------------|-----------------------------|
| 1 | Mục tiêu nghiệp vụ | SA | Business Capability Analysis, SWOT Analysis, Root Cause Analysis, Decision Modeling, Business Cases | Làm rõ KPI và giá trị trước khi đào sâu giải pháp. |
| 2 | Luồng nghiệp vụ | RADD | Process Modeling, Data Flow Diagrams, Use Cases & Scenarios, Process Analysis | Vẽ luồng chính/thay thế/ngoại lệ/khôi phục; soi dead-end & circular flow. |
| 3 | State Machine | RADD | State Modeling | Liệt kê đủ trạng thái & chuyển hợp lệ; chặn chuyển bất hợp lệ và duyệt nhiều lần. |
| 4 | Business Rule | RADD | Business Rules Analysis, Decision Modeling (DMN), Decision Tables | Tách rule pháp lý/vận hành/ngầm định; phát hiện rule mâu thuẫn. |
| 5 | Validation | RADD | Acceptance & Evaluation Criteria, Data Dictionary | Validation liên trường + nghiệp vụ + duplicate, không chỉ định dạng. |
| 6 | Phân quyền | RADD + SE | Roles & Permissions Matrix, Segregation of Duties (SoD) | Soi Self-Approval, Privilege Escalation, Data Leakage — thường là CRITICAL. |
| 7 | Cơ cấu tổ chức | EC + SA | Organizational Modeling, Stakeholder List/Map/Personas | Xử lý đổi phòng ban/quản lý/nghỉ việc/tái cơ cấu giữa quy trình. |
| 8 | Dữ liệu | RADD | Data Modeling, Data Dictionary, Glossary | Soi orphan/duplicate/inconsistency; xác định chủ sở hữu & dữ liệu lịch sử. |
| 9 | Component dùng chung | RLCM | Functional Decomposition, Traceability, Impact Analysis | Lập Impact Matrix cho shared component/workflow/master data → Regression Risk. |
| 10 | Ảnh hưởng chéo | RLCM | Traceability, Impact Analysis, Functional Decomposition | Soi duplicate feature, business/domain conflict với hệ thống hiện có. |
| 11 | Edge case | RADD | Scenario Analysis, Use Cases & Scenarios, Acceptance & Evaluation Criteria | Kịch bản dữ liệu rỗng/sai/trùng, mất mạng, refresh, đổi quyền/quản lý/phòng ban. |
| 12 | Concurrency | RADD + SE | Non-Functional Requirements Analysis, Scenario Analysis | Soi race condition, double-submit, lost update; cần optimistic/pessimistic lock. |
| 13 | Audit | SE + RLCM | Traceability, Audit & Compliance Criteria | Xác định nhu cầu approval history, change history, rollback. |
| 14 | Thông báo | RADD | Use Cases & Scenarios, Stakeholder Analysis | Ai nhận / khi nào / kênh nào / xử lý khi gửi thất bại (retry, fallback). |
| 15 | Khả năng mở rộng | SA + RADD | Non-Functional Requirements Analysis, Business Capability Analysis | Multi-company/branch/level/country/policy; tránh thiết kế phải đập đi làm lại. |
| 16 | Tích hợp | RADD | Interface Analysis | API/SSO/Payroll/ERP/HRM ngoài; xử lý lỗi tích hợp & chiến lược đồng bộ dữ liệu. |
| ★ | Rủi ro (xuyên suốt) | Mọi KA | Risk Analysis & Management, Risk Register | Gắn nhãn CRITICAL/HIGH/MEDIUM/LOW cho từng phát hiện và đề xuất mitigation. |

---

## Gợi ý sử dụng

- Một phát hiện có thể dùng **nhiều technique**; ưu tiên technique trực diện nhất với loại gap đang chỉ ra.
- Với rủi ro bảo mật phân quyền (khía cạnh 6) luôn áp **Segregation of Duties** và mặc định nâng mức rủi ro nếu chưa có biện pháp kiểm soát.
- Với impact chéo (khía cạnh 9, 10) luôn kèm **Traceability + Impact Analysis** để chứng minh phạm vi ảnh hưởng, không nói chung chung.
- Toàn bộ phát hiện cuối cùng đi qua **Risk Analysis & Management** để chuẩn hóa mức độ và đề xuất giảm thiểu.
