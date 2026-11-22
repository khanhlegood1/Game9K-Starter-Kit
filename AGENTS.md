# AGENTS.md — Game9K Starter Kit Engineering Conventions

## Overview

Game9K Starter Kit is an instant-play HTML5 game SDK, deterministic R2 build verifier, and multi-tenant KOL livestream gateway supporting **TikTok Live** and **YouTube Live**.

## Tech Stack & Runtime Rules

- **Runtime**: Node.js >= 20 (`"type": "module"`, native `fetch`, `node:test`, `node:crypto`)
- **Gateway**: Express 4 + Socket.io 4 + Server-Sent Events (`/api/sse/:roomId`), bound to `0.0.0.0`
- **Live Connectors**:
  - `src/services/TikTokConnectorService.js` (`tiktok-live-connector` v2 `TikTokLiveConnection`)
  - `src/services/YouTubeLiveService.js` (Data API v3 `liveChatMessages` + zero-key InnerTube `get_live_chat` fallback)
- **Games**: Pure HTML5 `<canvas>` + Web Audio API (`public/games/dino-race`, `public/games/starter-template`)

## Hard Architectural Invariants

1. **Sandboxed Iframe Isolation**: Every Game9K game MUST run without errors inside `<iframe sandbox="allow-scripts">` (opaque `"null"` origin, NO `allow-same-origin`). Never call `window.localStorage` directly without `Game9K.storage` or `try/catch`, and always verify `event.source === iframe.contentWindow` (host) / `event.source === window.parent` (client).
2. **TikTok WebView Media Rule**: Never place `<video>` elements inside game packages (`playsinline` fails in TikTok In-App Browser). Render attract screens on `<canvas>` and unlock `AudioContext` on first user gesture.
3. **Supabase Realtime Rate Limit**: Telemetry ticks emitted via `Game9K.broadcastTick()` MUST stay `<= 20 Hz` (default `15 Hz`) and never invoke Supabase `Presence.track()` for position updates (`5 calls / 30s` hard ceiling).
4. **Google H5 Ad Placement API**: Always enforce a `2,000ms` timeout on `preroll` `adBreak()` calls so slow networks or unapproved domains never block game startup. Never trigger interstitials during active racing.
5. **No Hardcoded Localhost in Browser Code**: Always use relative paths (`/api/...`, `/sdk/...`) or `window.location.origin` so cloud previews and reverse proxies work seamlessly.

## Verification Commands

Always run all three checks after modifying game code, SDK, or gateway logic:

```bash
npm test
npm run build
npm run verify
```
