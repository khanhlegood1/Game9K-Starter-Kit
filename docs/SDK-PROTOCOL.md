# Đặc Tả Giao Thức SDK Hợp Nhất (`@game9k/sdk` v5.0 — Poki Portal × Xsolla × Splice × POS/KDS × E2B × OpenRouter AI)

Mọi trò chơi HTML5 phát triển trên bộ **Game9K Starter Kit** chỉ cần nhúng duy nhất `/sdk/game9k-sdk.js` (hoặc các shim `/sdk/poki-sdk.js`, `/sdk/xsolla-sdk.js`, `/sdk/splice-sdk.js`, `/sdk/e2b-sdk.js`, `/sdk/openrouter-sdk.js`, `/sdk/tiktok-bridge.js`) để sử dụng đồng thời **10 mô-đun công nghiệp** theo đúng kiến trúc **Poki Portal SDK** (`PORTAL_RPC_REQUEST` qua `<iframe sandbox="allow-scripts">`):

1. **`window.PokiSDK`** (`window.Game9K.poki`) — Tương thích thả-chạy 100% với chuẩn **Poki Portal SDK** (`init`, `gameLoadingFinished`, `gameplayStart/Stop`, `commercialBreak`, `rewardedBreak`, `happyTime`, `movePill`, `shareableURL`, `getURLParam`, `login/getUser/getToken`).
2. **`window.XsollaSDK`** (`window.Game9K.xsolla`) — Chu trình **Xsolla SDK 3** chỉ **4 lệnh API** (`01 Authenticate → 02 Load Catalog → 03 Purchase Product → 04 Finalize Purchase`), tích hợp trực tiếp **Mã Giảm Giá POS (`GAMER9K`, `KOL20`)**, **Happy Hour** và **Khóa Hết Hàng Auto-86'd**.
3. **`window.SpliceSDK`** (`window.Game9K.splice` / `PokiSDK.splice`) — Áp dụng kiến trúc **`Darhlilove/splice`**: Trình phân tích đặc tả OpenAPI 3.1 (`/api/openapi.json`), `MockServerManager` tự sinh khóa studio, HTTP Interceptor tự chèn khóa + Retry Backoff, và trình sinh mã **TypeScript Studio SDK** (`npm run codegen`).
4. **`window.Game9KPOS`** (`window.Game9K.pos` / `PokiSDK.economy`) — Áp dụng kiến trúc **`Restaurant-POS-Kitchen`**: Quản lý tồn kho giới hạn & tự động khóa **86'd**, Khuyến mãi **Happy Hour** theo khung giờ & **Coupon**, Hàng đợi thực thi vật phẩm/quà tặng trực tiếp **KDS (`on_time`/`watch`/`late` + Bump/Recall 30 phút + All-Day Counts)**, Quản lý Ca Livestream (**Shift**) và Đối soát **Z-Report + Xuất CSV**.
5. **`window.E2BRuntimeSDK`** (`PokiSDK.runtime`) — Áp dụng kiến trúc **`e2b-dev/runtime/docs/ARCHITECTURE.md`**: Tách biệt Control Plane & Data Plane, Snapshot COW (`pauseSandbox` với GCRA `429 Retry-After` + `envd` cgroup freeze, `checkpointSandbox`, `forkSandbox`, `resumeSandbox` & Client-Proxy Auto-Resume), cùng Volume Content JWT ràng buộc `aud: https://api.<domain>`.
6. **`window.CodeInterpreterSDK`** (`PokiSDK.interpreter`) — Áp dụng **`e2b-dev/code-interpreter`**: Kernel thực thi nhiều ô giữ nguyên trạng thái biến (`runCode`), thu luồng `logs.stdout` / `logs.stderr` và bộ trích xuất biểu đồ SVG + dữ liệu có cấu trúc (`emitChart`).
7. **`window.FragmentsSDK`** (`PokiSDK.fragments`) — Áp dụng **`lexuankhanh1612/fragments`**: Kiểm định `FragmentSchema`, triển khai trực tiếp mini-game Poki HTML5 lên URL `/api/e2b/preview/:sandboxId` và vá mã tức thời **Morph Lazy Edit** (`// ... existing code ...`).
8. **`window.ComputerUseSDK`** (`PokiSDK.computerUse`) — Áp dụng **`e2b-dev/open-computer-use`**: Gia hạn `setSandboxTimeout(60_000)` mỗi bước, chụp ảnh màn hình Canvas + Grounding tọa độ nút bấm, vẽ dấu chấm đỏ-vàng `drawBigDot(x, y)` và điều khiển tự động `click` / `doubleClick` / `typeText` / `sendKey`.
9. **`window.OpenRouterSDK`** (`PokiSDK.ai`) — Áp dụng **`openrouter.ai` + E2B State of AI Agents**: Định tuyến đa mô hình (`openrouter/auto`, `models: [...]` failover, `sort: "latency"|"throughput"|"price"`, `zdr: true`), đăng nhập **OAuth PKCE S256 BYOK** kèm trần chi tiêu, **Prompt-to-Poki-Fragment** + **Morph v3 Fast-Apply**, **AI Shoutcaster + Lọc NĐ 147/2024**, đối soát chi phí AI vào **POS Z-Report** và giao thức chuẩn **Agent Protocol v1**.
10. **`window.Game9K.storage` & `window.TikTokBridge`** — `SafeStorage` chống lỗi `QuotaExceededError` trong Opaque Origin và luồng sự kiện **TikTok Live + YouTube Live**.

