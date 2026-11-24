# Site Survey — Game9K Live Interaction (Marble Race Live PK)

| Field | Value |
| --- | --- |
| Survey date | 2026-11-23 |
| Project | `game9k-live-interaction` |
| Stage | `pilot` |
| Primary mission | Marble Race Live PK between two isolated live rooms |
| Surveyed by | Product + Creator Success + Live Ops |
| Evidence owner | Live Ops (telemetry), Creator Success (UAT log) |

> Đây là bản chụp **field reality**, không phải kế hoạch. Mục tiêu là nêu cái gì đang thật, cái gì còn là giả định, và Delta nào cản creator tạo ra live interaction đo được.

## 1. People

| Vai trò | Người/nhóm | Nhu cầu thực tế | Trạng thái |
| --- | --- | --- | --- |
| Champion | Creator TikTok / YouTube (pilot room) | Mở room, thấy heat chạy, thấy gift có tác động | **Chưa có UAT thật** — blocker `real-creator-uat` |
| Blocker | Upstream platform availability + approval nội dung | Cần credential và room hợp lệ, không lưu trong repo | Mở |
| Approver phát hành | Studio Engineering (release gates) | Artifact integrity, test, bundle budget | Đã có automation |
| Day-2 operator | Live Ops | Chẩn đoán upstream/queue/avatar, replay, rollback | `in_progress` |
| Compliance | Compliance owner | G2/U18, avatar proxy, no-investment-to-play | Đã có control trong manifest |

## 2. Outcome và success metric

| Metric | Baseline | Target | Nguồn evidence | Hiện trạng |
| --- | --- | --- | --- | --- |
| Creator setup time | Chưa đo | `<= 10` phút từ Browser Source URL tới heat đầu tiên | UAT session log | `pending` |
| Viewer join rate | Chưa đo | `>= 95%` viewer nhận marble trước khi join window đóng | `marble_joined` / normalized join-like events | `in_progress` |
| Event-to-visual latency | Chưa đo | `p95 <= 1500ms` | Room event timestamp + client telemetry | `pending` |
| Heat replayability | Có seed hiển thị + test | Không mutation sau finish | `test/marble-race.test.js`, seed HUD | `complete` |
| Day-2 recovery | Runbook đang được viết | 5 failure mode có detect + recovery | `docs/KOL-STREAMING-GUIDE.md` | `in_progress` |

Baseline chưa tồn tại ở 3 metric đầu. Đây là lý do `fde-002` (instrumentation) là P1 và phải xong trước khi tuyên bố product value.

## 3. Data — System of Record

| Hạng mục | System of Record | Projection | Ghi chú |
| --- | --- | --- | --- |
| Live event | `src/lib/streamEventNormalizer.js` output | Canvas heat state | Chuẩn hóa join/like/chat/gift, giữ `roomId`, `seq` |
| Team attribution | `src/services/LiveRoomHub.js` room binding | Team A/B trong game | Không suy ra team từ payload client |
| Heat result | `seed` + event receipt trong heat record | Winner banner, heat history | Không sửa kết quả đã finish |
| Avatar | Allowlist/proxy status | Crowd render | URL viewer là dữ liệu người dùng thật |

**Retention:** giữ telemetry đã redact theo cửa sổ vận hành; không lưu raw viewer identifier trong artifact release.
**Known gap:** chưa có metric store tập trung; evidence hiện là telemetry sample + UAT log.

## 4. Ingestion và connectivity

| Đường vào | Trạng thái | Fallback |
| --- | --- | --- |
| TikTok Live (connector v2) | Có service, cần credential thật | Simulator/demo input |
| YouTube Live (Data API v3) | Có service, có InnerTube zero-key fallback | Simulator/demo input |
| Socket.IO `/` | Primary realtime | — |
| SSE `/api/sse/:roomId` | Fallback | — |
| Simulator (`/api/simulator/*`) | Demo + regression | — |

Đã xác nhận: gateway bind `0.0.0.0`; browser code dùng relative path, không hardcode localhost; late event được queue cho heat kế tiếp thay vì mutate heat đang chạy.

## 5. Compliance, security, quota

- Manifest `legal_classification: G2`; portal U18 control hiện hữu.
- Avatar chỉ render qua allowlist/proxy; hiển thị tên đã sanitize.
- Không có `<video>` trong game package (TikTok WebView rule); audio unlock bằng user gesture.
- Telemetry Marble Race `<= 10 Hz`, dưới trần 20 Hz; gzip `<= 125 KB` mỗi package.
- Gift là cơ chế tham gia, **không** phải investment/financial promise.
- Credential upstream không nằm trong repo; runtime dùng env/secret store.

## 6. Scope boundary của pilot

**In scope**
- Hai room cô lập, team attribution authoritative, không cross-talk.
- Marble crowd có avatar fallback, gift boost + opponent obstacle có seed hiển thị.
- Late event queue, reconnect, SSE/Socket.IO fallback, simulator replay.
- Release evidence: manifest, build, verify, decide.

**Out of scope**
- Identity/account system chung cho mọi game.
- Mở rộng sang game dinosaur thứ hai khi chưa xác nhận slug (`fde-004` blocker).
- Cam kết doanh thu, payout, hoặc bất kỳ cơ chế đầu tư nào.
- Multi-region autoscaling và SLA trả phí.

## 7. Assumptions cần kiểm chứng

1. Creator chấp nhận thêm Browser Source và không cần cài app.
2. Khán giả hiểu team A/B trong 1 heat đầu mà không cần hướng dẫn.
3. Upstream gift/chat rate của một room pilot không vượt back-pressure hiện tại.
4. Live Ops có thể phản ứng sự cố trong giờ vận hành mà không cần engineer.

Mỗi assumption phải được đóng hoặc chuyển thành risk có owner trước khi mở rộng pilot.

## 8. Evidence register

| Evidence | Vị trí | Trạng thái |
| --- | --- | --- |
| Release artifact integrity | `dist/release-manifest.json`, `npm run verify` | Có |
| Game contract & legal class | `public/games/marble-race-live/game9k.manifest.json` | Có |
| PK room/team contract | `test/pk-contract.test.js` | Có |
| Heat determinism | `test/marble-race.test.js` | Có |
| Creator UAT log | chưa có | **Thiếu — P0** |
| Latency/join sample | chưa có | **Thiếu — P1** |

## 9. Kết luận survey

Sản phẩm đã đủ trưởng thành để chạy pilot có kiểm soát, nhưng **chưa có bằng chứng field**: thiếu creator UAT và thiếu metric latency/join thật. Kết luận này là cơ sở để FDE status là `PILOT_READY`/`ACTION_REQUIRED` trong khi technical gates vẫn `GO_FOR_LAUNCH`.
