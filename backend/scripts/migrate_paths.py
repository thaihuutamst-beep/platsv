
import sys
import argparse
import sqlite3
from pathlib import Path

# DB Path relative to script location (scripts/ -> backend/ -> media.db)
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "media.db"

def migrate_paths(old_prefix: str, new_prefix: str, dry_run: bool = True):
    """
    Migrate paths in database from old prefix to new prefix.
    Preserves thumbnails and history since they reference ID.
    """
    print(f"Connecting to database at {DB_PATH}")
    if not DB_PATH.exists():
        print("Error: Database not found!")
        sys.exit(1)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Normalize slashes
    old_prefix = old_prefix.replace("/", "\\")
    new_prefix = new_prefix.replace("/", "\\")
    
    print(f"Old Prefix: {old_prefix}")
    print(f"New Prefix: {new_prefix}")
    
    # 1. Count affected rows
    cursor.execute("SELECT COUNT(*) FROM media_files WHERE path LIKE ?", (f"{old_prefix}%",))
    count = cursor.fetchone()[0]
    
    if count == 0:
        print("No files found matching the old prefix.")
        conn.close()
        return

    print(f"Found {count} files matching old prefix.")
    
    if dry_run:
        print("\n--- DRY RUN ---")
        # Show first 5 examples
        cursor.execute("SELECT path FROM media_files WHERE path LIKE ? LIMIT 5", (f"{old_prefix}%",))
        rows = cursor.fetchall()
        for row in rows:
            old_path = row[0]
            new_path = old_path.replace(old_prefix, new_prefix, 1)
            print(f"{old_path} -> {new_path}")
        print("...")
        print(f"Total {count} files would be updated.")
        print("\nRun with --execute to apply changes.")
    else:
        print("\n--- EXECUTING ---")
        try:
            # SQLite REPLACE function only works on full string matching or specific implementation
            # Standard SQL: UPDATE media_files SET path = ? || SUBSTR(path, LENGTH(?)+1) WHERE path LIKE ?
            
            # Using python to iterate and update is safer for complex replacements, 
            # but SQL is faster. Let's try SQL first.
            
            # Efficient Update using SQL
            # Construct new path: new_prefix + substring(path, len(old_prefix)+1)
            # SQLite substr is 1-indexed.
            
            # We will fetch all, update in python, and bulk update for safety and correctness with python string manipulation
            cursor.execute("SELECT id, path FROM media_files WHERE path LIKE ?", (f"{old_prefix}%",))
            rows = cursor.fetchall()
            
            chunk_size = 1000
            updated_rows = 0
            
            for i in range(0, len(rows), chunk_size):
                chunk = rows[i:i+chunk_size]
                updates = []
                for row_id, old_path in chunk:
                    new_path = old_path.replace(old_prefix, new_prefix, 1)
                    updates.append((new_path, row_id))
                
                cursor.executemany("UPDATE media_files SET path = ? WHERE id = ?", updates)
                updated_rows += len(updates)
                print(f"Updated {updated_rows}/{count}...")
                
            conn.commit()
            print("Migration complete successfully.")
            
        except Exception as e:
            print(f"Error during migration: {e}")
            conn.rollback()
        finally:
            conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate media paths in database.")
    parser.add_argument("--old", required=True, help="Old path prefix (e.g. C:\\Users\\Original\\OneDrive)")
    parser.add_argument("--new", required=True, help="New path prefix (e.g. Z:\\)")
    parser.add_argument("--execute", action="store_true", help="Execute the migration (default is dry-run)")
    
    args = parser.parse_args()
    
    migrate_paths(args.old, args.new, not args.execute)
