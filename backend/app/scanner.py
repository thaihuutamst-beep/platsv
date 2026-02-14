import os
import json
from pathlib import Path
from sqlalchemy import select
from .models import MediaFile, Setting
from .database import AsyncSessionLocal
from .cloud_storage_manager import cloud_manager

# Default excluded paths if not configured
DEFAULT_EXCLUDED = ["$RECYCLE.BIN", "System Volume Information", ".git", "node_modules", "__pycache__", ".venv", "venv", "windows", "appdata", "program files", "program files (x86)"]

async def get_excluded_paths(db_session) -> list[str]:
    """Load excluded_paths from settings database."""
    try:
        result = await db_session.execute(
            select(Setting).where(Setting.key == "excluded_paths")
        )
        setting = result.scalar_one_or_none()
        if setting and setting.value:
            return json.loads(setting.value)
    except Exception:
        pass
    return DEFAULT_EXCLUDED


def should_exclude_dir(dir_name: str, excluded_paths: list[str]) -> bool:
    """Check if directory should be excluded from scanning."""
    # Always skip hidden directories
    if dir_name.startswith('.'):
        return True
    
    # Check against excluded paths (case-insensitive)
    dir_lower = dir_name.lower()
    for excluded in excluded_paths:
        excluded_lower = excluded.lower()
        if dir_lower == excluded_lower or dir_lower.endswith(excluded_lower):
            return True
    
    return False


async def scan_media(root_path: Path, skip_cloud_paths: bool = True):
    """Scan media library and add new files to the database.
    This function creates its own database session for use in background tasks.
    Respects excluded_paths setting from database.
    
    Args:
        root_path: Root directory to scan
        skip_cloud_paths: If True, skip cloud-backed directories (default: True to prevent RAM bloat)
    """
    extensions = {".mp4", ".mkv", ".avi", ".mov", ".mp3", ".flac", ".jpg", ".png", ".webp", ".gif", ".webm"}
    count = 0
    skipped_dirs = 0
    cloud_files_count = 0
    cloud_warnings = set()
    
    async with AsyncSessionLocal() as db_session:
        # Load excluded paths from settings
        excluded_paths = await get_excluded_paths(db_session)
        print(f"Scanner: Excluding directories matching: {excluded_paths}")
        
        # Check if root path itself is cloud-backed
        is_cloud, provider = cloud_manager.is_cloud_path(root_path)
        if is_cloud:
            warning = cloud_manager.get_cloud_warning_message(root_path, provider)
            print(f"\n{'='*80}")
            print(warning)
            print(f"{'='*80}\n")
            
            if skip_cloud_paths:
                print(f"⚠️ SKIPPING cloud path: {root_path} (provider: {provider})")
                print("To scan this path anyway, use: scan_media(root_path, skip_cloud_paths=False)")
                return {
                    "status": "skipped_cloud_path",
                    "message": "Root path is cloud-backed. Skipped to prevent RAM bloat.",
                    "provider": provider,
                    "added": 0,
                    "skipped_dirs": 0
                }
        
        for root, dirs, files in os.walk(root_path):
            # Filter out excluded directories (modifies in place to prevent walking into them)
            original_count = len(dirs)
            dirs[:] = [d for d in dirs if not should_exclude_dir(d, excluded_paths)]
            skipped_dirs += original_count - len(dirs)
            
            # Check if current directory is cloud-backed
            current_dir = Path(root)
            is_cloud_dir, cloud_provider = cloud_manager.is_cloud_path(current_dir)
            
            if is_cloud_dir and skip_cloud_paths:
                # Skip this entire directory tree
                cloud_warnings.add((str(current_dir), cloud_provider))
                dirs.clear()  # Don't descend into subdirectories
                continue
            
            for file in files:
                if file.startswith('.'): 
                    continue
                
                file_path = Path(root) / file
                if file_path.suffix.lower() in extensions:
                    try:
                        rel_path = str(file_path.relative_to(root_path))
                        
                        stmt = select(MediaFile).where(MediaFile.path == rel_path)
                        result = await db_session.execute(stmt)
                        existing = result.scalar_one_or_none()
                        
                        if not existing:
                            # Check if file is cloud-backed
                            file_is_cloud, file_provider = cloud_manager.is_cloud_path(file_path)
                            
                            if file_is_cloud:
                                cloud_files_count += 1
                                if skip_cloud_paths:
                                    continue  # Skip cloud files
                            
                            stat = file_path.stat()
                            new_media = MediaFile(
                                path=rel_path,
                                name=file,
                                size=stat.st_size,
                                cloud_backed=file_is_cloud,
                                cloud_provider=file_provider if file_is_cloud else None,
                            )
                            db_session.add(new_media)
                            count += 1
                            
                            # Commit in batches of 100 to avoid long transactions
                            if count % 100 == 0:
                                await db_session.commit()
                    except Exception as e:
                        print(f"Error processing {file_path}: {e}")
                        continue
        
        await db_session.commit()
    
    # Print cloud warnings summary
    if cloud_warnings:
        print(f"\n{'='*80}")
        print(f"⚠️ CLOUD STORAGE DETECTED - {len(cloud_warnings)} cloud paths skipped:")
        for path, provider in cloud_warnings:
            print(f"  - {path} ({provider})")
        print(f"\nSkipped {cloud_files_count} cloud files to prevent RAM bloat.")
        print(f"Consider migrating to Telegram Cloud Storage for better integration.")
        print(f"{'='*80}\n")
    
    print(f"Scan complete. Added {count} new files. Skipped {skipped_dirs} excluded directories.")
    return {
        "status": "success",
        "added": count,
        "skipped_dirs": skipped_dirs,
        "cloud_files_skipped": cloud_files_count,
        "cloud_paths_detected": len(cloud_warnings)
    }

