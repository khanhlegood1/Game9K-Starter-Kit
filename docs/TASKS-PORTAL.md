# Tasks Portal — Bảng task cho nhà đầu tư

`public/tasks.html` là dashboard quản lý task theo phong cách product task-manager (tham chiếu UX của `v0-v0-task-manager`): sidebar, KPI, "My Projects", kanban, decision log, gate và metric. Điểm khác biệt: **không có database riêng** — mọi con số đọc trực tiếp từ repository và GitHub, nên nhà đầu tư luôn thấy trạng thái thật của công việc.

## 1. Vì sao không phải một task app thứ hai

Một board task chỉ có giá trị nếu nó không lệch khỏi nguồn sự thật. Game9K đã có:

- `project/fde/mission-brief.json` — mission, Delta, next action, risk, gate, metric.
- `project/fde/adr/*.md` — quyết định kiến trúc + follow-up (MADR v4 + hve-core, xem `docs/ADR-GOVERNANCE.md`).
- `project/fde/schedule.json` — lịch họp thật của tuần (UAT, review, gate check, investor sync).
- `dist/release-manifest.json` — gói phát hành đã verify (version, legal class, gzip budget, `release_sha256`) → nguồn duy nhất cho danh sách **Projects** và **Releases**.
- GitHub Issues/PRs — nơi kỹ thuật thực sự làm việc.

Portal **gộp ba nguồn này** thành một board, thay vì tạo bảng thứ tư để rồi trôi khỏi thực tế. Vì vậy:

| Việc cần làm | Nơi cập nhật (nguồn sự thật) | Portal hiển thị |
| --- | --- | --- |
| Đổi ưu tiên/owner của một next action | `project/fde/mission-brief.json` | Task `fde-00x` cập nhật ngay |
| Gỡ/ thêm blocker | `risks[]` trong mission brief | Cột **Blocked** + Notes |
| Chốt một quyết định | `project/fde/adr/NNNN-kebab-case-title.md` | **Decision Logs** + follow-up task + ADR graph |
| Đặt lịch họp / review / gate check | `project/fde/schedule.json` | Thẻ **Schedule** + màn hình Schedule |
| Việc kỹ thuật đang mở | GitHub issue/PR | Task `GH-*` / `PR-*` |
| Thêm/bớt một project, đổi version hoặc bundle budget | `dist/release-manifest.json` (do `npm run build` sinh ra) | **Projects** + **Releases** + KPI effort đổi theo ngay |

## 2. Cấu trúc màn hình

| Màn hình | Nội dung |
| --- | --- |
| **Overview** | Hero mission + KPI (task mở, in progress, blocked, P0/P1, % hoàn thành, ADR đã chốt), **donut phân bổ trạng thái**, **feed cảnh báo cần nhà đầu tư biết**, "Ưu tiên xử lý ngay", tải theo owner, bảng **My Projects** (task đang mở), timeline delivery gates, thẻ **Schedule** ngay dưới My Projects, Notes rủi ro, Activity. Sidebar có **sprint card** (tuần thật + gate progress) |
| **All Tasks** | Danh sách đầy đủ, lọc theo status / owner / priority / nguồn + tìm kiếm full-text |
| **Kanban** | 4 cột Blocked → In Progress → Open → Done |
| **Projects** | Project card sinh từ `dist/release-manifest.json` (4 game package) + chương trình **FDE Live Interaction**: status (active/planning/shipped), health (at-risk), số task/blocker, % effort theo story-point, owner, budget gzip, top 3 issue; bảng **Effort theo project** (P0 13 · P1 8 · P2 5 · P3 2) |
| **Notifications** | Cảnh báo suy ra từ repo: blocker, gate chưa qua, ADR `proposed`, governance finding, họp trong 24h, package ≥ 90% bundle budget. Lọc theo critical / issue / gate / decision / schedule, mỗi cảnh báo link thẳng tới panel nguồn |
| **Releases** | Bảng release thật: version, legal class (G2/G4), budget gzip + thanh tiêu thụ, `release_sha256`, trạng thái verify, link mở game; kèm digest `bundle_sha256` và standalone bundle |

