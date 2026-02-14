from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# SỬA ở đây thành thư mục bạn muốn index
MEDIA_ROOT = Path(r"C:\Users\Original")

THUMB_ROOT = BASE_DIR / "thumbnails"
DB_URL = f"sqlite+aiosqlite:///{BASE_DIR / 'media.db'}"

THUMB_ROOT.mkdir(exist_ok=True, parents=True)
