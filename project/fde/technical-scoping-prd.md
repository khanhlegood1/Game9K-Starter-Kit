# Technical Scoping & PRD — Game9K Live Interaction (MVA: Marble Race Live PK)

| Field | Value |
| --- | --- |
| Project | `game9k-live-interaction` |
| Mission | Biến live interaction của creator thành trải nghiệm tham gia đo được, có thể vận hành |
| MVA | Marble Race Live PK (2 room cô lập) |
| Owner | Studio Engineering (delivery), Creator Success (validation), Live Ops (Day 2) |
| Status | MVA built & technically approved; creator UAT pending |

## 1. Problem statement

Creator chạy live trên TikTok/YouTube cần một lớp tương tác khiến khán giả **thấy mình có mặt và có tác động** trong room. Các giải pháp overlay hiện có thường: (a) phụ thuộc một upstream duy nhất, (b) không tách room nên PK bị lẫn sự kiện, (c) không có telemetry hay runbook để Live Ops xử lý khi lệch.

Game9K đã có gateway normalizer, SDK bridge và game engine, nhưng **Delta** nằm ở việc ghép chúng thành một phiên live thật: hai room cô lập, attribution authoritative, gift có tác động xã hội rõ ràng, và khả năng phục hồi không cần engineer.

## 2. Goals / Non-goals

### Goals
1. Creator mở room và thấy heat đầu tiên trong `<= 10` phút.
2. `>= 95%` viewer join-like nhận marble trước khi join window đóng.
3. Gift tạo phản hồi thấy được với `p95 <= 1500ms`.
4. Không cross-talk giữa hai room PK; kết quả heat deterministic và không bị sửa sau finish.
5. Live Ops phục hồi 5 failure mode chính bằng runbook.

### Non-goals
- Hệ identity/thanh toán chung; ví; payout.
- Bất kỳ cơ chế investment/ROI cho viewer.
- Tự động mở rộng sang game khác (đặc biệt game dinosaur thứ hai chưa xác nhận).
- SLA đa vùng hoặc autoscaling theo tải global.

## 3. Personas & user stories

| Persona | Story | Acceptance |
| --- | --- | --- |
| Creator | Là creator, tôi muốn dán Browser Source URL và thấy room của tôi chạy để lên sóng ngay. | URL trả overlay; heat bắt đầu; room ID hiển thị đúng |
| Creator (PK) | Là creator PK, tôi muốn gift của khán giả đánh vào đối thủ một cách công khai và công bằng. | Gift → boost team + obstacle đối thủ; seed hiển thị |
| Viewer | Là viewer, tôi muốn thấy avatar/tên mình tham gia để cảm thấy có mặt. | Avatar proxy hoặc fallback; tên sanitize; xuất hiện trong crowd |
| Live Ops | Là operator, tôi muốn biết room nào mất nguồn và phục hồi mà không gọi engineer. | Có trạng thái nguồn, queue, replay, runbook |
| Studio | Là owner, tôi muốn Delta được productize thành capability tái dùng. | SDK/hub contract tách khỏi game cụ thể |

## 4. Scope contract

### In scope (MVA)
- `Game9K.stream.connectPair({ A, B })` cho hai room cô lập.
- Normalized event: `join | like | chat | gift | system`, có `roomId`, `seq`, `ts`, `user`.
- Marble engine: crowd cap 120, join window, heat lifecycle, late-event queue cho heat kế tiếp.
- Gift: team boost + opponent obstacle, seed hiển thị, toast.
- Realtime: Socket.IO primary, SSE fallback, simulator fallback.
- Release: manifest G2, gzip `<= 125 KB`, telemetry `<= 20 Hz`, artifact SHA-256.
- Observability tối thiểu: room source status, queue depth, heat state, latency sample.

### Out of scope
Xem non-goals; mọi yêu cầu ngoài phạm vi phải thành ADR/decision mới trước khi code.

## 5. Functional requirements

