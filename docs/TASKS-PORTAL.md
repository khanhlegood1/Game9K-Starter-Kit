# Tasks Portal — Bảng task cho nhà đầu tư

`public/tasks.html` là dashboard quản lý task theo phong cách product task-manager (tham chiếu UX của `v0-v0-task-manager`): sidebar, KPI, "My Projects", kanban, decision log, gate và metric. Điểm khác biệt: **không có database riêng** — mọi con số đọc trực tiếp từ repository và GitHub, nên nhà đầu tư luôn thấy trạng thái thật của công việc.

## 1. Vì sao không phải một task app thứ hai

Một board task chỉ có giá trị nếu nó không lệch khỏi nguồn sự thật. Game9K đã có:

- `project/fde/mission-brief.json` — mission, Delta, next action, risk, gate, metric.
- `project/fde/adr/*.md` — quyết định kiến trúc + follow-up.
- GitHub Issues/PRs — nơi kỹ thuật thực sự làm việc.

Portal **gộp ba nguồn này** thành một board, thay vì tạo bảng thứ tư để rồi trôi khỏi thực tế. Vì vậy:

| Việc cần làm | Nơi cập nhật (nguồn sự thật) | Portal hiển thị |
| --- | --- | --- |
| Đổi ưu tiên/owner của một next action | `project/fde/mission-brief.json` | Task `fde-00x` cập nhật ngay |
| Gỡ/ thêm blocker | `risks[]` trong mission brief | Cột **Blocked** + Notes |
| Chốt một quyết định | `project/fde/adr/ADR-00x.md` | **Decision Logs** + follow-up task |
| Việc kỹ thuật đang mở | GitHub issue/PR | Task `GH-*` / `PR-*` |

## 2. Cấu trúc màn hình

| Màn hình | Nội dung |
| --- | --- |
| **Overview** | Hero mission + KPI (task mở, in progress, blocked, P0/P1, % hoàn thành, ADR mở), "Ưu tiên xử lý ngay", tải theo owner, bảng task đang mở, timeline delivery gates, Notes rủi ro, Activity |
| **All Tasks** | Danh sách đầy đủ, lọc theo status / owner / priority / nguồn + tìm kiếm full-text |
| **Kanban** | 4 cột Blocked → In Progress → Open → Done |
| **Decision Logs** | Mọi ADR kèm status, deciders, follow-up task sinh ra từ quyết định |
| **Delivery Gates** | 5 cổng theo vòng đời FDE + exit criteria |
| **Success Metrics** | Definition, target, owner, trạng thái bằng chứng |

Mỗi task hiển thị: `id`, priority (P0–P3), status, nguồn (FDE / Risk / ADR / GitHub), owner, Definition of Done, tag và link tới issue gốc.

## 3. API

| Endpoint | Mô tả |
| --- | --- |
| `GET /api/tasks` | Board đầy đủ. Query: `status`, `owner`, `priority`, `source`, `q`, `github=0`, `refresh=1` |
| `GET /api/tasks/adrs` | Danh sách ADR đã parse (status, deciders, follow-up) |
| `POST /api/tasks` | Tạo task → GitHub Issue nếu có token, ngược lại trả lệnh `gh` + link tạo issue |

Response chính:

```json
{
  "ok": true,
  "projectId": "game9k-live-interaction",
  "kpis": { "total": 6, "active": 6, "open": 2, "inProgress": 2, "blocked": 2,
            "done": 0, "completionPct": 0, "adrOpen": 0, "adrTotal": 1,
            "gatePassed": 3, "gateTotal": 5, "criticalOpen": 5 },
  "owners": [{ "name": "Product", "total": 2, "blocked": 2, "...": "..." }],
  "tasks": [{ "id": "fde-001", "priority": "P0", "status": "open", "source": "fde-action" }],
  "adrs": [{ "id": "ADR-001", "status": "Accepted", "statusKey": "done", "followUps": [] }],
  "gates": [{ "id": "site-survey", "status": "done" }],
  "metrics": [{ "id": "creator_setup_minutes", "status": "open" }],
  "githubReady": false,
  "sources": { "missionBrief": "project/fde/mission-brief.json", "adrDirectory": "project/fde/adr", "github": null }
}
```

### Suy giảm an toàn

- Không có mạng / GitHub API lỗi → board vẫn render FDE + ADR tasks, `githubReady: false`, thanh bên hiện **"GitHub offline — dùng FDE + ADR"**.
- Vercel static (không có Express API) → UI rơi về **static mode** và báo rõ.
- Thiếu `GITHUB_TOKEN` khi tạo task → trả `command` (`gh issue create …`) và `newIssueUrl`, không tạo dữ liệu ma.

## 4. CLI

```bash
npm run tasks                       # board từ FDE + ADR (không gọi GitHub)
node cli/g9k.js tasks --json        # envelope JSON cho CI
node cli/g9k.js tasks --status blocked --json
node cli/g9k.js tasks --priority P0 --github --json
```

`--github` cần `G9K_GH_API_TOKEN` (tách khỏi token của Arena/git để tránh vô tình dùng credential ngoài ý muốn).

## 5. Biến môi trường

| Biến | Dùng cho | Ghi chú |
| --- | --- | --- |
| `GITHUB_TOKEN` / `GH_TOKEN` | Server đọc issues (nâng rate limit) + tạo issue | Không bao giờ gửi xuống browser |
| `G9K_GH_API_TOKEN` | CLI `tasks --github` | Token riêng cho CLI |
| `G9K_GITHUB_REPO` | Override repo (`owner/name`) | Mặc định `khanhlegood1/Game9K-Starter-Kit` |

## 6. Deploy lên Vercel

Repo đã cấu hình `vercel.json`:

- `public/` là output tĩnh → `/tasks.html` được serve trực tiếp.
- `/api/(.*)` rewrite sang `api/index.cjs`, wrapper CommonJS dùng lại `createGame9KServer()` để **không nhân đôi logic API**.
- `functions["api/index.cjs"].includeFiles` gồm `project/fde/**`, `public/games/**`, `dist/**` để function đọc được mission brief + ADR + release manifest.

Thiết lập trên Vercel project `game9k-starter-kit`:

1. **Settings → Environment Variables** → thêm `GITHUB_TOKEN` (scope: Production, Preview) nếu muốn hiện issue/PR thật và tạo task.
2. Deploy lại; kiểm tra `https://game9k-starter-kit.vercel.app/tasks.html` và `/api/tasks`.

Nếu chỉ deploy static, portal vẫn mở được nhưng sẽ ở static mode (không có KPI thật); khi đó dùng `npm run tasks` để xuất board.

## 7. Kiểm thử

```bash
node --test test/tasks-board.test.js
npm test
```

Test cover: chuẩn hoá status/priority, parse ADR (kể cả file lỗi), dedupe follow-up theo id và title, xếp hạng KPI, lọc task, cache GitHub, suy giảm khi API lỗi/401, tạo task qua `gh` và qua GitHub API, cùng smoke test cho `/tasks.html`, CSS và JS (không hardcode localhost).
