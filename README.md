# 🦖 Game9K Starter Kit — Flagship Dinosaur Racing (TikTok Live + YouTube Live)

Bộ công cụ phát triển (**Starter Kit**) chuẩn hóa cho cổng trò chơi **Game9K (`game9k.com`)** kèm tựa game mẫu đầu tiên: **Jurassic Sanctuary Sprint — Đua Khủng Long Khu Bảo Tồn** dành cho cả **người chơi trình duyệt tức thì (Instant-Play G4/G2)** và **KOL phát trực tiếp 24/7 trên TikTok Live & YouTube Live**.

---

## ✨ Điểm Nổi Bật Kiến Trúc

1. **Tựa Game Mẫu Số 1 — `Jurassic Sanctuary Sprint` (`public/games/dino-race/`)**:
   - **3 Chế Độ Chơi Linh Hoạt**:
     - 🎮 **Tự Lái Solo (`SOLO`)**: Điều khiển khủng long qua 3 vòng đầm lầy bằng phím `WASD` / Mũi tên / Cảm ứng di động, đớp dê mồi (`🐐`) tích Nộ Khí Gầm Bứt Tốc (`SPACE`).
     - 🔴 **Đấu Trường 4 Đội KOL Live (`KOL_DERBY`)**: Tự động xoay vòng 24/7 trên OBS / TikTok LIVE Studio. Khán giả trên **TikTok Live** và **YouTube Live** bình luận `1, 2, 3, 4` hoặc tặng quà / SuperChat để tiếp sức cho 4 chiến binh (`#1 Crocodilia 🐊`, `#2 Carnotaurus 🦖`, `#3 Triceratops 🦕`, `#4 Baryonyx 🦎`).
     - 👥 **Đại Chiến Avatar Khán Giả (`VIEWER_STAMPEDE`)**: Lấy cảm hứng từ *Livecade Marble Race* — mỗi khán giả bình luận/thả tim sẽ thả khủng long mang **tên + ảnh đại diện TikTok/YouTube** của chính họ xuống đường đua (lên tới **24 tay đua** cùng lúc, hỗ trợ **Đấu Loại Trực Tiếp / Elimination**!).
   - **5 Tầng Vật Phẩm Quà Tặng & Phá Đám Kịch Tính**:
     - `🌹 Hoa Hồng / $0.50` (`1 xu`): `+45 Nộ Khí` & bứt tốc 2s.
     - `🥩 Đùi Thịt / $1` (`5 xu`): Đầy bình Nộ Khí + Gầm Nitro 3s + kháng chậm đầm lầy.
     - `🍌 Bẫy Bùn Chuối / $2` (`10 xu`): Rải bẫy trượt ngay trước mặt tay đua Top 1 (nếu đội mình đang Top 1 thì tự động rải phía sau để bẫy Top 2!).
     - `☄️ Thiên Thạch / $5` (`20 xu`): Giáng thiên thạch làm choáng đối thủ dẫn đầu + rung chấn màn hình.
     - `👑 Vương Miện / $20` (`99 xu`): Hào quang Chúa Tể 4.5s + Động đất toàn bản đồ + **Mưa Dê Vàng (`🐐`)**.
   - **Hàng Đợi Quà Giữa Hai Chặng (`Between-Race Gift Queue`)**: Quà tặng / SuperChat gửi lúc đang vinh danh Podium được lưu lại và bùng nổ ngay giây đầu tiên của chặng kế tiếp — không bao giờ làm hụt quà của mạnh thường quân!
   - **3 Bản Đồ Khu Bảo Tồn & Tỷ Lệ Khung Hình Đa Nền Tảng**:
     - *Bờ Biển Crocodilia*, *Hẻm Núi Hổ Phách*, *Đầm Lầy Phát Quang*.
     - Hỗ trợ cả **16:9 Ngang (YouTube Live / Web)**, **9:16 Dọc (TikTok LIVE Studio / Shorts)** và **Nền Trong Suốt (`?bg=transparent`)** để đè trực tiếp lên Webcam của KOL!

