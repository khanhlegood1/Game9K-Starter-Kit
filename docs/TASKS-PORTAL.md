# Tasks Portal — Bảng task cho nhà đầu tư

`public/tasks.html` là dashboard quản lý task theo phong cách product task-manager (tham chiếu UX của `v0-v0-task-manager`): sidebar, KPI, "My Projects", kanban, decision log, gate và metric. Điểm khác biệt: **không có database riêng** — mọi con số đọc trực tiếp từ repository và GitHub, nên nhà đầu tư luôn thấy trạng thái thật của công việc.

## 1. Vì sao không phải một task app thứ hai

Một board task chỉ có giá trị nếu nó không lệch khỏi nguồn sự thật. Game9K đã có:

- `project/fde/mission-brief.json` — mission, Delta, next action, risk, gate, metric.
- `project/fde/adr/*.md` — quyết định kiến trúc + follow-up (MADR v4 + hve-core, xem `docs/ADR-GOVERNANCE.md`).
- `project/fde/schedule.json` — lịch họp thật của tuần (UAT, review, gate check, investor sync).
- GitHub Issues/PRs — nơi kỹ thuật thực sự làm việc.

Portal **gộp ba nguồn này** thành một board, thay vì tạo bảng thứ tư để rồi trôi khỏi thực tế. Vì vậy:

| Việc cần làm | Nơi cập nhật (nguồn sự thật) | Portal hiển thị |
| --- | --- | --- |
| Đổi ưu tiên/owner của một next action | `project/fde/mission-brief.json` | Task `fde-00x` cập nhật ngay |
| Gỡ/ thêm blocker | `risks[]` trong mission brief | Cột **Blocked** + Notes |
| Chốt một quyết định | `project/fde/adr/NNNN-kebab-case-title.md` | **Decision Logs** + follow-up task + ADR graph |
| Đặt lịch họp / review / gate check | `project/fde/schedule.json` | Thẻ **Schedule** + màn hình Schedule |
| Việc kỹ thuật đang mở | GitHub issue/PR | Task `GH-*` / `PR-*` |

## 2. Cấu trúc màn hình

| Màn hình | Nội dung |
| --- | --- |
| **Overview** | Hero mission + KPI (task mở, in progress, blocked, P0/P1, % hoàn thành, ADR mở), "Ưu tiên xử lý ngay", tải theo owner, bảng **My Projects** (task đang mở), timeline delivery gates, thẻ **Schedule** ngay dưới My Projects, Notes rủi ro, Activity |
| **All Tasks** | Danh sách đầy đủ, lọc theo status / owner / priority / nguồn + tìm kiếm full-text |
| **Kanban** | 4 cột Blocked → In Progress → Open → Done |
| **Schedule** | Week strip Mo→Su (hôm nay khoanh tròn màu brand), `‹ ›` sang tuần trước/sau, event row `00:00 PM to 00:00 PM` + avatar chồng nhau, deadline suy ra từ gate/ADR/task |
| **Decision Logs** | Mọi ADR: type, lifecycle (`proposed → accepted → deprecated → superseded`), supersession lineage, ASR trigger, governance findings, ADR graph và follow-up task |
| **Delivery Gates** | 5 cổng theo vòng đời FDE + exit criteria |
| **Success Metrics** | Definition, target, owner, trạng thái bằng chứng |

Mỗi task hiển thị: `id`, priority (P0–P3), status, nguồn (FDE / Risk / ADR / GitHub), owner, Definition of Done, tag và link tới issue gốc.

## 3. API

| Endpoint | Mô tả |
| --- | --- |
| `GET /api/tasks` | Board đầy đủ. Query: `status`, `owner`, `priority`, `source`, `q`, `github=0`, `refresh=1` |
| `GET /api/tasks/adrs` | Danh sách ADR đã parse (status, deciders, follow-up) |
| `GET /api/tasks/adrs/registry` | ADR registry đầy đủ: findings MADR v4, supersession graph, summary + `nextId` |
| `GET /api/schedule?anchor=YYYY-MM-DD` | Một tuần lịch (Mon→Sun): meetings, deadlines suy ra, `upcoming`, `stats`, `validation` |
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
  "adrs": [{ "id": "0001", "status": "Accepted", "statusKey": "done", "rawStatus": "accepted", "type": "network", "followUps": [] }],
  "adrGraph": { "nodes": [{ "id": "0001" }, { "id": "0002" }], "edges": [{ "from": "0001", "to": "0002", "kind": "related" }] },
  "adrFindings": [],
  "adrSummary": { "total": 2, "errors": 0, "warnings": 0, "nextId": "0004" },
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
- `project/fde/schedule.json` thiếu/hỏng → thẻ Schedule báo lỗi cục bộ, board FDE + ADR **không** bị ảnh hưởng (schedule là endpoint riêng).

## 4. CLI

```bash
npm run tasks                       # board từ FDE + ADR (không gọi GitHub)
node cli/g9k.js tasks --json        # envelope JSON cho CI
node cli/g9k.js tasks --status blocked --json
node cli/g9k.js tasks --priority P0 --github --json
npm run adr                         # list ADR + lifecycle + findings
npm run adr -- validate             # fail (exit 1) nếu ADR vi phạm MADR v4 / hve-core
npm run adr -- next --title "Chọn nhà cung cấp gift overlay"
npm run adr -- graph
npm run schedule -- --anchor 2026-11-26   # tuần chứa ngày đó
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

Thêm cho lượt này:

```bash
node --test test/adr-registry.test.js     # frontmatter, validator, graph, CLI `g9k adr`
node --test test/schedule-board.test.js   # week grid, overlap, deadline suy ra, /api/schedule
```