> **Nguồn cảm hứng:** nhóm màn hình Projects → Issues → Notifications → Releases theo mô hình Jira-clone (`lexuankhanh1612/v0-jira-clone`), nhưng toàn bộ số liệu ở đây **suy ra** từ file thật trong repo. Jira-clone giữ issue/project trong `lib/*.ts` mock và story point nhập tay; Game9K không có bảng project thứ hai — project tồn tại vì release manifest hoặc mission brief nói nó tồn tại, và story point = trọng số priority (P0 13 · P1 8 · P2 5 · P3 2), xem `src/lib/projectPortfolio.js`.
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
| `GET /api/tasks/portfolio?anchor=YYYY-MM-DD` | Portfolio overlay: `projects[]` (từ release manifest + FDE program), `alerts[]`, `releases`, `statusBreakdown`, `sprint`, `totals` |
| `GET /api/schedule?anchor=YYYY-MM-DD` | Một tuần lịch (Mon→Sun): meetings, deadlines suy ra, `upcoming`, `stats`, `validation` |
| `POST /api/tasks` | Tạo task → GitHub Issue nếu có token, ngược lại trả lệnh `gh` + link tạo issue |

Response chính:

```json
{
  "ok": true,
  "projectId": "game9k-live-interaction",
  "kpis": { "total": 6, "active": 6, "open": 2, "inProgress": 2, "blocked": 2,
            "done": 0, "completionPct": 0, "adrOpen": 0, "adrInForce": 3, "adrTotal": 3,
            "adrAccepted": 3, "adrProposed": 0,
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

### Ý nghĩa các KPI ADR

| KPI | Nghĩa |
| --- | --- |
| `adrTotal` | Tổng số ADR trong `project/fde/adr/` |
| `adrOpen` | ADR **còn phải chốt** (`proposed` / `withdrawn`) — con số này mới là "việc còn mở" |
| `adrInForce` | ADR còn hiệu lực (`proposed` / `accepted` / `deprecated`) |
| `adrAccepted` / `adrProposed` | Đã chốt / đang chờ chốt, dùng cho KPI "ADR đã chốt" trên Overview |

Trước đây `adrOpen` đếm cả ADR `accepted`, nên một dự án đã chốt hết vẫn hiện `open 3 / total 3` — dễ đọc thành "chưa quyết gì". Từ bản này `adrOpen` chỉ còn việc thật sự chờ chốt.

### Suy giảm an toàn

- Không có mạng / GitHub API lỗi → board vẫn render FDE + ADR tasks, `githubReady: false`, thanh bên hiện **"GitHub offline — dùng FDE + ADR"**.
- Vercel static (không có Express API) → UI rơi về **static mode** và báo rõ.
- Thiếu `GITHUB_TOKEN` khi tạo task → trả `command` (`gh issue create …`) và `newIssueUrl`, không tạo dữ liệu ma.
- `project/fde/schedule.json` thiếu/hỏng → thẻ Schedule báo lỗi cục bộ, board FDE + ADR **không** bị ảnh hưởng (schedule là endpoint riêng).
- `dist/release-manifest.json` thiếu (deploy static không build) → **Projects** chỉ còn chương trình FDE, **Releases** báo "chưa có release manifest — chạy `npm run build`"; API vẫn trả `ok: true`, không 500.

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

### 5.1 Lấy `GITHUB_TOKEN` ở đâu (fine-grained PAT)

Portal chỉ cần **một** token phía server, quyền tối thiểu trên **đúng một repo**. Đừng dùng token của `gh auth login`, token CI hay token Arena — đó là credential khác quyền và dễ bị thu hồi ngoài ý muốn.

**Tạo token**

1. Mở https://github.com/settings/personal-access-tokens/new (Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token).
2. **Token name**: `game9k-tasks-portal`. **Expiration**: 90 ngày (fine-grained bắt buộc có hạn, tối đa 366 ngày) → ghi ngày hết hạn vào lịch để rotate.
3. **Resource owner**: `khanhlegood1`. **Repository access**: *Only select repositories* → `Game9K-Starter-Kit`. Không chọn "All repositories".
4. **Repository permissions** — chỉ 2 mục:

   | Permission | Mức | Vì sao |
   | --- | --- | --- |
   | **Issues** | Read and write | `GET /repos/:repo/issues` để đọc issue/PR đang mở; `POST …/issues` để tạo task từ portal |
   | **Metadata** | Read (tự động) | Bắt buộc đi kèm mọi permission khác |

   Không cấp `Contents`, `Pull requests` write, `Administration`, `Secrets`, `Workflows` — portal không ghi code, không merge, không đổi settings.
5. **Generate token** → copy chuỗi `github_pat_…` (chỉ hiện **một lần**; nếu mất thì phải tạo token mới).

**Kiểm tra token trước khi gắn vào Vercel** (đừng dán token vào chat/commit):

```bash
export GITHUB_TOKEN='github_pat_…'          # chỉ trong shell hiện tại
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/khanhlegood1/Game9K-Starter-Kit/issues?state=open&per_page=1
# 200 = đọc được. 401 = token sai/hết hạn. 404 = thiếu quyền Issues hoặc sai repo.
```

**Gắn vào Vercel** (Project `game9k-starter-kit`):

```bash
# Production + Preview, không lộ giá trị ra log shell history
printf '%s' 'github_pat_…' | vercel env add GITHUB_TOKEN production
printf '%s' 'github_pat_…' | vercel env add GITHUB_TOKEN preview
vercel --prod        # env mới chỉ có hiệu lực sau khi redeploy
```

Hoặc qua UI: **Settings → Environment Variables → Add** → Key `GITHUB_TOKEN`, Value dán token, Environments chọn *Production* + *Preview* → **Save** → **Redeploy** (Deployments → ⋯ → Redeploy).

**Xác nhận đã chạy**

```bash
curl -s https://game9k-starter-kit.vercel.app/api/tasks \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("githubReady:", j.githubReady, "| issues:", j.sources.github?.count, "| error:", j.sources.github?.error)})'
```

- `githubReady: true` và `error: null` → xong; issue/PR thật xuất hiện trên board dạng task `GH-*` / `PR-*`.
- `githubReady: false` + `github_http_401` → token hết hạn/sai. `github_http_404` → thiếu quyền **Issues** hoặc token không trỏ đúng repo.

**Local dev**: thêm `GITHUB_TOKEN=github_pat_…` vào `.env` (đã có trong `.gitignore`, mẫu ở `.env.example`). `/api/tasks` local cũng đọc biến này.

**Rotate / thu hồi**: token hết hạn thì portal **không sập** — board vẫn dựng từ FDE + ADR, chỉ mất phần GitHub và `githubReady` thành `false`. Khi đó tạo token mới, cập nhật env, redeploy, rồi **Revoke** token cũ ở trang Fine-grained tokens.

## 6. Deploy lên Vercel

Repo đã cấu hình `vercel.json`:

- `public/` là output tĩnh → `/tasks.html` được serve trực tiếp.
- `/api/(.*)` rewrite sang `api/index.cjs`, wrapper CommonJS dùng lại `createGame9KServer()` để **không nhân đôi logic API**.
- `functions["api/index.cjs"].includeFiles` gồm `project/fde/**`, `public/games/**`, `dist/**` để function đọc được mission brief + ADR + release manifest.

Thiết lập trên Vercel project `game9k-starter-kit`:

1. Thêm `GITHUB_TOKEN` (scope: Production, Preview) — cách tạo token và quyền cần cấp xem **§5.1**.
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