2. **Multi-Tenant Live Gateway (`TikTok Live` + `YouTube Live`)**:
   - Kết nối đồng thời cả **TikTok Live** (`tiktok-live-connector` v2, tự động tính delta chuỗi combo quà tặng, tự động kết nối lại theo hàm mũ có jitter) và **YouTube Live** (hỗ trợ cả **YouTube Data API v3** lẫn chế độ **InnerTube không cần API Key**!).
   - Phân tách phòng độc lập theo từng KOL (`roomId`), hỗ trợ song song cả **Socket.io** và **Server-Sent Events (`/api/sse/:roomId`)**.
   - Tích hợp **CORS-Safe Avatar Proxy (`/api/avatar`)** lọc domain an toàn (`tiktokcdn`, `ggpht.com`, `ytimg.com`) kèm SVG fallback để vẽ avatar khán giả trực tiếp lên HTML5 Canvas 2D không bị lỗi bảo mật CORS.

3. **Tuân Thủ Tuyệt Đối Đặc Tả Hạ Tầng & Pháp Lý Cổng Game9K**:
   - **Ngân sách siêu nhẹ**: Toàn bộ gói `dino-race` chỉ **~32.3 KB Gzip** (và bản đóng gói độc lập 1 tệp `standalone.html` chỉ **~35 KB Gzip** — nhỏ hơn gần 4 lần trần 125–275 KB của Game9K).
   - **Cô lập `<iframe sandbox="allow-scripts">`**: Chạy mượt trong môi trường Opaque Origin (`"null"`), bọc an toàn `localStorage` tránh lỗi `SecurityError`, xác thực nghiêm ngặt `event.source === iframe.contentWindow`.
   - **Tiết lưu Realtime Broadcast (`<= 15–20 Hz`)**: Bảo vệ trần gói tin của Supabase Realtime Broadcast và tuyệt đối không gọi `Presence.track()` trong vòng lặp vật lý.
   - **Google H5 Games Ad Placement API (`Game9K.ads`)**: Đầy đủ vòng đời `preroll` (kèm chốt chặn an toàn timeout **2 giây** chống treo màn hình chờ) và `reward` (`beforeReward` → `beforeAd` → `adViewed` → `afterAd` → `adBreakDone`).
   - **Mô phỏng Tuân thủ NĐ 147/2024/NĐ-CP (`/portal.html`)**: Tích hợp phân nhóm `G1–G4` trong `game9k.manifest.json` và cơ chế khóa phiên từ vỏ cổng khi người chơi dưới 18 tuổi vượt ngưỡng **60 phút/trò chơi** hoặc **180 phút/ngày**.
   - **CLI Kiểm Định & Mã Băm Bất Biến (`cli/g9k.js`)**: Lấy cảm hứng từ `chainplot`, hỗ trợ `--json` và sinh `dist/release-manifest.json` đóng dấu SHA-256 cho Cloudflare R2.

---

## 🚀 Khởi Chạy Nhanh (Quick Start)

```bash
# 1. Cài đặt gói phụ thuộc (Node.js >= 20)
npm install

# 2. Kiểm định gói game, đóng gói bản lẻ standalone.html & xác thực SHA-256
npm run build
npm run verify

# 3. Chạy bộ kiểm thử tự động
npm test

# 4. Khởi động máy chủ KOL Live Gateway & Cổng Sandbox (0.0.0.0:3000)
npm start
```

Sau khi chạy `npm start`, mở trình duyệt tại:

| Đường dẫn | Chức năng |
| :--- | :--- |
| **`http://localhost:3000/`** | **KOL Live Launcher Hub** — Tạo link OBS / TikTok LIVE Studio / YouTube Live & xem danh mục gói game |
| **`http://localhost:3000/games/dino-race/index.html`** | **Jurassic Sanctuary Sprint** — Bản đầy đủ (Tự lái Solo + 4 Đội KOL + 24 Avatar Khán Giả) |
| **`http://localhost:3000/games/dino-race/standalone.html`** | **Bản 1 File Độc Lập (~35 KB Gzip)** — Mở trực tiếp không cần máy chủ hoặc tải thẳng lên Cloudflare R2 |
| **`http://localhost:3000/portal.html`** | **Game9K Sandbox Portal Host** — Kiểm tra `<iframe sandbox="allow-scripts">`, đo Hz Realtime & khóa giờ chơi U18 |
| **`http://localhost:3000/debug.html`** | **Live Stream Debugger** — Theo dõi sự kiện TikTok Live / YouTube Live và bắn chuỗi 9 sự kiện mẫu |
| **`http://localhost:3000/spec.html`** | **Đặc Tả Kỹ Thuật Tương Tác** — Dashboard 5 trụ cột hạ tầng Cloudflare, Supabase, Ads, Solana & NĐ 147 |

