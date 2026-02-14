# 📖 HƯỚNG DẪN VẬN HÀNH DRAM MEDIA SERVER (TỐI ƯU)

Chào mừng bạn đến với phiên bản "Điểm Ngọt" của Media Drive. Dưới đây là mọi thứ bạn cần biết để vận hành server hiệu quả nhất trên Surface Pro 8.

---

## 🚀 1. Khởi động nhanh
Chỉ cần chạy file: **`START_DRAM_SERVER.bat`** ở thư mục gốc.
- Script sẽ tự động mở 2 cửa sổ cmd (Backend & Frontend).
- Sau 5 giây, trình duyệt sẽ tự mở trang chủ.

---

## 🛠 2. Quản lý Backend (API & Monitoring)
Khi server đang chạy, bạn có thể truy cập các "siêu tính năng" mới tại:
- **Hệ thống Stats:** [http://localhost:8000/system/stats](http://localhost:8000/system/stats) (Xem CPU/RAM/Disk)
- **Cache Stats:** [http://localhost:8000/cache/stats](http://localhost:8000/cache/stats) (Xem bộ nhớ đệm)
- **Tài liệu API:** [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI)

---

## 🔐 3. Bật Chế độ Bảo mật (Authentication)
Mặc định hệ thống chạy ở chế độ `None` (không mật khẩu). Nếu muốn bật API Key cho an toàn:

1. Chuột phải vào `START_DRAM_SERVER.bat` -> **Edit**.
2. Thêm các dòng sau vào trước lệnh `start`:
   ```batch
   set MEDIA_DRIVE_AUTH_MODE=apikey
   set MEDIA_DRIVE_API_KEY=MatKhauCuaBan123
   ```
3. Lưu lại và khởi động lại server.

---

## 🎞 4. MPV "Điểm Ngọt" (Sweet Spot)
Hệ thống MPV đã được cấu hình để **tự quản lý**.

- **Xem Video HD/SD:** Máy tự dùng profile `sweet-spot` (Shader RAVU) cho hình ảnh cực nét nhưng máy không nóng.
- **Xem Video 4K:** Máy tự chuyển về `safe` mode để đảm bảo mượt mà 100%, không bị sụt khung hình.
- **Xem ẢNH:** Máy tự dùng profile `hq-2` (FSRCNNX) để ảnh sắc nét nhất có thể.

### Các phím tắt "Kho Vũ Khí" (Giữ nguyên thói quen):
- `Ctrl + Numpad 0-9`: Chuyển đổi thủ công giữa 10 cấp độ shader phục hồi.
- `Chuột giữa`: Reset Zoom/Pan (giữ nguyên góc xoay).
- `Chuột trái (Giữ & Kéo)`: Di chuyển ảnh/video (Pan).
- `Lăn chuột`: Zoom mượt vào chi tiết.

---

## 📱 5. Sử dụng trên Điện thoại (PWA)
1. Mở Chrome trên Android/iOS.
2. Truy cập địa chỉ IP của máy Surface (ví dụ: `http://192.168.1.5:5173`).
3. Chọn **"Add to Home Screen"** (Thêm vào màn hình chính).
4. Bạn sẽ có một ứng dụng Media Drive chạy mượt như App Native.

---

## 🧹 6. Bảo trì
- Nếu thấy list file không cập nhật, hãy bấm nút **Scan** trên giao diện web. Hệ thống sẽ tự động dọn dẹp cache cũ.
- Nếu Surface Pro 8 quá nóng, hãy kiểm tra xem bạn có đang để profile `hq-9` (God Mode) quá lâu hay không.

---
*Chúc bạn có trải nghiệm giải trí tuyệt vời!*
