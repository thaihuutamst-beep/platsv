import sqlite3
from pathlib import Path
import sys

# DB Path
# This script is placed in backend/
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "media.db"

def run_migration():
    print(f"Migrating database at {DB_PATH}")
    if not DB_PATH.exists():
        print("Database not found! Creating new DB via app startup is required first.")
        # If DB doesn't exist, we don't need to migrate, the updated models will create it correctly on startup
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if columns exist
        cursor.execute("PRAGMA table_info(media_files)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "cloud_backed" not in columns:
            print("Adding cloud_backed column...")
            cursor.execute("ALTER TABLE media_files ADD COLUMN cloud_backed BOOLEAN DEFAULT 0")
            # SQLite creates index with CREATE INDEX
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_media_files_cloud_backed ON media_files (cloud_backed)")
        else:
            print("cloud_backed column already exists.")

        if "cloud_provider" not in columns:
            print("Adding cloud_provider column...")
            cursor.execute("ALTER TABLE media_files ADD COLUMN cloud_provider VARCHAR DEFAULT NULL")
        else:
            print("cloud_provider column already exists.")
            
        conn.commit()
        conn.close()
        print("Migration complete.")
    except Exception as e:
        print(f"Error during migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