---

## 🎥 Tham Số URL Nhanh Cho OBS / TikTok LIVE Studio / YouTube Live

Bạn có thể tạo tự động tại trang chủ `/` hoặc gắn trực tiếp các tham số sau vào URL **Browser Source**:

- `?mode=kol` — Chạy ngay chế độ **Đấu Trường 4 Đội KOL 24/7** (khán giả chat `1, 2, 3, 4`).
- `?mode=stampede&elim=1` — Chạy chế độ **Đại Chiến 24 Avatar Khán Giả (Đấu Loại Trực Tiếp)**.
- `?tiktok=ten_idol` — Tự động kết nối phòng TikTok Live của `@ten_idol`.
- `?youtube=VIDEO_ID_HOAC_URL` — Tự động kết nối phòng chat & SuperChat YouTube Live.
- `?layout=9x16` — Khung dọc chuẩn điện thoại (1080×1920).
- `?obs=1` — Ẩn thanh điều hướng phía trên để giao diện livestream gọn sạch.
- `?bg=transparent` — Xóa nền rừng thành trong suốt để lồng đường đua đè lên camera của KOL.
- `?autobot=1` — Bật luồng khán giả giả lập tự động để kiểm thử bố cục trước giờ lên sóng.

---

## 📚 Tài Liệu Chi Tiết & Nguồn Tham Khảo

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Kiến trúc kỹ thuật 5 trụ cột của Game9K Starter Kit.
- [`docs/KOL-STREAMING-GUIDE.md`](docs/KOL-STREAMING-GUIDE.md) — Hướng dẫn thiết lập OBS, TikTok LIVE Studio & YouTube Live 24/7 cho KOL.
- [`docs/SDK-PROTOCOL.md`](docs/SDK-PROTOCOL.md) — Đặc tả giao thức `window.Game9K`, `window.TikTokBridge`, `postMessage` và `game9k.manifest.json`.

### Đối Chiếu Tinh Hoa Từ Các Kho Mã Nguồn Mở Tham Chiếu

- [`lexuankhanh1612/chainplot`](https://github.com/lexuankhanh1612/chainplot) → Kiến trúc CLI tất định (`g9k validate/build/verify --json`) & đóng dấu SHA-256 bất biến cho bản phát hành tĩnh.
- [`lexuankhanh1612/watchtower`](https://github.com/lexuankhanh1612/watchtower) → Phân tách rõ tầng dịch vụ, giám sát sức khỏe (`/api/health`, `/api/stats`) & quy ước kiểm thử sạch.
- [`vamnguyen/tiktok-live-games`](https://github.com/vamnguyen/tiktok-live-games) → Vòng đời tự động 24/7, cô lập phòng Multi-tenant theo từng streamer, chuẩn hóa sự kiện & Top 3 Mạnh Thường Quân.
- [`khanhlx6/khanh-dragon-egg-tiktok-live`](https://github.com/khanhlx6/khanh-dragon-egg-tiktok-live) → Tích hợp `TikTokLiveConnection` v2, kênh SSE nhẹ, proxy ảnh đại diện chống lỗi CORS Canvas và bố cục dọc 9:16.
- [`khanhlx6/TikTok-Chat-Reader`](https://github.com/khanhlx6/TikTok-Chat-Reader) & [`TikTok-Live-Connector`](https://github.com/khanhlx6/TikTok-Live-Connector) → Giới hạn tần suất kết nối theo IP (`IpRateLimiter`) và quản lý phiên Webcast ổn định.
- [`livecade/marble-race-tiktok-live-game`](https://github.com/livecade/marble-race-tiktok-live-game) → Chế độ mỗi khán giả hóa thân thành nhân vật mang Avatar cá nhân, Đấu Loại Trực Tiếp, vật phẩm phá đám Top 1 (Bẫy Chuối, Thiên Thạch, Chaos) và hàng đợi lưu quà giữa hai chặng đua.
- [`qafaraz/Horse-Race`](https://github.com/qafaraz/Horse-Race) & [`khanhlx6/javascript-racer`](https://github.com/khanhlx6/javascript-racer) → Nhịp độ bứt tốc lội ngược dòng ngẫu nhiên (rubber-banding drama), rung chấn camera, hạt bụi/nước 60 FPS thuần HTML5 Canvas.
