# ADR-001 — Mission, Delta và live contract của Marble Race PK

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Studio Engineering, Product, Live Ops, Compliance
- **Related:** `project/fde/mission-brief.json`, `docs/FDE-PROJECT-MANAGEMENT.md`, `docs/DECISIONS-GOVERNANCE.md`

## Context

Game9K đã có gateway đa nền tảng, normalizer, SDK bridge, engine Marble Race và release gate tự động. Vấn đề không còn là "có code chạy được" mà là "creator có dùng được trong điều kiện live thật hay không".

Ba Delta cụ thể đang cản outcome:

1. **Dual-room PK:** cần hai room cô lập với team attribution authoritative.
2. **Viewer avatar crowd:** khán giả cần thấy nhiều người thật trong crowd, không phải một racer đổi tên.
3. **Commerce as participation:** gift phải có hệ quả xã hội thấy được, không phải điểm số mờ.

## Decision

1. `Game9K.stream.connectPair({ A, B })` là contract chính thức cho PK; mỗi room giữ `roomId` riêng và không nhận event chéo.
2. Normalized event (`roomId`, `seq`, `ts`, `user`, `type`) là System of Record; Canvas chỉ là projection.
3. Event đến sau khi heat đóng được queue cho heat kế tiếp; kết quả heat đã finish là bất biến.
4. Seed của heat được hiển thị để replay/giải thích công bằng.
5. Gift tạo team boost + opponent obstacle, hiển thị toast; **không** tạo cam kết tài chính/investment.
6. FDE summary tách khỏi technical release gates: `GO_FOR_LAUNCH` không đồng nghĩa `OPERATING` khi UAT/Day-2 chưa xong.

## Alternatives considered

| Alternative | Vì sao không chọn |
| --- | --- |
| Một room chung, suy ra team từ payload client | Cross-talk và giả mạo attribution; không đáp ứng PK |
| Đổi tên single-player racer cho nhiều viewer | Không tạo cảm giác crowd, không quan sát được join rate |
| Gift = điểm số ẩn | Viewer không hiểu tác động, không đo được engagement |
| Sửa heat đang chạy khi event đến muộn | Phá tính công bằng và replayability |
| Coi technical gate là bằng chứng product success | Che giấu thiếu UAT và rủi ro Day 2 |

## Consequences

**Positive**
- PK có thể kiểm chứng bằng regression test, replay bằng seed, và audit theo `seq`.
- Studio có capability tái dùng (hub + SDK + normalizer) thay vì overlay một-lần.
- Trạng thái dự án trung thực: `PILOT_READY`/`ACTION_REQUIRED` thay vì overclaim.

**Negative / trade-offs**
- Phải giữ thêm queue + replay logic và chịu trần 120 marble.
- Late event không được phản hồi ngay, cần UI giải thích "heat kế tiếp".
- Thêm chi phí vận hành: runbook, UAT, telemetry.

## Rollback

Revert bundle về manifest hash trước đó, chạy `npm run verify` để xác nhận, replay heat từ seed để kiểm tra. Contract `connectPair` giữ nguyên để không phá client đã phát hành.

## Follow-ups

- `fde-001`: UAT hai creator với evidence anonymized.
- `fde-002`: instrumentation latency/join rate.
- `fde-003`: runbook Day-2.
- `fde-004`: xác nhận slug game dinosaur thứ hai trước khi mở rộng.
