"""
Thumbnail generation module - Optimized for Surface Pro 8 (i5, 8GB RAM)

Key optimizations:
1. Non-blocking: Uses ThreadPoolExecutor (max 2 workers) to avoid blocking the async event loop.
2. Hardware Acceleration: Tries Intel QuickSync (h264_qsv) first for near-zero CPU usage,
   then falls back to CPU decoding if the codec is unsupported.
3. Low Priority: Spawns ffmpeg with BELOW_NORMAL priority so it never interferes with
   user activity or the web server itself.
4. Efficient caching: SHA1-based filename prevents re-generation.
"""

from fastapi.responses import FileResponse
from fastapi import HTTPException
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib
import subprocess
import sys
import asyncio
import datetime
import logging

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
THUMB_DIR = Path(__file__).parent.parent / "thumbnails"
THUMB_DIR.mkdir(exist_ok=True)

# Max 2 concurrent ffmpeg processes – sweet spot for i5 + 8GB RAM
# Keeps CPU headroom for the web server and OS.
_thumb_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="thumb")

# ---------------------------------------------------------------------------
# Logging (structured, replaces old debug log)
# ---------------------------------------------------------------------------
logger = logging.getLogger("thumbnails")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("[%(asctime)s] THUMB %(levelname)s: %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Platform-specific: low-priority subprocess creation flags (Windows)
# ---------------------------------------------------------------------------
_BELOW_NORMAL: int = 0
if sys.platform == "win32":
    import ctypes
    _BELOW_NORMAL = 0x00004000  # BELOW_NORMAL_PRIORITY_CLASS

def _create_low_priority_kwargs() -> dict:
    """Return subprocess kwargs that lower the child process priority on Windows."""
    if sys.platform == "win32":
        return {"creationflags": _BELOW_NORMAL}
    return {"nice": 10} if hasattr(subprocess, "nice") else {}


# ---------------------------------------------------------------------------
# Core: synchronous thumbnail generation (runs inside ThreadPoolExecutor)
# ---------------------------------------------------------------------------
def _generate_thumbnail_sync(orig: Path, thumb_path: Path) -> bool:
    """
    Generate a JPEG thumbnail for a video/audio file.

    Strategy (with safe fallback):
      1. Try Intel QuickSync hardware decoding  (-hwaccel qsv -c:v h264_qsv)
         → Near-zero CPU, uses Iris Xe GPU.
      2. If QSV fails (unsupported codec like VP9/AV1), retry with DXVA2
         → Still hardware-assisted on Windows, broader codec support.
      3. If DXVA2 also fails, fall back to pure CPU decoding.
         → Always works, slightly higher CPU usage.

    Each attempt tries frame at 5s first, then 0s for short clips.
    """

    # Common output flags
    output_flags = ["-vframes", "1", "-vf", "scale=320:-1", "-q:v", "6", str(thumb_path)]

    # Low-priority flags for subprocess
    prio_kwargs = _create_low_priority_kwargs()

    strategies = [
        # Strategy 1: Intel QuickSync (best for Surface Pro 8 Iris Xe)
        {
            "name": "QSV (Intel QuickSync)",
            "input_flags": ["-hwaccel", "qsv", "-c:v", "h264_qsv"],
        },
        # Strategy 2: DXVA2 (Windows DirectX VA - broader codec support)
        {
            "name": "DXVA2 (DirectX)",
            "input_flags": ["-hwaccel", "dxva2"],
        },
        # Strategy 3: CPU software decode (always works)
        {
            "name": "CPU (software)",
            "input_flags": [],
        },
    ]

    for strategy in strategies:
        for seek_time in ["5", "0"]:
            cmd = (
                ["ffmpeg", "-y", "-ss", seek_time]
                + strategy["input_flags"]
                + ["-i", str(orig)]
                + output_flags
            )

            try:
                result = subprocess.run(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=15,  # Hard timeout: 15s max per attempt
                    **prio_kwargs,
                )

                if result.returncode == 0 and thumb_path.exists():
                    logger.info(f"OK [{strategy['name']}@{seek_time}s] {orig.name}")
                    return True

                # If seek=5s failed, try seek=0s with same strategy
                logger.debug(
                    f"FAIL [{strategy['name']}@{seek_time}s] {orig.name}: "
                    f"{result.stderr[:200] if result.stderr else 'no output'}"
                )

            except subprocess.TimeoutExpired:
                logger.warning(f"TIMEOUT [{strategy['name']}@{seek_time}s] {orig.name}")
                # Clean up partial file
                if thumb_path.exists():
                    thumb_path.unlink(missing_ok=True)

            except FileNotFoundError:
                logger.error("ffmpeg not found in PATH. Thumbnail generation disabled.")
                return False

            except Exception as e:
                logger.error(f"EXCEPTION [{strategy['name']}] {orig.name}: {e}")

        # If both seek times failed for this strategy, try next strategy
        # Clean up any partial output before next attempt
        if thumb_path.exists():
            thumb_path.unlink(missing_ok=True)

    logger.warning(f"ALL STRATEGIES FAILED for {orig.name}")
    return False


def generate_thumbnail_sync(file_path: str, media_root: Path) -> bool:
    """
    Public wrapper for thumbnail generation (used by thumbnail queue).
    
    Args:
        file_path: Relative or absolute path to media file
        media_root: Root directory for media files
    
    Returns:
        True if thumbnail generated successfully
    """
    orig = Path(file_path)
    if not orig.is_absolute():
        orig = (media_root / file_path).resolve()
    
    if not orig.exists():
        logger.error(f"File not found: {orig}")
        return False
    
    # Generate cache filename
    import hashlib
    cache_name = hashlib.sha1(str(orig).encode()).hexdigest() + ".jpg"
    thumb_path = THUMB_DIR / cache_name
    
    # Skip if already exists
    if thumb_path.exists():
        logger.debug(f"Thumbnail already exists: {cache_name}")
        return True
    
    return _generate_thumbnail_sync(orig, thumb_path)


# ---------------------------------------------------------------------------
# Public API: async, non-blocking thumbnail response
# ---------------------------------------------------------------------------
async def get_thumbnail_response(path: str, media_root: Path):
    """
    Return a FileResponse with the thumbnail for the given media path.
    If no cached thumbnail exists, generate one in a background thread
    so the async event loop is never blocked.
    """
    try:
        # Normalize and validate path
        orig = (media_root / path).resolve()

        if media_root.resolve() not in orig.parents and orig != media_root.resolve():
            raise HTTPException(status_code=400, detail="Invalid path")

        if not orig.exists():
            raise HTTPException(status_code=404, detail="File not found")

        ext = orig.suffix.lower()

        # Images: serve the original file directly (no thumbnail needed)
        if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
            response = FileResponse(str(orig), filename=orig.name)
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Cache-Control"] = "public, max-age=86400"  # 24h
            return response

        # Video/Audio: check cache first, then generate
        # 1. Check legacy filename (backwards compatibility)
        legacy_name = path.replace("/", "_").replace("\\", "_") + ".jpg"
        legacy_thumb_path = THUMB_DIR / legacy_name
        if legacy_thumb_path.exists():
            response = FileResponse(str(legacy_thumb_path), filename=legacy_thumb_path.name)
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Cache-Control"] = "public, max-age=86400"
            response.headers["ETag"] = f'"{legacy_name}"'
            return response

        # 2. Check SHA1 hash filename (current standard)
        key = hashlib.sha1(str(orig).encode("utf-8")).hexdigest()
        thumb_path = THUMB_DIR / f"{key}.jpg"

        if thumb_path.exists():
            response = FileResponse(str(thumb_path), filename=thumb_path.name)
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Cache-Control"] = "public, max-age=86400"
            response.headers["ETag"] = f'"{key}"'
            return response

        # 3. Generate in background thread (NON-BLOCKING!)
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(
            _thumb_executor,
            _generate_thumbnail_sync,
            orig,
            thumb_path,
        )

        if success and thumb_path.exists():
            response = FileResponse(str(thumb_path), filename=thumb_path.name)
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Cache-Control"] = "public, max-age=86400"
            response.headers["ETag"] = f'"{key}"'
            return response

        # All attempts failed
        raise HTTPException(status_code=404, detail="Thumbnail could not be generated")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error for '{path}': {e}")
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")
