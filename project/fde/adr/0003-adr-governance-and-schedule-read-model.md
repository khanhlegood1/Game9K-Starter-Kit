---
id: "0003"
title: "ADR governance theo MADR v4 + hve-core và Schedule là read model"
description: "Thay bộ ADR phẳng kiểu ADR-00x bằng MADR v4 frontmatter + taxonomy 6 trạng thái, đồng thời đưa lịch họp vào repository dưới dạng read model thay vì một calendar database thứ hai."
type: "network"
status: "accepted"
date: "2026-11-23"
proposed_date: "2026-11-22"
accepted_date: "2026-11-23"
deciders:
  - Studio Engineering
  - Product
consulted:
  - Live Ops
informed:
  - Creator Success
affected_components:
  - project/fde/adr/
  - project/fde/adr/.adr-config.yml
  - project/fde/adr/_template.md
  - project/fde/schedule.json
  - src/lib/adrRegistry.js
  - src/lib/scheduleBoard.js
  - src/services/TaskBoardService.js
  - cli/g9k.js
  - public/tasks.html
related:
  - "0001"
  - "0002"
tags:
  - adr
  - schedule
  - governance
supersedes: []
superseded-by: null
asr_triggers:
  - kind: maintainability
    evidence: "docs/ADR-GOVERNANCE.md; src/lib/adrRegistry.js là bộ đọc duy nhất cho portal, CLI và CI."
    note: "Nếu portal và CI bắt đầu tự parse ADR riêng thì áp lực bảo trì tăng gấp đôi, phải quay lại quyết định này."
  - kind: evolvability
    evidence: "project/fde/schedule.json là file thật, đọc bởi loadSchedule() và /api/schedule."
    note: "Khi cần lặp lịch, mời người ngoài hoặc đặt reminder, file JSON sẽ hết đủ và cần tích hợp calendar thật."
  - kind: compliance
    evidence: "deciders/consulted/informed là vai trò, không phải tên người (ADR-PERSONA-RULE)."
    note: "Nếu compliance yêu cầu truy vết theo người thay vì theo vai trò, schema phải đổi và cần ADR mới."
---

# 0003 — ADR governance theo MADR v4 + hve-core và Schedule là read model

## Problem

Bộ ADR của FDE nằm ở dạng `ADR-00x-*.md` không frontmatter, status nằm trong bullet, không có transition hợp lệ, không có liên kết supersede hai chiều. Hệ quả: không AI nào (người hay agent) đọc được trạng thái quyết định một cách máy móc, `npm test` không kiểm được ADR, và portal phải tự parse markdown bằng một bộ luật riêng — dễ lệch khỏi CI.

Song song, portal task thiếu **lịch họp**. Cách sai là thêm một calendar database/UI thứ hai; cách đúng là đưa lịch vào cùng nguồn sự thật và cùng triết lý read model với task board.

## Context

- Hai repo tham chiếu đã chốt chuẩn: `khanhlegood1/hve-core` (`adr-standards.instructions.md`, MADR v4.0.0 CC0) và `khanhlegood1/architecture-decisions` (Factory-X).
- Factory-X dùng folder `adrNNN-<slug>/README.md`; hve-core dùng file phẳng `NNNN-kebab-case-title.md` (GP-16). Repo này CLI-first, cần `git diff` gọn và path ổn định trong `mission-brief.json` → chọn hve-core.
- Task board đã có tiền lệ: `project/fde/mission-brief.json` là nguồn sự thật, board chỉ là projection. Lịch phải theo cùng khuôn.
- Nhà đầu tư cần thấy "họp gì, khi nào, ai dự" ngay trên Overview, không cần quyền vào tool nội bộ.

## Decision

