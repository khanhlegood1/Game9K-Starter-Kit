# Hướng Dẫn Phát Trực Tiếp 24/7 Trên TikTok Live & YouTube Live Cho KOL

Tựa game **Jurassic Sanctuary Sprint** được thiết kế tối ưu cho các KOL / Streamer treo phòng tương tác hoặc bình luận trực tiếp trên **OBS Studio**, **TikTok LIVE Studio** và **Streamlabs**.

---

## 1. Thiết Lập Trong 60 Giây

1. Khởi động máy chủ Gateway trên máy tính livestream (hoặc VPS):
   ```bash
   npm install
   npm start
   ```
2. Mở **`http://localhost:3000`** trên trình duyệt.
3. Tại mục **Trình Tạo Link OBS / TikTok LIVE Studio**:
   - Điền **TikTok Username** (ví dụ: `@ten_kenh_tiktok` — lưu ý tài khoản phải đang bật LIVE).
   - Hoặc điền **YouTube Live URL / Video ID** (ví dụ: `https://www.youtube.com/watch?v=xxxxxxxxxxx` — hoạt động ngay cả khi chưa cấu hình `YOUTUBE_API_KEY` nhờ cơ chế InnerTube tự động, hoặc thêm `YOUTUBE_API_KEY` trong `.env` nếu muốn dùng API chính thức).
   - Chọn **Chế độ Đua**:
     - `4 Đội Khủng Long (Chat 1-4)`: Phù hợp khi muốn khán giả chia phe cổ vũ 4 đội rõ ràng.
     - `24 Avatar Khán Giả`: Mỗi người bình luận/thả tim sẽ xuất hiện một chú khủng long mang chính tên và ảnh đại diện của họ!
   - Chọn tỷ lệ khung hình: **9:16 Dọc (`1080 × 1920`)** cho TikTok LIVE Studio / YouTube Shorts hoặc **16:9 Ngang (`1920 × 1080`)** cho YouTube Live.
4. Bấm **Sao Chép Link** và dán vào nguồn **Browser Source** trong OBS / TikTok LIVE Studio (nhớ bật tùy chọn *Control audio via OBS* nếu muốn thu tiếng gầm khủng long & nhạc fanfare quà tặng).

---

## 2. Bảng Quy Đổi Tương Tác Khán Giả

| Hành động của khán giả (TikTok / YouTube) | Hiệu ứng trong đường đua Khủng Long |
| :--- | :--- |
| **Chat `1`, `2`, `3`, `4`** (hoặc tên màu/loài) | Cộng Nộ Khí bứt tốc cho đội tương ứng (hoặc chọn loài khi tham gia chế độ 24 Avatar) |
| **Thả Tim / Like / Follow / Share** | Bơm Nộ Khí ngẫu nhiên hoặc đưa Avatar khán giả vào cổng chờ xuất phát |
| **🌹 Quà 1–4 xu / SuperChat `$0.50`** | **Hoa Hồng Tốc Độ**: `+45 Nộ Khí` & bứt tốc 2 giây |
| **🥩 Quà 5–9 xu / SuperChat `$1`** | **Đùi Thịt Khủng Long**: Đầy bình Nộ Khí, Gầm Nitro 3 giây & miễn giảm tốc đầm lầy |
| **🍌 Quà 10–19 xu / SuperChat `$2`** | **Bẫy Bùn Chuối**: Rải bẫy trượt ngay trước mặt tay đua dẫn đầu (Top 1) làm xoay vòng! |
| **☄️ Quà 20–98 xu / SuperChat `$5`** | **Thiên Thạch Cổ Đại**: Khóa mục tiêu & làm choáng các đối thủ dẫn đầu kèm rung chấn camera |
| **👑 Quà 99+ xu / SuperChat `$20+`** | **Vương Miện Chúa Tể**: Hào quang Vua 4.5s + Động đất toàn sân + **Mưa Dê Vàng (`🐐`)** |

> 💡 **Mẹo giữ chân người xem cho KOL:** Hãy xuất hiện trên camera góc màn hình (bật tham số `?bg=transparent` hoặc đặt khung camera cạnh đường đua) và bình luận trực tiếp những pha lội ngược dòng ở vòng 3 hoặc những quả Thiên Thạch / Bẫy Chuối bất ngờ ở mét cuối!
