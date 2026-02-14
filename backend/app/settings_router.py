"""
Settings API Router
Provides CRUD endpoints for application configuration.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json

from .database import get_db
from .models import Setting

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingUpdate(BaseModel):
    value: Any


class SettingResponse(BaseModel):
    key: str
    value: Any

    class Config:
        from_attributes = True


# Default settings with their initial values
DEFAULT_SETTINGS = {
    "media_root": r"C:\Users\Original",
    "scan_paths": [r"C:\Users\Original"],
    "excluded_paths": ["$RECYCLE.BIN", "System Volume Information", ".git", "node_modules", "__pycache__", ".venv", "venv"],
    "theme": "dark",
    "ytdlp_cookies_browser": "chrome",
    "telegram_enabled": "false",
    "telegram_token": "",
    "telegram_chat_id": "",
    "mpv_path": r"C:\mpv\mpv.exe",
    "thumbnail_enabled": "true",
}


@router.get("")
async def get_all_settings(db=Depends(get_db)) -> Dict[str, Any]:
    """Get all settings as a dictionary."""
    result = await db.execute(select(Setting))
    settings = result.scalars().all()
    
    # Start with defaults, then override with DB values
    output = dict(DEFAULT_SETTINGS)
    for s in settings:
        try:
            # Try to parse JSON values
            output[s.key] = json.loads(s.value) if s.value else None
        except (json.JSONDecodeError, TypeError):
            output[s.key] = s.value
    
    return output


@router.get("/{key}")
async def get_setting(key: str, db=Depends(get_db)) -> SettingResponse:
    """Get a single setting by key."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    
    if not setting:
        # Return default if exists
        if key in DEFAULT_SETTINGS:
            return SettingResponse(key=key, value=DEFAULT_SETTINGS[key])
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    
    try:
        value = json.loads(setting.value) if setting.value else None
    except (json.JSONDecodeError, TypeError):
        value = setting.value
    
    return SettingResponse(key=key, value=value)


@router.put("/{key}")
async def update_setting(key: str, data: SettingUpdate, db=Depends(get_db)) -> SettingResponse:
    """Update or create a setting."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    
    # Serialize value to JSON if it's not a simple string
    if isinstance(data.value, (dict, list)):
        value_str = json.dumps(data.value)
    else:
        value_str = str(data.value) if data.value is not None else None
    
    if setting:
        setting.value = value_str
    else:
        setting = Setting(key=key, value=value_str)
        db.add(setting)
    
    await db.commit()
    await db.refresh(setting)
    
    return SettingResponse(key=key, value=data.value)


@router.delete("/{key}")
async def delete_setting(key: str, db=Depends(get_db)):
    """Delete a setting (resets to default)."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    
    await db.delete(setting)
    await db.commit()
    
    return {"status": "deleted", "key": key}


# --- Cloud Storage & System Helper Endpoints ---

@router.get("/cloud/paths")
async def get_cloud_paths():
    """List detected cloud paths and their providers."""
    from .cloud_storage_manager import cloud_manager, CloudProvider
    
    # Return detected paths from the manager's cache
    # This assumes scan_media has run at least once, or we can trigger a scan here
    return {
        "detected": [
            {"path": str(p), "provider": prov} 
            for p, prov in cloud_manager.detected_cloud_paths
        ],
        "providers_supported": [
            CloudProvider.ONEDRIVE,
            CloudProvider.GOOGLE_DRIVE,
            CloudProvider.DROPBOX,
            CloudProvider.RCLONE
        ]
    }

@router.post("/system/clear-cache")
async def clear_system_cache():
    """
    Clear Working Set of the application process to free RAM.
    This helps release memory held by file caching when accessing OneDrive files.
    """
    import os
    import ctypes
    
    try:
        # Clear working set of current process
        pid = os.getpid()
        # PROCESS_ALL_ACCESS = 0x001F0FFF
        handle = ctypes.windll.kernel32.OpenProcess(0x001F0FFF, False, pid)
        if handle:
            success = ctypes.windll.psapi.EmptyWorkingSet(handle)
            ctypes.windll.kernel32.CloseProcess(handle)
            return {
                "status": "success" if success else "failed", 
                "message": "Process working set cleared" if success else "Failed to clear working set"
            }
        return {"status": "error", "message": "Could not open process handle"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/system/stats")
async def get_stats():
    """Get system resource usage (CPU, RAM, Disk)."""
    from .monitoring import get_system_stats
    return get_system_stats()


@router.post("/system/cleanup-processes")
async def cleanup_processes():
    """
    Force kill all independent FFmpeg processes.
    Useful if streaming processes get stuck.
    """
    import psutil
    killed = []
    try:
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if proc.info['name'] and 'ffmpeg' in proc.info['name'].lower():
                    proc.kill()
                    killed.append(proc.info['pid'])
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
        return {"status": "success", "killed_count": len(killed), "killed_pids": killed}
    except ImportError:
        return {"status": "error", "message": "psutil not installed"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