---

## 1. Chuẩn Vòng Đời Cổng Poki (`window.PokiSDK`)

```javascript
await PokiSDK.init({ gameId: "dino-race", version: "3.0.0" });
PokiSDK.gameLoadingFinished();
PokiSDK.movePill(0, 54);

PokiSDK.gameplayStart();
// Khi mở cửa hàng hoặc chuyển màn:
PokiSDK.gameplayStop();
await PokiSDK.commercialBreak(() => AudioEngine.mute(true));
AudioEngine.mute(false);
PokiSDK.gameplayStart();
```

---

## 2. Splice Spec-to-SDK & Mock Gateway (`window.SpliceSDK` / `PokiSDK.splice`)

```javascript
// 1. Khởi tạo Mock Server độc lập & nhận khóa sk_live_<32_chars> tự động chèn vào Interceptor:
const { mock } = await PokiSDK.splice.startMockServer("game9k-portal");
console.log("Masked Key:", mock.maskedApiKey); // sk_live_a1B2...x9Z0

// 2. Thử nghiệm Endpoint với xác thực tự động qua x-g9k-api-key:
const testRes = await PokiSDK.splice.executeMockRequest("game9k-portal", {
  method: "GET",
  path: "/api/xsolla/catalog"
});

// 3. Sinh trọn bộ gói TypeScript Poki Portal SDK từ OpenAPI 3.1 + game9k.manifest.json:
const sdkPkg = await PokiSDK.splice.generateTypedSDK({
  packageName: "@game9k/dino-race-portal-sdk",
  packageVersion: "3.0.0",
  gameId: "dino-race"
});
// Hoặc chạy trực tiếp từ CLI: `npm run codegen` -> xuất ra `dist/generated-sdk/dino-race/`
```

---

## 3. Counter POS, Tồn Kho 86'd, Happy Hour, KDS & Z-Report (`Game9K.pos` / `PokiSDK.economy`)

```javascript
// 1. Báo giá trước đơn hàng Xsolla với Happy Hour (-15%) + Coupon GAMER9K (-15%) + Kiểm tra tồn kho:
const quote = await PokiSDK.economy.quoteOrder({
  sku: "kol_meteor_pack_5",
  couponCode: "GAMER9K"
});

// 2. Thanh toán 1 chạm qua Xsolla Pay Station 4 & tự động đẩy phiếu lên hàng đợi KDS:
const paid = await XsollaSDK.buyAndFinalize("kol_meteor_pack_5", {
  couponCode: "GAMER9K"
});

// 3. Xử lý hàng đợi thực thi KDS cho KOL Streamer (Active Tickets, Bump & Recall 30 phút):
const kds = await PokiSDK.economy.getKdsQueue();
for (const ticket of kds.activeTickets) {
  await PokiSDK.economy.bumpTicket(ticket.id);
}

// 4. Đối soát doanh thu cuối ca Livestream (Z-Report) & tải báo cáo CSV chuẩn RFC-4180:
const zReport = await PokiSDK.economy.getZReport();
PokiSDK.economy.downloadCSV("orders");   // game9k-orders.csv
PokiSDK.economy.downloadCSV("payments"); // game9k-payments.csv
PokiSDK.economy.downloadCSV("shifts");   // game9k-shifts.csv
```

---

## 4. Lưu Trữ An Toàn Chống Tràn Dung Lượng (`Game9K.storage`)

```javascript
// Tương thích Opaque Origin (<iframe sandbox="allow-scripts">) + bắt sự kiện đầy bộ nhớ:
Game9K.storage.onQuotaExceeded((key) => {
  console.warn("Bộ nhớ trình duyệt đã đầy khi ghi:", key);
});

Game9K.storage.migrateVersion("dino_profile", "v1", "v2");
Game9K.storage.setJson("dino_profile_v2", { bestMs: 28400 });
console.log("Bytes used:", Game9K.storage.getBytesUsed());
```

