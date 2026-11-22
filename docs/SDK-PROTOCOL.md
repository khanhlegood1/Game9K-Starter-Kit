# Đặc Tả Giao Thức SDK (`@game9k/sdk`) & Manifest

Mọi trò chơi HTML5 phát triển trên bộ **Game9K Starter Kit** chỉ cần nhúng `/sdk/game9k-sdk.js` để sử dụng đồng thời cầu nối cổng **Game9K** và cầu nối livestream **TikTok / YouTube**.

---

## 1. Khởi Tạo & Giao Tiếp Cổng (`window.Game9K`)

```javascript
// 1. Khởi tạo SDK và đăng ký hàm tạm dừng khi hiển thị quảng cáo hoặc khóa giờ chơi U18
window.Game9K.init({
  gameId: "my-studio-game",
  version: "1.0.0",
  maxTelemetryHz: 15, // Tự động kẹp cứng <= 20 Hz bảo vệ Supabase Realtime Broadcast
  onPauseChange(isPaused, reason) {
    // Tạm dừng vòng lặp vật lý & tắt âm thanh khi isPaused === true
  }
});

// 2. Gửi gói đồng bộ trạng thái (tự động tiết lưu ở mức maxTelemetryHz)
window.Game9K.broadcastTick({ lap: 2, leader: "Crocodilia" });

// 3. Gửi điểm lên Bảng xếp hạng & Lưu tiến trình Đám mây (Tự động dự phòng sang SafeStorage ở chế độ G4)
await window.Game9K.submitScore({ nickname: "Player1", score: 2450, timeSec: 46.8 });
await window.Game9K.saveCloudState({ unlockedSkin: "golden-croc" });
const saved = await window.Game9K.loadCloudState();

// 4. Gọi Quảng cáo Google H5 (Tự động hủy chờ preroll sau 2.000ms nếu không có quảng cáo)
window.Game9K.ads.triggerAdBreak({
  type: "reward",
  name: "extra-boost",
  onReward() {
    // Chỉ cấp thưởng khi người chơi thực sự xem hết quảng cáo (adViewed)
  }
});
```

---

## 2. Nhận Sự Kiện TikTok Live & YouTube Live (`window.Game9K.stream` / `window.TikTokBridge`)

SDK xuất cả `window.LiveStreamBridge` lẫn bí danh `window.TikTokBridge` (tương thích ngược 100% với `vamnguyen/tiktok-live-games`):

```javascript
// Lắng nghe sự kiện chuẩn hóa từ CẢ TikTok Live VÀ YouTube Live
window.TikTokBridge.on("chat", (evt) => {
  // evt = { type: 'chat', platform: 'tiktok'|'youtube', user: { uniqueId, nickname, profilePictureUrl }, comment, lane, timestamp }
});

window.TikTokBridge.on("gift", (evt) => {
  // evt = { type: 'gift', platform: 'tiktok'|'youtube', user, giftId, giftName, giftValue, giftTier: 'rose'|'meat'|'banana'|'meteor'|'crown', lane, timestamp }
});

// Bơm sự kiện trực tiếp từ console / OBS script hoặc qua window.postMessage({ type: 'STREAM_EVENT', payload })
window.TikTokBridge.ingest({
  type: "gift",
  platform: "youtube",
  user: "MinhAnh_YT",
  lane: 0,
  giftTier: "meteor",
  coins: 20
});
```

---

## 3. Lược Đồ `game9k.manifest.json`

Mỗi thư mục game trong `public/games/<slug>/` bắt buộc có tệp `game9k.manifest.json`:

```json
{
  "schema_version": 1,
  "id": "dino-race",
  "title": "Jurassic Sanctuary Sprint",
  "version": "1.0.0",
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
    "max_telemetry_hz": 15
  }
}
```
