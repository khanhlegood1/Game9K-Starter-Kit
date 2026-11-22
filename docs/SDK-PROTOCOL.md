# Đặc Tả Giao Thức SDK Hợp Nhất (`@game9k/sdk` v2.0 — Poki Portal SDK × Xsolla SDK 3)

Mọi trò chơi HTML5 phát triển trên bộ **Game9K Starter Kit** chỉ cần nhúng duy nhất `/sdk/game9k-sdk.js` (hoặc các shim tương thích ngược `/sdk/poki-sdk.js`, `/sdk/xsolla-sdk.js`, `/sdk/tiktok-bridge.js`) để sử dụng đồng thời **3 chuẩn công nghiệp** trong một gói không phụ thuộc (~10 KB Gzip):

1. **`window.PokiSDK`** (`window.Game9K.poki`) — Tương thích thả-chạy 100% với chuẩn **Poki Portal SDK** (Lifecycle, Commercial/Rewarded Breaks, Shareable Deep-Links, Floating Pill).
2. **`window.XsollaSDK`** (`window.Game9K.xsolla`) — Tích hợp kiến trúc **Xsolla SDK 3** chỉ với **4 lệnh API** (`01 Authenticate → 02 Load Catalog → 03 Purchase Product → 04 Finalize Purchase`), hỗ trợ 200+ quốc gia, 130+ tiền tệ, tính thuế VAT tự động và ủy quyền Pay Station 4 ra ngoài `<iframe sandbox="allow-scripts">`.
3. **`window.Game9K` & `window.TikTokBridge`** — Cầu nối Sandbox an toàn (`SafeStorage` + `postMessage` RPC), tiết lưu Realtime Broadcast `<= 20 Hz`, khóa giờ chơi U18 (NĐ 147/2024) và luồng sự kiện **TikTok Live + YouTube Live**.

---

## 1. Chuẩn Vòng Đời Cổng Poki (`window.PokiSDK` / `window.Game9K.poki`)

Mọi game HTML5, Unity WebGL, Godot, GDevelop, Cocos hoặc Defold đã viết cho Poki đều chạy ngay trên cổng Game9K không cần sửa mã:

```javascript
// 1. Khởi tạo & báo cáo hoàn tất nạp tài nguyên (đo lường tỷ lệ chuyển đổi vào chơi)
await PokiSDK.init({ gameId: "dino-race", version: "2.0.0" });
PokiSDK.gameLoadingFinished();

// Dịch chuyển thanh nổi Game9K Pill để không che HUD của game trên di động
PokiSDK.movePill(0, 54);

// 2. Đánh dấu khi người chơi thực sự điều khiển & khi tạm ngưng
PokiSDK.gameplayStart();
// ... khi kết thúc màn / mở menu / mở cửa hàng:
PokiSDK.gameplayStop();

// 3. Quảng cáo chuyển màn tự nhiên (Tự động bỏ qua 0ms nếu người chơi sở hữu Vé VIP Xsolla!)
await PokiSDK.commercialBreak(() => AudioEngine.mute(true));
AudioEngine.mute(false);
PokiSDK.gameplayStart();

// 4. Quảng cáo nhận thưởng (Trả về boolean `shouldReward`)
const shouldReward = await PokiSDK.rewardedBreak({
  size: "medium",
  onStart: () => AudioEngine.mute(true)
});
AudioEngine.mute(false);
if (shouldReward) {
  player.refillNitro();
}

// 5. Hiệu ứng ăn mừng chiến thắng & tạo đường dẫn chia sẻ (`?gdroom=...&gdscore=...`)
PokiSDK.happyTime(0.95);
const url = await PokiSDK.shareableURL({ room: "kol-vn", score: 2950 });
const roomParam = PokiSDK.getURLParam("room");
```

---

## 2. Thương Mại Hóa 4 Bước Xsolla SDK 3 (`window.XsollaSDK` / `window.Game9K.xsolla`)