1. Chuyển toàn bộ ADR sang `project/fde/adr/NNNN-kebab-case-title.md` với frontmatter MADR v4 (id, title, description, type, status, dates, deciders, consulted, informed, affected_components, related, tags, supersedes, superseded-by, asr_triggers).
2. Chỉ áp Factory-X ở phần còn tương thích: **type** `network|use-case`, section bắt buộc Problem/Context/Decision/Consequences/Alternatives, **ADR graph**, và **roles-not-people**; không áp folder-per-ADR.
3. `src/lib/adrRegistry.js` là **bộ đọc/luật duy nhất**; `src/lib/taskBoard.js` chỉ project từ registry, không parse markdown riêng.
4. Trạng thái đóng: `proposed → accepted → deprecated → superseded`, cùng `rejected`/`withdrawn` là cuối. Transition ngoài bảng là finding.
5. `project/fde/schedule.json` là nguồn sự thật duy nhất cho lịch họp; deadline trên lịch được **suy ra** từ delivery gate, ADR `proposed_date` và task có `due`, không lưu tay.
6. Portal render Schedule ở Overview (dưới My Projects) và một view riêng; API `/api/schedule?anchor=YYYY-MM-DD` là bề mặt duy nhất.

## Consequences

**Tích cực**

- `npm run adr -- validate` là gate CI thật: 0 error mới merge, lỗi có rule id ổn định để diff.
- Portal, CLI và test dùng chung một registry → không còn hai định nghĩa "ADR đang mở".
- Graph + supersession hiển thị trên Decision Logs giúp nhà đầu tư thấy lịch sử quyết định, không chỉ trạng thái hiện tại.
- Lịch họp nằm trong repo: review qua PR, có test overlap, không lệch với gate/task.

**Đánh đổi (Bad)**

- Viết ADR tốn công hơn: frontmatter + 5 section + ASR trigger cho mỗi quyết định.
- Không có thông báo/reminder tự động; muốn nhắc họp vẫn phải gửi tay hoặc tích hợp calendar ngoài.
- `schedule.json` là bản sao một chiều từ lịch thật của team — nếu team đổi giờ ở nơi khác mà không sửa file, portal sẽ sai cho tới lần cập nhật kế tiếp.
- Thay đổi phá vỡ tương thích: ADR cũ và `mission-brief.json` phải đổi path cùng lúc, nếu không `npm run fde` và test sẽ đỏ.

## Alternatives

| Phương án | Vì sao không chọn |
| --- | --- |
| Giữ `ADR-00x-*.md` và chỉ thêm validator lỏng | Không giải quyết được máy đọc trạng thái; validator sẽ phải mã hoá hai format mãi mãi |
| Theo nguyên folder `adrNNN-<slug>/README.md` của Factory-X | Path dài, `git diff` nhiễu, phải sửa mọi tham chiếu artifact; lợi ích (`resources/`, `api/` sinh tự động) chưa cần ở quy mô này |
| Tạo calendar database/service riêng cho Schedule | Vi phạm nguyên tắc "một nguồn sự thật"; thêm một nơi có thể trôi khỏi task board |
| Nhúng lịch vào `mission-brief.json` | Trộn thực thể: brief là hợp đồng mission/gate, lịch thay đổi hằng tuần; gộp sẽ làm mọi diff của brief nhiễu |
| Render lịch bằng Google Calendar embed | Không kiểm được bằng test, không deterministic, phụ thuộc quyền ngoài |

## Confirmation

- `npm run adr -- validate` → 0 error, 0 warning; `npm test` (92 test) xanh.
- `GET /api/tasks/adrs/registry` trả `summary.ok = true`, graph có cạnh `related` giữa `0001` và `0002`.
- Portal: thẻ Schedule hiển thị tuần Mo 23 → Su 29 với 8 cuộc họp; `‹ ›` đổi tuần gọi lại `/api/schedule?anchor=…`; ngày hôm nay được khoanh màu brand.
- `npm run schedule -- --anchor 2026-11-26` và `/api/schedule` trả cùng một tuần (deterministic).

> Source: `project/fde/adr/0001-mission-delta-and-live-contract.md`, `project/fde/adr/0002-investor-task-board-source-of-truth.md`, `docs/ADR-GOVERNANCE.md`, `test/adr-registry.test.js`, `test/schedule-board.test.js`.

## Follow-ups

- `fde-006`: Weekly summary phải cross-link task ↔ ADR ↔ gate ↔ cuộc họp để nhà đầu tư đối chiếu được một chỗ.
- `fde-005`: Cấu hình `GITHUB_TOKEN` để Decision Logs và board cùng phản ánh issue thật trên production.
- Duy trì `last_decision_id` trong `.adr-config.yml` mỗi lần tạo ADR mới (`ADR-CONFIG-LAST-ID-STALE` là cảnh báo, không phải lỗi).
