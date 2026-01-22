# Hướng dẫn Tích hợp Cloud Storage với Rclone

Hướng dẫn này giúp bạn mount Google Drive, Google Photos, OneDrive và các dịch vụ cloud khác vào Windows để DRAM PLAYSV có thể quét và phát video từ cloud.

---

## 1. Cài đặt Rclone

### Windows
```powershell
# Cách 1: Dùng winget (Windows 10/11)
winget install Rclone.Rclone

# Cách 2: Dùng Chocolatey
choco install rclone

# Cách 3: Tải thủ công
# Tải từ https://rclone.org/downloads/
# Giải nén vào C:\rclone và thêm vào PATH
```

### Kiểm tra cài đặt
```powershell
rclone version
```

---

## 2. Cấu hình Google Drive

```powershell
rclone config
```

1. Nhấn `n` để tạo remote mới
2. Nhập tên: `gdrive` (hoặc tên bạn thích)
3. Chọn số tương ứng với `Google Drive`
4. **client_id**: Để trống (Enter)
5. **client_secret**: Để trống (Enter)
6. **scope**: Chọn `1` (Full access)
7. **service_account_file**: Để trống
8. **Edit advanced config**: `n`
9. **Use auto config**: `y` → Trình duyệt mở ra, đăng nhập Google
10. **Configure as team drive**: `n`
11. Xác nhận: `y`

### Test kết nối
```powershell
rclone ls gdrive: --max-depth 1
```

---

## 3. Cấu hình Google Photos

> ⚠️ **Lưu ý**: Google Photos qua rclone chỉ hỗ trợ **đọc** (read-only).

```powershell
rclone config
```

1. Nhấn `n` → Tên: `gphotos`
2. Chọn `Google Photos`
3. **client_id/secret**: Để trống
4. **read_only**: `true` (khuyên dùng)
5. **Edit advanced config**: `n`
6. **Use auto config**: `y` → Đăng nhập Google
7. Xác nhận

### Test
```powershell
rclone ls gphotos: --max-depth 1
```

---

## 4. Mount Cloud Drive thành ổ đĩa Windows

### Mount Google Drive vào ổ G:
```powershell
rclone mount gdrive: G: --vfs-cache-mode full
```

### Mount Google Photos vào ổ P:
```powershell
rclone mount gphotos: P: --vfs-cache-mode full --read-only
```

### Chạy ngầm (không hiện cửa sổ)
```powershell
Start-Process -WindowStyle Hidden -FilePath "rclone" -ArgumentList "mount gdrive: G: --vfs-cache-mode full"
```

---

## 5. Tự động Mount khi khởi động Windows

### Cách 1: Task Scheduler (Khuyên dùng)

1. Mở **Task Scheduler** (`taskschd.msc`)
2. **Create Task** (không phải Basic Task)
3. Tab **General**:
   - Name: `Rclone Mount GDrive`
   - ✅ Run whether user is logged on or not
   - ✅ Run with highest privileges
4. Tab **Triggers**:
   - New → At startup
5. Tab **Actions**:
   - New → Start a program
   - Program: `C:\rclone\rclone.exe` (đường dẫn rclone)
   - Arguments: `mount gdrive: G: --vfs-cache-mode full`
6. Tab **Conditions**:
   - ❌ Bỏ chọn "Start only if on AC power"
7. OK → Nhập mật khẩu Windows

### Cách 2: Script startup

Tạo file `mount-cloud.bat` trong `shell:startup`:
```batch
@echo off
start "" /B rclone mount gdrive: G: --vfs-cache-mode full
start "" /B rclone mount gphotos: P: --vfs-cache-mode full --read-only
```

---

## 6. Thêm vào DRAM PLAYSV

Sau khi mount thành công:

1. Mở DRAM PLAYSV (http://localhost:3002)
2. **Cài đặt** → **Thư mục quét**
3. Thêm đường dẫn: `G:\Videos` (hoặc thư mục chứa video trong GDrive)
4. Thêm đường dẫn: `P:\` (toàn bộ Google Photos)
5. Nhấn **Quét thư viện**

---

## 7. Các dịch vụ Cloud khác được hỗ trợ

| Dịch vụ | Tên rclone | Ghi chú |
|---------|------------|---------|
| OneDrive | `onedrive` | Hỗ trợ Personal & Business |
| Dropbox | `dropbox` | Cần OAuth |
| Box | `box` | Doanh nghiệp |
| pCloud | `pcloud` | |
| Mega | `mega` | Email + Password |
| Amazon S3 | `s3` | Cần Access Key |
| FTP/SFTP | `ftp`/`sftp` | NAS, VPS |

Tất cả đều cấu hình tương tự với `rclone config`.

---

## 8. Khắc phục sự cố

### Lỗi "WinFsp not installed"
```powershell
winget install WinFsp.WinFsp
# Hoặc tải từ https://winfsp.dev/
```

### Ổ đĩa không hiện
- Chạy CMD/PowerShell với quyền **Administrator**
- Thêm flag `--network-mode`

### Tốc độ chậm
```powershell
rclone mount gdrive: G: --vfs-cache-mode full --vfs-read-chunk-size 128M --buffer-size 256M
```

### Xem log lỗi
```powershell
rclone mount gdrive: G: --vfs-cache-mode full -vv
```

---

## 9. Unmount

```powershell
# Windows
taskkill /F /IM rclone.exe

# Hoặc dùng WinFsp
net use G: /delete
```

---

## Tài liệu tham khảo

- [Rclone Documentation](https://rclone.org/docs/)
- [Google Drive Setup](https://rclone.org/drive/)
- [Google Photos Setup](https://rclone.org/googlephotos/)
- [WinFsp](https://winfsp.dev/)
