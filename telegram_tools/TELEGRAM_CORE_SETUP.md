# 🤖 Hướng dẫn Thiết lập Telegram Bot & Cloud Sync

Để kích hoạt tính năng Telegram (Cloud Storage & Remote Control), bạn cần chuẩn bị 2 thành phần chính:
1. **Telegram API Key** (Để server kết nối như một người dùng - Upload/Download không giới hạn)
2. **Telegram Bot** (Để nhận thông báo và điều khiển server)

---

## 🛠️ Phần 1: Tạo Telegram API Key (API ID & Hash)
*Bắt buộc để tính năng Cloud Sync hoạt động (dùng thư viện Pyrogram).*

1. Truy cập: **[my.telegram.org](https://my.telegram.org)**
2. Nhập số điện thoại của bạn và xác thực qua mã gửi về Telegram.
3. Chọn mục **"API development tools"**.
4. Điền form đăng ký (chỉ cần điền 2 dòng đầu):
   - **App title**: `MediaServer` (hoặc tên tùy thích)
   - **Short name**: `mediaserver`
   - *Platform*: Chọn `Desktop`
5. Nhấn **"Create application"**.
6. **LƯU LẠI 2 THÔNG SỐ SAU:**
   - **`api_id`** (Ví dụ: `1234567`)
   - **`api_hash`** (Ví dụ: `a1b2c3d4e5f6...`)

> ⚠️ **Lưu ý:** Không chia sẻ 2 thông số này cho ai khác.

---

## 🤖 Phần 2: Tạo Bot & Lấy Token
*Dùng để server gửi thông báo (Download xong, Lỗi...) hoặc điều khiển từ xa.*

1. Mở Telegram, tìm kiếm user: **@BotFather** (có tích xanh).
2. Chat lệnh: `/newbot`
3. Đặt tên hiển thị cho Bot (Ví dụ: `My Media Server`).
4. Đặt username cho Bot (Phải kết thúc bằng `bot`, ví dụ: `dram_media_bot`).
5. BotFather sẽ gửi cho bạn **Token**.
   - Dạng: `123456789:ABCdefGHIjklMNOpqrs...`
   - **LƯU LẠI TOKEN NÀY.**

---

## ⚙️ Phần 3: Cấu hình Bot (Các lệnh cần thiết)
Để Bot hoạt động thông minh, hãy cài đặt menu lệnh cho nó.

1. Chat với **@BotFather**: `/mybots`
2. Chọn Bot bạn vừa tạo.
3. Chọn **Edit Bot** > **Edit Commands**.
4. Copy và dán danh sách lệnh sau:

```text
start - Khởi động và kiểm tra kết nối
search - 🔎 Tìm kiếm phim/ảnh
download - ⬇️ Tải file từ Telegram về Server
status - 📊 Xem trạng thái Server (CPU/RAM/Disk)
play - ▶️ Phát file (gửi link hoặc tên file)
queue - ⏳ Xem hàng đợi tải xuống
cancel - ❌ Hủy tác vụ đang chạy
help - ℹ️ Xem hướng dẫn sử dụng
```

5. BotFather sẽ báo "Success". Bây giờ Bot đã có menu lệnh chuyên nghiệp.

---

## 📝 Tóm tắt thông tin cần có
Sau khi thực hiện xong, bạn sẽ có 3 thông tin cần thiết để nhập vào cấu hình Server:

1. **API ID**: `.......`
2. **API Hash**: `.......`
3. **Bot Token**: `.......`

---

## 🚀 Bước tiếp theo
Sau khi có các thông tin trên, bạn sẽ nhập chúng vào file cấu hình (hoặc giao diện Settings của Media Server) để kích hoạt tính năng.
