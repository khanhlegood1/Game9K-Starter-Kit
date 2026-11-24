# ADR-002 — Một nguồn sự thật cho bảng task nhà đầu tư

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Studio Engineering, Product, Live Ops
- **Related:** `project/fde/mission-brief.json`, `docs/TASKS-PORTAL.md`, `docs/FDE-PROJECT-MANAGEMENT.md`, `public/tasks.html`

## Context

Nhà đầu tư cần thấy ngay việc gì còn **Open**, ai chịu trách nhiệm, cái gì đang chặn ship và quyết định nào đã được chốt. Hiện các thông tin này nằm rải rác ở:

- `project/fde/mission-brief.json` (next action, risk, gate, metric),
- `project/fde/adr/*.md` (quyết định + follow-up),
- GitHub Issues/PRs (công việc kỹ thuật hằng ngày).

Nếu dựng một task app có database riêng (kiểu Jira/Notion/Trello), bảng đó sẽ lệch khỏi repo trong vài ngày: task được tick trong app nhưng code chưa merge, hoặc ngược lại. Với nhà đầu tư, một board sai còn tệ hơn không có board.

## Decision

1. Portal `public/tasks.html` **chỉ đọc và tổng hợp**, không lưu trạng thái task riêng.
2. Ba nguồn dữ liệu chính thức: mission brief, ADR markdown, GitHub issues/PRs. Thứ tự ưu tiên khi trùng id: FDE → ADR → GitHub.
3. Mọi phép biến đổi (status/priority normalise, ADR parse, dedupe, KPI) là **deterministic, không LLM**, trong `src/lib/taskBoard.js`; I/O nằm ở `src/services/TaskBoardService.js`.
4. Tạo task = tạo **GitHub Issue** (qua token server) hoặc trả lệnh `gh issue create` khi không có token. Portal không bao giờ ghi vào file repo hay DB phụ.
5. GitHub là **tuỳ chọn và có thể suy giảm**: lỗi mạng/401 chỉ làm `githubReady: false`, board vẫn render FDE + ADR.
6. Board tách khỏi release gate: `GO_FOR_LAUNCH` kỹ thuật không làm task P0 biến mất khỏi board.

## Alternatives considered

| Phương án | Vì sao không chọn |
| --- | --- |
| Dùng Notion/Jira làm nguồn chính | Lệch khỏi repo; nhà đầu tư thấy trạng thái không kiểm chứng được |
| Lưu task trong `localStorage` của portal | Mỗi người một bảng, không phải nguồn sự thật |
| Đọc GitHub là bắt buộc | Vercel/CI không token vẫn phải demo được; mất mạng không được làm sập board |
| Sinh board bằng LLM | Không tái lập được, có thể bịa task hoặc mất blocker |

## Consequences

**Tích cực**
- Board luôn khớp với repo/GitHub; ai xem cũng truy được về file hoặc issue gốc.
- Không phát sinh hệ thống thứ hai phải đồng bộ và phân quyền.
- Test được toàn bộ logic mà không cần network (inject `fetchImpl`).

**Đánh đổi**
- Muốn đổi trạng thái task phải sửa file hoặc issue, không có nút kéo-thả đổi state.
- GitHub API unauthenticated bị rate limit (60 req/giờ/IP) → cần cache 60s và token cho môi trường thật.
- Portal không phải công cụ planning; nó là **read model** của kế hoạch đã có.

## Rollback

Xoá `public/tasks.html`, `public/tasks/`, `src/lib/taskBoard.js`, `src/services/TaskBoardService.js` và route `/api/tasks*`; revert `vercel.json` về `api/index.js` nếu wrapper CJS gặp sự cố. Không có dữ liệu nào bị mất vì không có store riêng.

## Follow-ups

- `fde-005`: Gắn `GITHUB_TOKEN` trên Vercel (Production) để board đọc issue/PR ổn định và cho phép tạo task từ portal.
- `fde-006`: Thêm badge "task ↔ ADR ↔ gate" vào Weekly Executive Summary để nhà đầu tư đối chiếu board với báo cáo tuần.
