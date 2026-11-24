---
id: "0001"
title: "Mission, Delta và live contract của Marble Race PK"
description: "Chốt mission, ba Delta và live contract PK (room isolation, normalized event là SoR, late-event queue, gift as participation) cho pilot Marble Race Live."
type: "network"
status: "accepted"
date: "2026-11-23"
proposed_date: "2026-11-21"
accepted_date: "2026-11-23"
deciders:
  - "Studio Engineering"
  - "Product"
consulted:
  - "Live Ops"
  - "Compliance"
informed:
  - "Creator Success"
affected_components:
  - "src/lib/streamEventNormalizer.js"
  - "src/services/LiveRoomHub.js"
  - "public/sdk/game9k-sdk.js"
  - "public/games/marble-race-live/"
related:
  - "0002"
tags:
  - "fde"
  - "live-contract"
  - "pk"
supersedes: null
superseded-by: null
asr_triggers:
  - kind: "compliance"
    evidence: "G2 classification + U18 portal controls in game9k.manifest.json; viewer names/avatars are live user data."
    note: "Gift must stay a participation mechanic; no viewer may be treated as an investor or account holder."
  - kind: "availability"
    evidence: "TikTok/YouTube upstream drift is external to the repository; simulator and SSE fallback already shipped."
    note: "A single upstream failure must not take both PK rooms down."
  - kind: "performance"
    evidence: "Marble telemetry capped at 10 Hz under the 20 Hz hard ceiling; bundle budget 125 KB gzip."
    note: "Crowd of 120 marbles must stay inside the realtime and bundle budgets."
---

# Mission, Delta và live contract của Marble Race PK

## Problem

Game9K đã có gateway đa nền tảng, normalizer, SDK bridge, engine Marble Race và release gate tự động. Vấn đề không còn là "có code chạy được" mà là "creator có dùng được trong điều kiện live thật hay không". Ba Delta cụ thể đang cản outcome:

1. **Dual-room PK:** cần hai room cô lập với team attribution authoritative.
2. **Viewer avatar crowd:** khán giả cần thấy nhiều người thật trong crowd, không phải một racer đổi tên.
3. **Commerce as participation:** gift phải có hệ quả xã hội thấy được, không phải điểm số mờ.

## Context

Pilot chạy trên TikTok Live và YouTube Live, qua gateway Express + Socket.IO (SSE fallback), overlay trong `<iframe sandbox="allow-scripts">`. Không có identity system dùng chung, không có payout, không có SLA trả phí ở giai đoạn này. Nhà đầu tư cần thấy trạng thái thật: technical gate pass không đồng nghĩa creator UAT pass.

## Decision

1. `Game9K.stream.connectPair({ A, B })` là contract chính thức cho PK; mỗi room giữ `roomId` riêng và không nhận event chéo.
2. Normalized event (`roomId`, `seq`, `ts`, `user`, `type`) là System of Record; Canvas chỉ là projection.
3. Event đến sau khi heat đóng được queue cho heat kế tiếp; kết quả heat đã finish là bất biến.
4. Seed của heat được hiển thị để replay/giải thích công bằng.
5. Gift tạo team boost + opponent obstacle, hiển thị toast; **không** tạo cam kết tài chính/investment.
6. FDE summary tách khỏi technical release gates: `GO_FOR_LAUNCH` không đồng nghĩa `OPERATING` khi UAT/Day-2 chưa xong.

## Consequences

**Tích cực**

- PK kiểm chứng bằng regression test, replay bằng seed, audit theo `seq`.
- Studio có capability tái dùng (hub + SDK + normalizer) thay vì overlay một lần.
- Trạng thái dự án trung thực: `PILOT_READY`/`ACTION_REQUIRED` thay vì overclaim.

**Đánh đổi (Bad)**

- Phải giữ thêm queue + replay logic và chịu trần 120 marble.
- Late event không được phản hồi ngay, cần UI giải thích "heat kế tiếp".
- Tăng chi phí vận hành: runbook, UAT, telemetry cho Live Ops.

## Alternatives

| Phương án | Vì sao không chọn |
| --- | --- |
| Một room chung, suy ra team từ payload client | Cross-talk và giả mạo attribution; không đáp ứng PK |
| Đổi tên single-player racer cho nhiều viewer | Không tạo cảm giác crowd, không quan sát được join rate |
| Gift = điểm số ẩn | Viewer không hiểu tác động, không đo được engagement |
| Sửa heat đang chạy khi event đến muộn | Phá tính công bằng và replayability |
| Coi technical gate là bằng chứng product success | Che giấu thiếu UAT và rủi ro Day 2 |

## Confirmation

- `test/pk-contract.test.js` xác nhận room isolation và team attribution.
- Source: bundle budget và telemetry cap được kiểm bởi `src/lib/manifestValidator.js` (xem `npm run validate`).
- `test/marble-race.test.js` xác nhận determinism từ seed và không mutation sau finish.
- `npm run fde` + `npm run adr` chạy trong CI; `verify` giữ artifact integrity.

## Follow-ups

- `fde-001`: UAT hai creator với evidence anonymized.
- `fde-002`: instrumentation latency/join rate.
- `fde-003`: runbook Day-2.
- `fde-004`: xác nhận slug game dinosaur thứ hai trước khi mở rộng.
