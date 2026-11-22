# Đặc Tả Kiến Trúc Kỹ Thuật Game9K Starter Kit

Tài liệu này mô tả chi tiết cách `Game9K-Starter-Kit` hiện thực hóa đầy đủ 5 trụ cột kỹ thuật của cổng trò chơi **Game9K (`game9k.com`)** trên nền tảng **Cloudflare Edge + R2**, **Supabase (PostgreSQL + Realtime)** và **Solana**.

---

## 1. Quy Trình Kiểm Định & Đóng Gói 3 Bước (`cli/g9k.js`)

1. **Bước 1 — Quét Tĩnh & Đóng Dấu Mã Băm Bất Biến (`npm run validate` & `npm run build`)**:
   - Đọc `game9k.manifest.json` của từng trò chơi trong `public/games/<slug>/`.
   - Kiểm tra ngân sách dung lượng nén Gzip (`dino-race` đạt **32.3 KB Gzip**, thấp hơn nhiều trần `125–275 KB`).
   - Tự động từ chối bản dựng nếu phát hiện thẻ `<video>` (gây lỗi `playsinline` trên TikTok In-App WebView), lệnh thực thi động (`eval`, `new Function`), hoặc truy cập trái phép `parent.document.cookie` / `window.top.location`.
   - Xuất gói phát hành tĩnh ra `dist/` kèm `dist/release-manifest.json` chứa mã băm `SHA-256` của từng tệp và `bundle_sha256` toàn cục để lưu trữ bất biến trên **Cloudflare R2** (phục vụ qua Custom Domain bật nén Zstd/Brotli).
2. **Bước 2 — Vận Hành Hai Chế Độ Độc Lập Hoặc Nối Cổng (`public/sdk/game9k-sdk.js`)**:
   - **Chế độ Độc lập (`G4`)**: Chạy 100% phía trình duyệt (kể cả mở trực tiếp tệp `standalone.html`), không phụ thuộc máy chủ, tự động dùng bộ nhớ tạm an toàn khi không có `localStorage`.
   - **Chế độ Kết nối Cổng (`G2` / `G1`)**: Nhúng trong `<iframe sandbox="allow-scripts">` (Opaque Origin `"null"`), trao đổi thông điệp hai chiều qua `window.postMessage` với xác thực chặt `event.source === iframe.contentWindow`.
3. **Bước 3 — Telemetry Người Chơi Thực & Mở Khóa Chặng Token Solana**:
   - Trò chơi phát các sự kiện chuẩn (`game_ready`, `race_started`, `race_finished`, `leaderboard_submit`) lên lớp vỏ cổng (`/portal.html`) để đo lường tỷ lệ hoàn thành phiên chơi thật trước khi mở khóa chặng gọi vốn token tiếp theo của studio.

---

## 2. Tiết Lưu Supabase Realtime Broadcast (`<= 20 Hz`)

- Mọi gói dịch vụ Supabase Realtime đều áp trần cứng **5 lần gọi `Presence.track()` mỗi 30 giây / client**. Nếu đẩy tọa độ khủng long qua `Presence`, kênh sẽ bị ngắt ngay với lỗi `ClientPresenceRateLimitReached`.
- `Game9K.broadcastTick(payload)` trong SDK cưỡng bức chu kỳ tối thiểu `66ms` (**~15 sự kiện/giây**, không bao giờ vượt quá trần `20 Hz`), chỉ truyền gói tin tạm thời qua kênh **Broadcast** (độ trễ trung vị ~6ms).

---

## 3. Tích Hợp Google H5 Games Ad Placement API (`Game9K.ads`)

- Hỗ trợ đầy đủ `adConfig()` và `adBreak()` cho cả định dạng **Xen kẽ (`preroll`, `next`)** và **Có thưởng (`reward`)**.
- Tích hợp **bộ hẹn giờ an toàn 2.000ms** cho `preroll`: nếu mạng chậm hoặc tên miền đang chờ duyệt H5 Beta (`breakStatus=other`), game tự động giải phóng khóa chờ để người chơi vào đường đua ngay lập tức.
- Tự động đóng băng vòng lặp vật lý (`beforeAd`) và tắt tiếng Web Audio synthesizer, sau đó khôi phục nguyên trạng tại `afterAd` / `adBreakDone`.

---

## 4. Khuôn Khổ Tuân Thủ Nghị Định 147/2024/NĐ-CP (Thị Trường Việt Nam)

- Tệp `game9k.manifest.json` bắt buộc khai báo `legal_classification` (`G1`, `G2`, `G3` hoặc `G4`).
- Lớp vỏ cổng (`/portal.html`) đặt bên ngoài `<iframe>` chịu trách nhiệm giám sát tổng thời gian chơi trong ngày của tài khoản dưới 18 tuổi (**tối đa 60 phút/ngày cho một game** và **180 phút/ngày trên toàn cổng**) và gửi lệnh `UNDER18_LIMIT_LOCK` để khóa cứng màn hình chơi khi chạm ngưỡng.