Dựa trên kiến trúc **[Xsolla SDK 3](https://xsolla.com/sdk)** và **[SDK Explorer](https://developers.xsolla.com/sdk/demo/)**, toàn bộ luồng thanh toán đa quốc gia được rút gọn còn đúng **4 lệnh API**:

```javascript
// Tùy chọn cấu hình dự án Publisher Account
XsollaSDK.configure({
  projectId: 249001,
  loginId: "026201e3-7e40-4784-b61b-a75979884924",
  sandbox: true,
  country: "VN"
}).addProducts([
  "amber_gems_100",
  "golden_croc_skin",
  "sanctuary_vip_pass"
]);

// BƯỚC 01: Authenticate (Định danh ngầm bằng Device ID hoặc SSO cổng — không chặn màn hình!)
const auth = await XsollaSDK.authenticate({ method: "device_id", country: "VN" });

// BƯỚC 02: Load Catalog (Tải giá VND/USD/EUR/JPY, tự tính thuế VAT địa phương & phí 5%)
const { items } = await XsollaSDK.loadCatalog({ country: "VN" });

// BƯỚC 03: Purchase Product (Tự động gameplayStop + mở Xsolla Pay Station 4 ngoài Iframe Sandbox)
const { order } = await XsollaSDK.purchaseProduct("amber_gems_100");

// BƯỚC 04: Finalize Purchase (Xác thực chữ ký biên lai HMAC chống gian lận & cộng đồ Idempotent)
const finalized = await XsollaSDK.finalizePurchase(order.orderId);

// Hoặc mở ngay Cửa Hàng Trong Game dựng sẵn chỉ với 1 dòng lệnh:
await XsollaSDK.openStoreModal();
```

### Bảo mật Ủy Quyền Pay Station Qua `<iframe sandbox="allow-scripts">`
- Khi game chạy trong `<iframe sandbox="allow-scripts">` (Opaque Origin `"null"`), iframe game **không giữ khóa API, không đọc cookie cổng và không tự mở cửa sổ thanh toán**.
- Mọi lệnh `authenticate`, `loadCatalog`, `purchaseProduct`, `finalizePurchase` tự động đi qua giao thức RPC `PORTAL_RPC_REQUEST` tới lớp vỏ Cổng Cha (`/portal.html`), nơi xác thực chặt chẽ `event.source === iframe.contentWindow` trước khi hiển thị **Xsolla Pay Station 4**.
- Máy chủ hỗ trợ xác thực Webhook chính thức của Xsolla tại `POST /api/xsolla/webhook` với chữ ký `Authorization: Signature <sha1(rawBody + XSOLLA_WEBHOOK_SECRET)>`.

---

## 3. Nhận Sự Kiện TikTok Live & YouTube Live (`window.Game9K.stream` / `window.TikTokBridge`)

```javascript
window.TikTokBridge.on("chat", (evt) => {
  // evt = { type: 'chat', platform: 'tiktok'|'youtube', user, comment, lane, timestamp }
});

window.TikTokBridge.on("gift", (evt) => {
  // evt = { type: 'gift', platform: 'tiktok'|'youtube', user, giftTier, giftValue, lane, timestamp }
});
```

---

## 4. Lược Đồ `game9k.manifest.json` (Hỗ Trợ Poki Bridge + Xsolla SDK 3)

```json
{
  "schema_version": 1,
  "id": "dino-race",
  "title": "Jurassic Sanctuary Sprint",
  "version": "2.0.0",
  "entry": "index.html",
  "legal_classification": "G2",
  "supported_modes": ["G4", "G2", "G1"],
  "budgets": {
    "max_gzip_kb": 125,
    "target_fps": 60
  },
  "bridge": {
    "sandbox_compatible": true,
    "requires_same_origin": false,
    "poki_sdk_compatible": true,
    "max_telemetry_hz": 15
  },
  "monetization": {
    "provider": "xsolla-sdk-3",
    "project_id": 249001,
    "sandbox_supported": true,
    "products": ["amber_gems_100", "golden_croc_skin", "sanctuary_vip_pass"]
  }
}
```