---

## 5. E2B Runtime, Code Interpreter, Fragments/Morph & Open Computer Use (`PokiSDK.*`)

```javascript
// 1. E2B Runtime Control Plane (Snapshot Boot, Pause GCRA + envd Freeze, Fork & Auto-Resume):
const { sandbox } = await PokiSDK.runtime.createSandbox({ templateId: "code-interpreter-v1" });
await PokiSDK.runtime.checkpointSandbox(sandbox.sandboxId);
const forked = await PokiSDK.runtime.forkSandbox(sandbox.sandboxId);

// 2. Stateful Code Interpreter + SVG Chart Extractor (@e2b/code-interpreter):
await PokiSDK.interpreter.runCode("x = 41;", { sandboxId: sandbox.sandboxId });
const exec = await PokiSDK.interpreter.runCode(
  "x += 1; emitChart({ type: 'bar', title: 'Wave XP', points: [{ label: 'W1', value: x }] }); x;",
  { sandboxId: sandbox.sandboxId }
);
console.log(exec.text, exec.results[0].svg); // "42", "<svg ...>"

// 3. Fragments Deployer & Morph Lazy Patch (`// ... existing code ...`):
const frag = await PokiSDK.fragments.deployFragment({
  template: "poki-canvas-mini",
  title: "Dino Mini Fragment",
  file_path: "index.html",
  code: "<!DOCTYPE html><html><body><h1>Emerald Mode</h1></body></html>",
});
await PokiSDK.fragments.applyMorphEdit(frag.sbxId, {
  file_path: "index.html",
  instruction: "Switch heading to Turbo Mode",
  edit: "// ... existing code ...\n<body><h1>Turbo Mode</h1></body>\n// ... existing code ...",
});

// 4. Open Computer Use Vision + Grounding + Action Agent (`drawBigDot` + Click/Key):
const step = await PokiSDK.computerUse.click("Boost button", {
  sandboxId: frag.sbxId,
  uiElements: [{ label: "Boost button", x: 180, y: 92, width: 110, height: 34 }],
});
console.log(step.step.grounding, step.step.toolCall);
```

---

## 6. OpenRouter Multi-Model Gateway, OAuth PKCE & Agent Protocol v1 (`PokiSDK.ai`)

```javascript
// 1. Sinh trực tiếp mini-game Poki 60 FPS từ câu lệnh tự nhiên + vá nóng qua Morph v3:
const game = await PokiSDK.ai.generateFragment("Tạo mini-game khủng long neon né thiên thạch 60fps", {
  sort: "throughput",
  zdr: true,
});
await PokiSDK.ai.smartMorphEdit(game.sbxId, "Nâng cấp nhân vật sang màu vàng gold");

// 2. AI Shoutcaster cho KOL Livestream + Lọc nội dung NĐ 147/2024 (Zero Data Retention):
const cast = await PokiSDK.ai.shoutcast({
  nickname: "VIP_KhanhLe",
  giftTier: "meteor",
  comment: "Thiên thạch lật kèo phút chót!",
});

// 3. Chạy kiểm định tiến trình 4 bậc (Simple -> Hard) & xem chi phí AI trong POS Z-Report:
const evalReport = await PokiSDK.ai.runBenchmark();
const zReport = await PokiSDK.economy.getZReport();
console.log(evalReport.passedTiers, zReport.aiUsage);
```

---

## 7. Awesome AI SDKs Suite v6.0 (`PokiSDK.ai.streamChat` + `PokiSDK.agentOps`)

Hợp nhất 11 chuẩn **Awesome AI SDKs** (`Vercel AI SDK`, `AgentOps`, `Langfuse`, `LangSmith`, `Helicone`, `Chidori`, `SID`, `Steamship`, `Fixie`, `LangChain`, `E2B`) an toàn xuyên qua `<iframe sandbox="allow-scripts">`:

```javascript
// 1. Streaming token-by-token không khóa vòng lặp 60 FPS + Helicone SHA-256 Prompt Cache ($0.00 hit):
const streamOut = await PokiSDK.ai.streamChat("Bình luận: Thiên thạch 5x lật kèo!", {
  onDelta(chunk) {
    hudSubtitleEl.textContent += chunk;
  },
});
console.log(streamOut.cached, streamOut.traceId);

// 2. AgentOps × Langfuse × LangSmith Trace -> Span Execution Graph & Session Replay:
const replay = await PokiSDK.agentOps.getTraceReplay(streamOut.traceId);
await PokiSDK.agentOps.scoreTrace(streamOut.traceId, {
  name: "nd147_safety_and_fps",
  value: 0.99,
});

