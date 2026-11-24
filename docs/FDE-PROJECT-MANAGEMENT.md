# Game9K FDE Project Management

> **Mục đích:** biến các nguyên tắc trong [Awesome-FDE-Roadmap](https://github.com/xuankhanh1612/Awesome-FDE-Roadmap) thành một operating model thực thi cho Game9K. Đây là quy trình giao hàng và vận hành, không phải một bộ tài liệu học tập.

## 1. Mission của Game9K

Game9K là lớp bridge giữa game HTML5, creator/live room, khán giả và studio operations. Mỗi initiative phải trả lời được:

> **Một creator có thể tạo ra một live interaction đáng tin cậy, đo được và có thể vận hành vào Day 2 như thế nào?**

Mission hiện tại nằm trong source of truth có cấu trúc tại [`project/fde/mission-brief.json`](../project/fde/mission-brief.json). Brief này là nơi ghi:

- stakeholder và outcome mong muốn;
- **Delta**: năng lực sản phẩm hiện tại, field gap và phần glue cần triển khai;
- kết quả đo được, owner và evidence;
- discovery checklist, workstream, risk/blocker, next action;
- delivery gates và Day-2 ownership.

Không mở rộng scope chỉ vì một ý tưởng kỹ thuật thú vị. Scope phải làm giảm một Delta cụ thể hoặc nâng một success metric cụ thể.

## 2. Quy trình từ discovery đến Day 2

| Phase | Câu hỏi cần trả lời | Artifact bắt buộc | Exit gate |
| --- | --- | --- | --- |
| 0. Mission/intake | Ai cần kết quả gì? Delta nào đang cản outcome? | Mission brief, scope boundary | Champion và outcome đã được nêu |
| 1. Discovery | Champion, blocker, success metric là gì? System of Record ở đâu? | [Site Survey](../project/fde/site-survey.md) | Có evidence về data, access, compliance và connectivity |
| 2. Scoping | MVA nào nhỏ nhất nhưng tạo được value? Không làm gì? | [Technical Scoping & PRD](../project/fde/technical-scoping-prd.md) | DoD, UAT, SOW boundary và owner đã được chấp thuận |
| 3. Architecture/decision | Glue kết nối hệ thống nào? Quyết định nào khó đảo ngược? | [Deployment Architecture](../project/fde/deployment-architecture.md), ADR | ADR/decision log có consequence và rollback |
| 4. Build/pilot | Đã biến Delta thành capability thật chưa? | PR, tests, manifest, telemetry evidence | `npm test`, `validate`, `build`, `verify`, `decide` pass |
| 5. UAT/release | Creator và viewer có đạt outcome trong điều kiện thật không? | UAT checklist/evidence, release decision | Technical gates **và** field UAT cùng đạt |
| 6. Day 2 | Ai trực, ai xử lý incident, ai xem metric tuần sau? | [Weekly Executive Summary](../project/fde/weekly-executive-summary.md), runbook | Ops owner nhận bàn giao và có escalation rota |

### Ba câu hỏi bắt buộc trước khi code

1. **System of Record:** dữ liệu nào là sự thật vận hành? Với live Game9K, normalized room events, room/team attribution và heat telemetry là SoR; Canvas chỉ là projection.
2. **Cost of Inaction:** nếu không làm Delta này, creator/viewer/studio mất gì? Nêu bằng outcome, không nêu bằng số dòng code.
3. **Day 2 ownership:** sau khi PR merge, ai theo dõi, phản ứng, rollback và báo cáo? Nếu không có owner, chưa được coi là production-ready.

## 3. Discovery checklist chuẩn hóa

Mỗi Site Survey phải có câu trả lời có evidence cho tất cả nhóm sau:

- **People:** Champion, Blocker, approver, day-2 operator và escalation path.
- **Outcome:** success metric, baseline, target, sampling window và nguồn evidence.
- **Data:** System of Record, data classification (viewer identity/avatar/event), retention, redaction và replay policy.
- **Ingestion:** TikTok/YouTube/webhook/simulator, event normalization, ordering, deduplication, queue/back-pressure và late event behavior.
- **Compliance/security:** G2/U18 controls, consent/display policy, avatar allowlist/proxy, iframe sandbox, cookie boundary, rate limit và secret handling.
- **Access/connectivity:** credentials do ai giữ, room isolation, origin/proxy, Socket.IO/SSE fallback, reconnect và quota/rate limit của upstream.
- **Infrastructure:** bundle budget, telemetry Hz, deployment target, artifact hash, observability, backup/replay và rollback.
- **Scope boundary:** in/out, assumptions, external dependency và điều kiện để chuyển từ MVA sang productization.

Checklist đã được phản ánh bằng các entry trong `discovery_checklist` của mission brief. Không đánh dấu `complete` nếu chỉ có assumption; phải có evidence path hoặc owner/action để thu thập evidence.

## 4. Artifact contract

Các artifact dưới đây là một chuỗi, không phải các tài liệu độc lập:

1. **Site Survey** — chụp field reality trước implementation.
2. **Technical Scoping & PRD** — chuyển Delta thành MVA, measurable outcome, Definition of Done và UAT.
3. **Deployment Architecture** — chỉ rõ đường đi của event, trust boundary, fallback và Day-2 observability.
4. **ADR/decision log** — ghi quyết định, alternatives, consequence, rollback và owner; decision dùng qua Decisions Studio phải trỏ về một ADR khi ảnh hưởng scope/architecture/compliance.
5. **Weekly Executive Summary** — báo cáo outcome, metric, risk/blocker, decision cần xin và next action; không chỉ báo cáo số ticket.

Các bản Game9K hiện tại:

- [`project/fde/site-survey.md`](../project/fde/site-survey.md)
- [`project/fde/technical-scoping-prd.md`](../project/fde/technical-scoping-prd.md)
- [`project/fde/deployment-architecture.md`](../project/fde/deployment-architecture.md)
- [`project/fde/adr/ADR-001-mission-delta-and-live-contract.md`](../project/fde/adr/ADR-001-mission-delta-and-live-contract.md)
- [`project/fde/weekly-executive-summary.md`](../project/fde/weekly-executive-summary.md)

## 5. Delivery control: MVA, DoD và UAT

### MVA hiện tại: Marble Race Live PK

MVA là hai room live cô lập, mỗi room có team attribution authoritative, viewer join/gift/chat tạo ra tác động nhìn thấy được, event late được queue cho heat kế tiếp và có simulator/fallback để demo/replay. MVA **không** bao gồm:

- giả định mọi upstream TikTok/YouTube đều online;
- xây một identity chung cho game chưa được xác nhận;
- biến interaction gift thành investment/financial promise;
- coi technical `GO_FOR_LAUNCH` là bằng chứng creator UAT.

### Definition of Done cho một delivery slice

- mission/Delta và metric owner đã cập nhật;
- Site Survey có evidence về Champion, Blocker, SoR, data/security/access/quota;
- PR có scope boundary, test plan, rollback và ADR nếu cần;
- game manifest và release constraints vẫn hợp lệ;
- regression suite pass, artifact build/verify pass;
- event contract, room isolation và sandbox invariant không bị phá;
- UAT ghi nhận setup, join, interaction, reconnect, next-heat queue và failure recovery;
- runbook/Day-2 owner được cập nhật;
- weekly summary có metric và link evidence.

### UAT tối thiểu cho PK

Một creator TikTok và một creator YouTube (hoặc hai fixture simulator khi upstream không khả dụng) phải kiểm tra: connect room, join viewer, gift-to-opponent, team attribution, late event, reconnect, SSE/Socket.IO fallback, avatar fallback và `nextHeat()` queue. Evidence phải anonymize viewer data.

## 6. Risk và escalation

- **P0 / blocker:** mất event, cross-room contamination, security/compliance breach, không rollback được. Dừng release; owner phản hồi ngay.
- **P1 / high:** creator không setup được, p95 latency vượt target, reconnect không phục hồi, metric chính giảm. Escalate trong ngày; cần mitigation trước pilot tiếp theo.
- **P2 / medium:** workaround còn dùng được hoặc thiếu evidence chưa chặn pilot. Gắn owner/date và theo dõi weekly.
- **P3 / low:** cosmetic/backlog; không được lấn át MVA.

Mọi risk phải có `id`, severity, status, owner và mitigation. Risk `blocked` không được ẩn trong backlog; nó phải xuất hiện ở FDE control plane và weekly summary.

## 7. Liên kết với cơ chế Game9K đang có

FDE control plane dùng chung các release và decision controls hiện hữu:

- **Decisions Studio:** [`/decisions.html`](../public/decisions.html) có tab **Mission & Delta** đọc `/api/project/fde`, cạnh release gates, backlog và audit trail.
- **ProjectDecisionsService:** đọc `project/fde/mission-brief.json`, validate deterministic, tóm tắt readiness và chạy technical Decisions audit qua `runFdeProjectAudit()`.
- **CLI:**
  ```bash
  npm run fde -- --json       # validate brief + FDE summary + linked release evidence
  npm run decide -- --json    # technical decision gates; output kèm fdeProject summary
  npm run validate -- --json  # manifest/package gate
  npm run build -- --json
  npm run verify -- --json
  npm test
  ```
- **REST:** `GET /api/project/fde` cho state; `POST /api/project/fde/audit` chạy FDE state cùng technical gates. Các endpoint `decisions/*` và `ProjectDecisionsService` cũ vẫn là contract tương thích.
- **Release artifacts:** `game9k.manifest.json`, `dist/release-manifest.json`, SHA-256 tree và `verify` là evidence của artifact integrity; không chỉnh `dist/` thủ công.

`npm run decide` vẫn là technical/release decision gate. It does not fabricate creator UAT. FDE status có thể là `PILOT_READY` hoặc `ACTION_REQUIRED` trong khi technical gates là `GO_FOR_LAUNCH`; chênh lệch này là chủ ý để không biến readiness kỹ thuật thành product outcome.

## 8. Weekly operating rhythm

- **Đầu tuần:** Product + Creator Success rà Delta, metric baseline và next action P0/P1.
- **Trong tuần:** mỗi PR cập nhật workstream/ADR/risk khi làm thay đổi contract hoặc scope.
- **Cuối tuần:** Live Ops ghi evidence telemetry/UAT/incident; Product phát hành Weekly Executive Summary.
- **Trước release:** chạy tuần tự `test → build → verify → decide`; sau build mới verify để tránh hash mismatch.
- **Sau release:** Day-2 owner xác nhận room health, upstream status, rollback path và metric review.

## 9. Quy tắc thay đổi quy trình

Thay đổi mission, SoR, data classification, scope boundary, release gate hoặc Day-2 owner cần cập nhật mission brief và tạo/cập nhật ADR trong cùng PR. Template mới phải được thêm vào artifact list và validator/test trước khi được dùng cho một initiative khác.
