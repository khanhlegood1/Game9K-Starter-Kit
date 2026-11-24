---
id: "0002"
title: "Một nguồn sự thật cho bảng task nhà đầu tư"
description: "Tasks Portal chỉ đọc và tổng hợp từ mission brief, ADR và GitHub; không tạo database task thứ hai."
type: "use-case"
status: "accepted"
date: "2026-11-23"
proposed_date: "2026-11-23"
accepted_date: "2026-11-23"
deciders:
  - "Studio Engineering"
  - "Product"
consulted:
  - "Live Ops"
informed:
  - "Creator Success"
affected_components:
  - "public/tasks.html"
  - "public/tasks/tasks.js"
  - "src/lib/taskBoard.js"
  - "src/services/TaskBoardService.js"
  - "src/lib/adrRegistry.js"
related:
  - "0001"
tags:
  - "tasks"
  - "governance"
  - "adr"
supersedes: null
superseded-by: null
asr_triggers:
  - kind: "maintainability"
    evidence: "Board must render from project/fde/mission-brief.json + project/fde/adr + GitHub without a second datastore to sync."
    note: "A drifting project board is worse than no board for investors; the read model keeps one source of truth."
  - kind: "cost"
    evidence: "GitHub REST unauthenticated is 60 requests/hour/IP; the service caches responses for 60 s."
    note: "Caching plus a token keeps the portal inside free-tier quotas."
  - kind: "availability"
    evidence: "Vercel static mode and offline GitHub both must still show FDE + ADR tasks."
    note: "Degradation is explicit: githubReady=false instead of an empty board."
---

# Một nguồn sự thật cho bảng task nhà đầu tư

## Problem

Nhà đầu tư cần thấy ngay việc gì còn **Open**, ai chịu trách nhiệm, cái gì đang chặn ship và quyết định nào đã được chốt. Hiện các thông tin này nằm rải rác ở:

- `project/fde/mission-brief.json` (next action, risk, gate, metric),
- `project/fde/adr/*.md` (quyết định + follow-up),
- GitHub Issues/PRs (công việc kỹ thuật hằng ngày).

Nếu dựng một task app có database riêng (kiểu Jira/Notion/Trello), bảng đó sẽ lệch khỏi repo trong vài ngày: task được tick trong app nhưng code chưa merge, hoặc ngược lại.

## Context

Quyết định này phụ thuộc [0001](0001-mission-delta-and-live-contract.md): mission brief đã là source of truth cho Delta, gate và metric. Portal chỉ là **read model** trên cùng dữ liệu đó, cộng thêm ADR registry và GitHub.

## Decision

1. Portal `public/tasks.html` **chỉ đọc và tổng hợp**, không lưu trạng thái task riêng.
2. Ba nguồn dữ liệu chính thức: mission brief, ADR registry, GitHub issues/PRs. Thứ tự ưu tiên khi trùng id: FDE → ADR → GitHub.
3. Mọi phép biến đổi (status/priority normalise, ADR parse, dedupe, KPI) là **deterministic, không LLM**, trong `src/lib/taskBoard.js` + `src/lib/adrRegistry.js`; I/O nằm ở `src/services/TaskBoardService.js`.
4. Tạo task = tạo **GitHub Issue** (qua token server) hoặc trả lệnh `gh issue create` khi không có token.
5. GitHub là **tuỳ chọn và có thể suy giảm**: lỗi mạng/401 chỉ làm `githubReady: false`, board vẫn render FDE + ADR.
6. Board tách khỏi release gate: `GO_FOR_LAUNCH` kỹ thuật không làm task P0 biến mất khỏi board.

## Consequences

**Tích cực**

- Board luôn khớp với repo/GitHub; ai xem cũng truy được về file hoặc issue gốc.
- Không phát sinh hệ thống thứ hai phải đồng bộ và phân quyền.
- Test được toàn bộ logic mà không cần network (inject `fetchImpl`).

**Đánh đổi (Bad)**

- Muốn đổi trạng thái task phải sửa file hoặc issue, không có nút kéo-thả đổi state.
- GitHub API unauthenticated bị rate limit → cần cache 60 s và token cho môi trường thật.
- Portal không phải công cụ planning; nó là read model của kế hoạch đã có.

## Alternatives

| Phương án | Vì sao không chọn |
| --- | --- |
| Dùng Notion/Jira làm nguồn chính | Lệch khỏi repo; nhà đầu tư thấy trạng thái không kiểm chứng được |
| Lưu task trong `localStorage` của portal | Mỗi người một bảng, không phải nguồn sự thật |
| Đọc GitHub là bắt buộc | Vercel/CI không token vẫn phải demo được |
| Sinh board bằng LLM | Không tái lập được, có thể bịa task hoặc mất blocker |

## Confirmation

- `test/tasks-board.test.js` phủ normalise, parse ADR, dedupe, KPI, lọc, cache, suy giảm 401.
- `test/adr-registry.test.js` phủ validator ADR + graph + lifecycle.
- `npm run tasks` trên CI trả cùng một board cho cùng một commit.
- Source: rate-limit và cache được nêu trong `src/services/TaskBoardService.js` (cacheTtlMs 60s).

## Follow-ups

- `fde-005`: Gắn `GITHUB_TOKEN` trên Vercel (Production) để board đọc issue/PR ổn định và cho phép tạo task từ portal.
- `fde-006`: Thêm badge "task ↔ ADR ↔ gate" vào Weekly Executive Summary để nhà đầu tư đối chiếu board với báo cáo tuần.
- `fde-007`: Hiển thị ADR graph và lifecycle trong Decision Logs của Tasks Portal.
