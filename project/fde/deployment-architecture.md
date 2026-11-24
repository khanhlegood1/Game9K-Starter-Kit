# Deployment Architecture — Game9K Live Interaction

| Field | Value |
| --- | --- |
| Scope | Gateway + normalizer + SDK + Marble Race Live PK |
| Runtime | Node.js >= 20, Express 4, Socket.IO 4, SSE |
| Bind | `0.0.0.0` (preview/reverse proxy safe) |
| Trust boundary | Upstream live platform → gateway → room hub → game iframe |

## 1. Topology

```
 TikTok Live  ─┐
               ├─► Connector services ─► streamEventNormalizer ─┐
 YouTube Live ─┘                                                │
                                                                ▼
   Simulator (demo/regression) ───────────────────────► LiveRoomHub (room isolation,
                                                        team attribution, client registry)
                                                                │
                          ┌─────────────────────────────────────┼───────────────────────┐
                          ▼                                     ▼                       ▼
                 Socket.IO namespace                   SSE /api/sse/:roomId      REST /api/rooms/*
                          │                                     │                       │
                          └──────────────► Browser overlay (iframe, sandbox="allow-scripts")
                                                    │
                                                    ▼
                                     Game9K SDK bridge (postMessage)
                                                    │
                                                    ▼
                                   Marble Race engine (Canvas + Web Audio)
```

## 2. Data flow and trust rules

1. **Ingress:** connector hoặc simulator phát raw event; không client nào được tự khai báo team.
2. **Normalize:** `streamEventNormalizer` gán `roomId`, `seq`, `ts`, `user` đã sanitize, loại event không hợp lệ.
3. **Room binding:** `LiveRoomHub` giữ mapping room → connector/source. Event từ room A không bao giờ dispatch room B.
4. **Delivery:** Socket.IO primary; SSE fallback cho môi trường chặn WebSocket. Cả hai đi qua cùng một payload contract.
5. **Projection:** game engine chỉ project state. Canvas không phải SoR; reload có thể replay từ queue/state.
6. **Bridge:** `window.parent` ↔ `iframe.contentWindow` với kiểm tra `event.source`; SDK dùng relative URL, không hardcode host.

## 3. Isolation & sandbox

- Overlay chạy trong `<iframe sandbox="allow-scripts">` (opaque `null` origin). Không `allow-same-origin`.
- Không `<video>` trong game package (TikTok WebView).
- Storage truy cập qua `Game9K.storage` hoặc try/catch.
- Audio unlock ở user gesture đầu tiên.
- Không có biến global chia sẻ giữa hai iframe PK.

## 4. Rate limits & quotas

| Thành phần | Giới hạn | Lý do |
| --- | --- | --- |
| Telemetry tick | `<= 20 Hz` (Marble dùng 10 Hz) | Supabase Realtime |
| Presence.track | Không dùng cho position | `5 calls / 30s` ceiling |
| YouTube liveChatMessages | Theo quota API | Tránh 403 |
| TikTok connector | Back-pressure theo poll interval | Tránh drop/duplicate |
| Avatar fetch | Allowlist/proxy + cache | Bảo vệ người dùng & upstream |

## 5. Configuration & secrets

- Gateway/connector bind `0.0.0.0`; port qua env.
- `GEMINI_API_KEY` chỉ dùng server-side cho Decisions; không gửi xuống browser.
- Credential TikTok/YouTube cấp theo room qua env/secret store, không commit.
- Browser-facing code dùng `/api/...` hoặc `window.location.origin`.

## 6. Observability

| Tín hiệu | Nguồn | Dùng cho |
| --- | --- | --- |
| Source status | room hub | Phát hiện upstream mất kết nối |
| Queue depth / late events | normalizer + hub | Phát hiện back-pressure |
| Heat state + seed | engine | Replay, fairness tranh chấp |
| Latency sample | client telemetry (redacted) | SLO `p95` |
| Release manifest + verify | build/verify | Artifact integrity |

## 7. Failure modes & recovery

| Failure | Phát hiện | Recovery |
| --- | --- | --- |
| Upstream ngắt | source status = disconnected | Dùng simulator tạm, thông báo creator, reconnect |
| WebSocket bị chặn | client connect fail | Tự chuyển SSE |
| Mất event do burst | queue depth tăng | Back-pressure, queue heat kế tiếp |
| Avatar lỗi | proxy/allowlist reject | Fallback avatar, không chặn render |
| Artifact mismatch | `npm run verify` | Không deploy; rebuild tuần tự |
| Sai attribution | log `roomId`/`seq` bất thường | Rollback bundle, replay heat từ seed |

## 8. Deployment

- Build artifact: `npm run build` → `dist/` (bundle + standalone + manifest hash).
- Verify: `npm run verify` phải `mismatches: []`.
- Deploy target: static host cho bundle/overlay; Node service cho gateway.
- Rollback: giữ manifest/hash của bản trước; deploy lại; xác nhận bằng verify + heat replay.
- Preview: gateway bind `0.0.0.0`, chấp nhận Host của preview proxy, không chặn iframe embed.

## 9. Day-2 ownership

| Vùng | Owner | Escalation |
| --- | --- | --- |
| Upstream connector | Live Ops | Studio Engineering |
| Gateway/realtime | Studio Engineering | On-call lead |
| Game engine/SDK | Canvas Squad | Studio Engineering |
| Compliance/avatar | Compliance | Product |

Runbook: `docs/KOL-STREAMING-GUIDE.md`. Weekly value review: `project/fde/weekly-executive-summary.md`.