| ID | Requirement | Priority | Verification |
| --- | --- | --- | --- |
| FR-1 | Overlay render trong `<iframe sandbox="allow-scripts">` không lỗi | P0 | `npm test` sandbox/poki suites |
| FR-2 | Pair connect bind đúng roomId, không nhận event chéo | P0 | `test/pk-contract.test.js` |
| FR-3 | Late event vào queue heat kế tiếp, không sửa heat đang finish | P0 | `test/marble-race.test.js` |
| FR-4 | Avatar lỗi rơi về fallback an toàn | P1 | UI + normalizer tests |
| FR-5 | Reconnect giữ attribution và replay queue | P1 | UAT reconnect case |
| FR-6 | Seed heat hiển thị cho viewer/operator | P1 | Fairness HUD |
| FR-7 | Telemetry không vượt trần Hz | P0 | manifest validator |

## 6. Non-functional requirements

- Bundle: mỗi game `< 125 KB` gzip; dưới budget hiện tại.
- Latency: `p95 <= 1500ms` event→visual (chưa có evidence).
- Availability: gateway bind `0.0.0.0`; fallback SSE nếu WebSocket bị chặn.
- Security: không `<video>`, không `eval`, avatar qua proxy, secret ngoài repo.
- Observability: log có `roomId` + `seq`; replayable simulator.
- Compliance: G2 / U18 controls; no-investment-to-play.

## 7. Definition of Done (delivery slice)

- [ ] Mission brief + Site Survey cập nhật theo slice.
- [ ] ADR khi thay đổi contract/architecture/compliance.
- [ ] Unit/regression tests pass (`npm test`).
- [ ] `npm run validate`, `npm run build`, `npm run verify`, `npm run decide` pass tuần tự.
- [ ] Không phá invariant: iframe sandbox, no `<video>`, telemetry cap, relative URL.
- [ ] UAT checklist có evidence anonymized.
- [ ] Runbook + Day-2 owner cập nhật.
- [ ] Weekly summary có metric và link evidence.

## 8. UAT plan

| # | Case | Bước | Expected |
| --- | --- | --- | --- |
| UAT-1 | TikTok room connect | Tạo room, dán URL, bắt đầu heat | Heat chạy, room đúng |
| UAT-2 | YouTube room connect | Như trên với YouTube | Heat chạy, không lẫn room A |
| UAT-3 | Gift PK | Gift vào room A nhắm room B | B nhận obstacle, toast hiển thị, seed có |
| UAT-4 | Late event | Gift sau khi heat đóng | Vào queue heat kế tiếp, không đổi kết quả cũ |
| UAT-5 | Reconnect | Ngắt mạng client/upstream | Tự phục hồi, attribution giữ nguyên |
| UAT-6 | Fallback | Chặn WebSocket | SSE vẫn chạy |
| UAT-7 | Avatar fallback | Avatar URL lỗi/không trong allowlist | Hiển thị fallback, không lỗi render |

Evidence phải redact viewer identifier; lưu link trong weekly summary.

## 9. Dependencies & risks

| Dependency | Ảnh hưởng | Mitigation |
| --- | --- | --- |
| TikTok credential/room | UAT-1/3/5 | Pilot với creator thật; simulator cho CI |
| YouTube Data API quota | UAT-2 | InnerTube fallback; giới hạn polling |
| Second dinosaur slug | Mở rộng scope | Giữ ngoài scope (`fde-004`) |
| Metric store | Không chứng minh được value | Instrumentation P1 (`fde-002`) |

## 10. Release & rollback

- Release chỉ khi `verify` không mismatch và `decide` 4/4 gate.
- Rollback: giữ artifact hash trước đó; redeploy bundle cũ; simulator replay để xác nhận.
- Không release nếu còn blocker P0 hoặc thiếu UAT cho slice đang mở rộng.
- Technical `GO_FOR_LAUNCH` không thay thế UAT; công bố trạng thái theo FDE summary.