// 3. Chidori Reactive Event Bus + SID 1-Click Context Capsule + Steamship Signed Webhooks:
await PokiSDK.agentOps.emitReactiveEvent("kol.high_tier_gift", {
  nickname: "VIP_KhanhLe9K",
  giftTier: "meteor",
});
const capsule = await PokiSDK.agentOps.getContextCapsule("dino-race");
await PokiSDK.agentOps.registerWebhook({ url: "https://hooks.game9k.vn/ops", events: ["*"] });
await PokiSDK.agentOps.dispatchWebhook("agentops.eval_passed", { sdkVersion: "7.0.0" });
```

---

## 8. OpenRouter Multimodal & KOL Fleet Suite v7.0 (`PokiSDK.ai`)

Mở khóa 4 năng lực đa phương thức & quản trị đội ngũ KOL từ hệ sinh thái 600+ mô hình `openrouter.ai`:

```javascript
// 1. MC Giọng Nói Thật qua Web Audio API (`/api/v1/audio/speech` — tuyệt đối không dùng <video>):
const tts = await PokiSDK.ai.speakShoutcast({
  nickname: "VIP_KhanhLe9K",
  giftTier: "meteor",
  comment: "Mưa thiên thạch 5x lật kèo!",
});
console.log(tts.generationId, tts.byteSize);

// 2. Sinh Sprite nền trong suốt 1:1, ảnh động GIF/SVG nhiều frame & Poster dọc 9:16 (`/api/v1/images`):
const sprite = await PokiSDK.ai.generateSprite("Golden Cyber T-Rex VIP Racer", {
  aspect_ratio: "1:1",
  background: "transparent",
  frame_count: 4,
});
console.log(sprite.kbSize, sprite.r2BudgetSafe); // <= 125 KB Cloudflare R2 / Poki

// 3. Cấp khóa con giới hạn ngày tự reset cho từng kênh KOL (`/api/v1/keys` Management API):
const kolKey = await PokiSDK.ai.createKolKey({
  name: "KOL Room #2 — @MinhAnhLive",
  kolHandle: "@MinhAnhLive",
  limit: 2.0,
  limit_reset: "daily",
  include_byok_in_limit: true,
});

// 4. Upstream Sticky Prompt Caching (`x-session-id` + `cache_control: { type: "ephemeral" }`):
const turn2 = await PokiSDK.ai.stickyChat("kol_room_vn01", [
  { role: "system", content: "Luật đua Game9K NĐ 147/2024..." },
  { role: "user", content: "Khán giả bình chọn làn 3!" },
]);
console.log(turn2.upstreamCacheHit, turn2.usage.cachedReadTokens);
```

---

## 9. Cloud & Edge Production Launchpad v8.0 (`PokiSDK.cloud` + `npm run deploy`)

Khép kín vòng đời xuất bản sản phẩm thật lên **Cloudflare R2 (`AWS4-HMAC-SHA256`)**, **Supabase PostgREST**, **Kho bạc Token Solana (`Ed25519`)**, và **Bộ đếm giờ chơi U18 Nghị định 147/2024/NĐ-CP**:

```javascript
// 1. Kiểm định <= 125 KB gzip & xuất bản gói đơn tệp lên Cloudflare R2 CDN (immutable 1 năm):
const r2 = await PokiSDK.cloud.publishToR2("dino-race");
console.log(r2.deployment.cdnUrl, r2.deployment.sigV4Signature);

// 2. Đồng bộ Cloud Save & Bảng xếp hạng toàn cầu qua Supabase Dual-Write:
await PokiSDK.cloud.syncSupabaseSave("dino-race", { bestLapSec: 37.9 });
await PokiSDK.cloud.submitSupabaseScore("dino-race", { nickname: "VIP_KhanhLe", score: 5200 });

// 3. Ký & xác thực mật mã Ed25519 mở khóa các chặng Token $G9K trên Solana:
const milestones = await PokiSDK.cloud.evaluateSolanaMilestones({ gameSlug: "dino-race" });
const sigCheck = await PokiSDK.cloud.verifySolanaSignature(
  milestones.tranches[0].attestation.message,
  milestones.tranches[0].attestation.signatureHex
);

// 4. Bộ đếm giờ chơi U18 theo NĐ 147/2024/NĐ-CP (60 phút/game & 180 phút/ngày -> tự khóa vòng lặp):
const guard = await PokiSDK.cloud.heartbeatPlaytime({ ageGroup: "under18", elapsedSec: 3600 });
console.log(guard.shouldLockUnder18, guard.portalPostMessageCmd); // true, "UNDER18_LIMIT_LOCK"
```





