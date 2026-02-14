import os
import sys
import asyncio
import json
import re
from pathlib import Path

# --- Configuration Paths ---
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
DATA_DIR = BACKEND_DIR / "data"
CONFIG_FILE = BACKEND_DIR / "config" / "telegram.json"
SESSION_FILE = DATA_DIR / "telegram_session.session"

# --- Libraries Installation ---
def install_libraries():
    print("📦 Đang kiểm tra thư viện (Pyrogram, TgCrypto)...")
    try:
        import pyrogram
    except ImportError:
        print("⏳ Đang cài đặt thư viện...")
        os.system(f"{sys.executable} -m pip install -q pyrogram tgcrypto")
        print("✅ Cài đặt xong.")

# --- Smart Detection Logic ---
def smart_parse(text_blob):
    results = {
        "api_id": None,
        "api_hash": None,
        "bot_token": None,
        "channel_id": None
    }
    
    # 1. Detect Bot Token (Format: 123456:ABC-DEF...)
    token_match = re.search(r'(\d{8,12}:[a-zA-Z0-9_-]{35})', text_blob)
    if token_match:
        results["bot_token"] = token_match.group(1)
    
    # 2. Detect API Hash (32 chars hex)
    # Exclude if part of bot token (token usually has mix cases, hash is usually lowercase/mix but 32 chars)
    # Strategy: Find 32 hex chars.
    hash_match = re.search(r'\b([a-fA-F0-9]{32})\b', text_blob)
    if hash_match:
        results["api_hash"] = hash_match.group(1)
        
    # 3. Detect API ID (5-10 digits)
    # Must NOT be the start of the bot token.
    # We remove the bot token digits from consideration if found.
    clean_text_for_id = text_blob
    if results["bot_token"]:
        clean_text_for_id = text_blob.replace(results["bot_token"].split(':')[0], "")
        
    id_match = re.search(r'\b(\d{5,10})\b', clean_text_for_id)
    if id_match:
        results["api_id"] = id_match.group(1)

    # 4. Detect Channel ID
    # Priority: Starts with -100, then just -something, then detect potential loose numbers
    # User case: "-100-số-và-chữ" -> maybe just -100...
    
    # Try strict -100 format first
    chan_match = re.search(r'(-100\d+)', text_blob)
    if chan_match:
        results["channel_id"] = int(chan_match.group(1))
    else:
        # User might have "100123..." without minus, or "channel_id: 123..."
        # Or mixed text "-100-abc". If it contains letters, it might be a username @channel
        # Let's simple check for "-100" followed by digits
        loose_match = re.search(r'[-]?100(\d+)', text_blob)
        if loose_match:
             # Force add -100
             results["channel_id"] = int("-100" + loose_match.group(1))

    return results

# --- Setup Logic ---
async def setup_telegram():
    install_libraries()
    from pyrogram import Client

    print("\n🚀 TELEGRAM SMART SETUP 🚀")
    print("--------------------------------------------------")
    print("👉 Hãy copy TẤT CẢ thông tin bạn có (API ID, Hash, Token, Channel ID...)")
    print("👉 Dán vào bên dưới (dán 1 cục cũng được).")
    print("👉 Nhấn Enter rồi gõ 'OK' để xử lý.")
    print("--------------------------------------------------")

    raw_lines = []
    while True:
        line = input()
        if line.strip().upper() == "OK":
            break
        if line.strip():
            raw_lines.append(line)
    
    blob = " ".join(raw_lines)
    data = smart_parse(blob)

    print("\n🔍 ĐANG PHÂN TÍCH DỮ LIỆU...")
    
    # Validate & Prompt if missing
    if data["api_id"]:
        print(f"✅ Tìm thấy API ID: {data['api_id']}")
    else:
        data["api_id"] = input("⚠️ Chưa thấy API ID (nhập thủ công): ").strip()

    if data["api_hash"]:
        print(f"✅ Tìm thấy API Hash: {data['api_hash']}")
    else:
        data["api_hash"] = input("⚠️ Chưa thấy API Hash (nhập thủ công): ").strip()
        
    if data["bot_token"]:
        print(f"✅ Tìm thấy Bot Token: {data['bot_token']}")
    else:
        print("ℹ️ Không thấy Bot Token (bỏ qua nếu không dùng).")

    if data["channel_id"]:
         print(f"✅ Tìm thấy Channel ID: {data['channel_id']}")
    
    confirm = input("\n👉 Thông tin trên đã đúng chưa? (Y/n): ").strip().upper()
    if confirm == "N":
        print("❌ Đã hủy. Hãy chạy lại và dán thông tin chính xác.")
        return

    # Auto Authenticate
    print("\n🔐 Đang kết nối server Telegram...")
    
    # Ensure data directory exists
    os.makedirs(DATA_DIR, exist_ok=True)

    try:
        # Use a temporary session name for setup to avoid conflicts
        app = Client(
            "setup_session",
            api_id=data["api_id"],
            api_hash=data["api_hash"],
            workdir=str(DATA_DIR)
        )
        await app.connect()
    except Exception as e:
        print(f"❌ Lỗi kết nối (Chi tiết): {e}")
        print("💡 Gợi ý: Kiểm tra lại API ID/Hash, hoặc tắt Server đang chạy nếu nó đang dùng file session.")
        return

    # Phone Auth
    print("\n📱 Cần xác thực tài khoản User (để upload/download file lớn)...")
    phone = input("👉 Nhập số điện thoại (ví dụ +84...): ").strip()
    
    try:
        sent_info = await app.send_code(phone)
    except Exception as e:
        print(f"❌ Lỗi gửi mã: {e}")
        return

    code = input("👉 Nhập mã xác thực (Telegram/SMS): ").strip()
    
    try:
        await app.sign_in(phone, sent_info.phone_code_hash, code)
    except Exception as e:
        if "SESSION_PASSWORD_NEEDED" in str(e):
            pw = input("🔐 Nhập mật khẩu 2FA: ").strip()
            await app.check_password(pw)
        else:
            print(f"❌ Đăng nhập thất bại: {e}")
            return

    me = await app.get_me()
    print(f"\n✅ ĐĂNG NHẬP THÀNH CÔNG! Xin chào {me.first_name}")
    
    await app.disconnect()

    # Save Config
    config = {
        "api_id": data["api_id"],
        "api_hash": data["api_hash"],
        "bot_token": data["bot_token"],
        "channel_id": data["channel_id"],
        "admin_id": me.id
    }
    
    os.makedirs(CONFIG_FILE.parent, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=4)
        
    print(f"💾 Đã lưu cấu hình vào {CONFIG_FILE}")
    print("\n🎉 SETUP HOÀN TẤT!")

if __name__ == "__main__":
    asyncio.run(setup_telegram())
