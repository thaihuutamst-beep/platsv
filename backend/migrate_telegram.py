import sqlite3
from pathlib import Path
import sys

# DB Path
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "media.db"

def run_migration():
    print(f"Migrating database at {DB_PATH}")
    if not DB_PATH.exists():
        print("Database not found!")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Create telegram_files table
        print("Creating telegram_files table...")
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS telegram_files (
            id INTEGER PRIMARY KEY,
            media_id INTEGER NOT NULL UNIQUE,
            chat_id VARCHAR NOT NULL,
            message_id INTEGER,
            file_id VARCHAR,
            is_split BOOLEAN DEFAULT 0,
            FOREIGN KEY(media_id) REFERENCES media_files(id)
        )
        """)
        
        # Create telegram_file_chunks table
        print("Creating telegram_file_chunks table...")
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS telegram_file_chunks (
            id INTEGER PRIMARY KEY,
            telegram_file_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            file_id VARCHAR NOT NULL,
            size INTEGER NOT NULL,
            FOREIGN KEY(telegram_file_id) REFERENCES telegram_files(id)
        )
        """)
        
        # Indices
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_telegram_files_media_id ON telegram_files (media_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_telegram_file_chunks_telegram_file_id ON telegram_file_chunks (telegram_file_id)")
        
        conn.commit()
        conn.close()
        print("Migration complete.")
    except Exception as e:
        print(f"Error during migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
