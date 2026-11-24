# Quản Trị Dự Án Dev Game9K Bằng Gemini Decisions API (`gemini-decision-1`)

Tài liệu này mô tả cách `Game9K-Starter-Kit` tích hợp kiến trúc **[Gemini Decisions API Playground](https://github.com/khanhlegood1/Gemini-Decisions-API-Playground)** (`POST https://generativelanguage.googleapis.com/v1beta/decisions`) trực tiếp vào quy trình **Quản lý dự án, Kiểm duyệt phát hành (CI/CD), Tuân thủ pháp lý và Vận hành KOL Livestream**.

---

## 1. Vì Sao Gemini Decisions API Phù Hợp Hoàn Hảo Cho Quản Lý Dự Án Game9K?

Khác với LLM sinh văn bản tự do dễ lệch định dạng và tốn token đầu ra, **Gemini Decisions API (`gemini-decision-1`)** chấm điểm mọi phương án trong **đúng một lượt truyền xuôi (`0 output tokens`)**, trả về **phân phối xác suất hiệu chuẩn (`calibrated probabilities`)** theo 3 kiểu dữ liệu định kiểu chặt:

1. **`noul` (Boolean — Có / Không)**: Cổng kiểm tra đạt/chặn (`Go / No-Go`) với ngưỡng xác suất rõ ràng (ví dụ: `r2_publish_ready = 0.98`, `introduces_platform_risk = 0.96`).
2. **`choice` (Phân luồng hành động cố định)**: Tự động định tuyến công việc về đúng nhánh xử lý hoặc nhóm kỹ thuật (`promote_cloudflare_r2_prod`, `block_merge`, `g2_portal_leaderboard`, `tiktok_youtube_gateway`).
3. **`score` (Chấm điểm theo thang Rubric `0..N`)**: Đo lường định lượng chất lượng bản dựng, mức độ rủi ro hoặc điểm hấp dẫn livestream (`2.94 / 3.00`).

Hỗ trợ đầu vào **đa phương thức**: Văn bản, JSON manifest, `git diff`, ảnh chụp màn hình lỗi, video quay màn hình OBS, file ghi âm báo lỗi và tài liệu PDF pháp lý.

---

## 2. Sáu Cổng Quản Trị Dự Án Dev Game9K Tích Hợp Sẵn (`/decisions.html`)

| Mã Cổng (`gateId`) | Mục Tiêu Quản Trị Dự Án | Đầu Ra Định Kiểu (`Boolean` · `Choice` · `Score`) |
| :--- | :--- | :--- |
| **`release-gate-r2`** | Kiểm duyệt gói game trước khi đóng dấu SHA-256 đẩy lên Cloudflare R2 | `r2_publish_ready` · Luồng CI/CD (`promote` / `staging` / `trim` / `block`) · Điểm hoàn thiện `0..3` |
| **`nd147-legal-triage`** | Phân loại pháp lý Nghị định `147/2024/NĐ-CP` & khóa giờ chơi dưới 18 tuổi | `enforce_u18_session_lock` · Phân nhóm `G1 / G2 / G3 / G4` · Mức thủ tục pháp lý `0..3` |
| **`pr-security-review`** | Duyệt Pull Request: chặn rò rỉ Cookie Iframe & lạm dụng `Presence.track()` | `introduces_platform_risk` · Quyết định gộp nhánh (`block_merge` / `approve`) · Phạm vi ảnh hưởng `0..3` |
| **`kol-stream-readiness`** | Đánh giá kịch bản treo phòng 24/7 trên TikTok LIVE Studio & YouTube Live | `unattended_24_7_ready` · Khuyến nghị vận hành KOL · Điểm giữ chân & Hype khán giả `0..3` |
| **`solana-milestone-unlock`** | Đối soát Telemetry người chơi thực để giải ngân chặng Token Solana cho Studio | `approve_token_tranche` · Hành động ngân quỹ (`100%` / `50%` / `freeze`) · Điểm trưởng thành KPI `0..3` |
| **`multimodal-bug-triage`** | Phân luồng sự cố QA / Livestream đa phương thức (JSON, Ảnh, Video OBS, Audio) | `is_live_showstopper` · Đội phụ trách (`gateway` / `canvas` / `sdk` / `ads`) · Mức ưu tiên `P3..P0` |

---

## 3. Chế Độ Động Cơ Kép (Dual-Engine Execution)

- **Chế độ Trực tuyến (`gemini-decision-1`)**: Khi khai báo `GEMINI_API_KEY` trong `.env` hoặc bấm nút **🔑 Link a Gemini API Key** trên giao diện `/decisions.html`, hệ thống gọi trực tiếp `https://generativelanguage.googleapis.com/v1beta/decisions`.
- **Chế độ Hiệu chuẩn Nội bộ (`game9k-calibrated-decisions`)**: Khi chưa cấu hình khóa API (môi trường CI `npm test`, `npm run decide` hoặc máy dev mới clone), `ProjectDecisionsService` tự động phân tích vector tín hiệu kỹ thuật của Game9K (dung lượng Gzip, thẻ `<video>`, `eval()`, tần suất Hz Realtime, cờ NĐ 147, tỷ lệ hoàn thành chặng đua) và trả về cấu trúc JSON tương thích 100% với Gemini Decisions API.

---

## 4. Sử Dụng Trên Web, REST API & CLI

### Giao diện Studio Quản Trị Dự Án & Playground
Mở trình duyệt tại **`http://localhost:3000/decisions.html`**:
- Bấm **⚡ Chạy Lại 4 Cổng Kiểm Định Repo** để chấm điểm trực tiếp toàn bộ kho mã nguồn hiện tại.
- Bấm **🦖 Gói dino-race**, **🔀 Git Commit/Diff**, hoặc **📡 Telemetry Cổng** để nạp dữ liệu thật từ máy chủ vào ô soạn thảo Playground và chạy phân tích tức thì.
- Mở thẻ **📋 Sprint Backlog & Phân Luồng AI** để thêm tính năng/báo lỗi mới và để Decisions API tự động gán Squad + độ ưu tiên `P0–P3`.
- Bấm **Get code** để xuất mã nguồn tích hợp bằng **Python (`google-genai`)**, **TypeScript (`@google/genai`)** hoặc **cURL**.

### Lệnh CLI Cho CI/CD & AI Coding Agents
```bash
# Chạy kiểm định quản trị toàn dự án (trả về mã thoát 0 nếu GO_FOR_LAUNCH)
npm run decide

# Xuất kết quả JSON chuẩn hóa cho pipeline GitHub Actions / GitLab CI
node cli/g9k.js decide --json

# Kiểm tra FDE mission brief & control plane (mission, Delta, gate, blocker, next action)
npm run fde
node cli/g9k.js fde --json
```

---

## 5. Cầu Nối Với FDE Control Plane (Forward Deployed Engineering)

`docs/FDE-PROJECT-MANAGEMENT.md` mô tả vòng đời Discovery → Scoping → Architecture/ADR → Pilot/UAT → Day-2. Cầu nối kỹ thuật:

| Thành phần | Vai trò |
| :--- | :--- |
| `project/fde/mission-brief.json` | Source of truth: Delta, stakeholder, discovery checklist, success metric, delivery gate, risk/blocker, next action, artifact |
| `src/lib/fdeProject.js` | Validator deterministic (`validateFdeMissionBrief`) + `summarizeFdeMission` — không gọi LLM |
| `ProjectDecisionsService#getFdeProjectState` / `#runFdeProjectAudit` | Đọc brief, chạy technical audit, trả `releaseControl` |
| `GET /api/project/fde` · `POST /api/project/fde/audit` | REST cho Studio và CI |
| Tab **🎯 Mission & Delta** trong `/decisions.html` | Hiển thị FDE status, gate, blocker, next action cạnh release gates và Sprint Backlog |
| `npm run decide` | Trả thêm `fdeProject` để pipeline thấy khác biệt giữa `GO_FOR_LAUNCH` và trạng thái FDE thực tế |

**Nguyên tắc bắt buộc:** technical `GO_FOR_LAUNCH` (validate/build/verify/decide) **không** thay thế creator UAT hoặc Day-2 handoff. Vì vậy trạng thái FDE hiện tại là `ACTION_REQUIRED` (blocker `real-creator-uat`), dù 4/4 technical gate đã pass. Mọi quyết định ảnh hưởng scope/architecture/compliance phải tham chiếu ADR tương ứng trong `project/fde/adr/`.

