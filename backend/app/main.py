from fastapi import FastAPI, Depends, HTTPException, Body, Query, BackgroundTasks, Request, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func, and_
from sqlalchemy.orm import joinedload, selectinload
import subprocess
import os
import json
import asyncio
import shutil
from pathlib import Path
from typing import List, Optional

from .database import engine, Base, get_db, AsyncSessionLocal
from .models import MediaFile, Tag, Playlist, PlaylistItem, Favorite, PlayHistory, Setting
from .settings_router import router as settings_router
from .routers.playlist_router import router as playlist_router
from .cache import init_cache, cache as app_cache
from .monitoring import request_timing_middleware, get_system_stats
from .auth import auth_router, require_auth

# Rate limiting
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    _HAS_SLOWAPI = True
except ImportError:
    _HAS_SLOWAPI = False

app = FastAPI(title="Media Drive API")

# --- Rate Limiter Setup ---
if _HAS_SLOWAPI:
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
else:
    limiter = None

# --- Monitoring Middleware ---
app.middleware("http")(request_timing_middleware)

# Include Routers
app.include_router(settings_router)
app.include_router(playlist_router)
app.include_router(auth_router)
from .routers.telegram_router import router as telegram_router
app.include_router(telegram_router)
from .routers.ytdlp_router import router as ytdlp_router
app.include_router(ytdlp_router)

# CORS - allow local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MEDIA_ROOT: restrict to actual media directories only
# Override via DRAM_MEDIA_ROOT environment variable if needed
import os as _os
MEDIA_ROOT = Path(_os.environ.get("DRAM_MEDIA_ROOT", r"C:\Users\Original"))

# Startup: create tables + init cache
@app.on_event("startup")
async def on_startup():
    print("--- SERVER RESTARTING/STARTING ---")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Initialize cache (Redis → In-Memory fallback)
    await init_cache()
    print("--- CACHE INITIALIZED ---")
    # Start thumbnail queue workers
    from .thumbnail_queue import thumbnail_queue
    await thumbnail_queue.start()
    print("--- THUMBNAIL QUEUE STARTED ---")
    # Start Telegram Service
    from .services.telegram_service import telegram_service
    await telegram_service.start()
    print("--- TELEGRAM SERVICE STARTED ---")

@app.on_event("shutdown")
async def on_shutdown():
    from .services.telegram_service import telegram_service
    await telegram_service.stop()
    print("--- TELEGRAM SERVICE STOPPED ---")

# Helper: convert MediaFile SQLAlchemy object to dict for JSON
def mediafile_to_dict(mf: MediaFile) -> dict:
    def _iso(dt):
        return dt.isoformat() if dt is not None else None
    return {
        "id": mf.id,
        "path": mf.path,
        "name": mf.name,
        "size": mf.size,
        "duration": getattr(mf, "duration", None),
        "width": getattr(mf, "width", None),
        "height": getattr(mf, "height", None),
        "mime_type": getattr(mf, "mime_type", None),
        "thumbnail": getattr(mf, "thumbnail", None),
        "rating": getattr(mf, "rating", 0),
        "is_duplicate": bool(getattr(mf, "is_duplicate", False)),
        "created_at": _iso(getattr(mf, "created_at", None)),
        "updated_at": _iso(getattr(mf, "updated_at", None)),
        "tags": [{"id": t.id, "name": t.name} for t in getattr(mf, "tags", [])],
    }

# Files listing endpoint (simple, returns dicts)
@app.get("/files")
async def list_files(
    request: Request,
    offset: int = 0,
    limit: int = 100,
    sort_by: str = "name",
    order: str = "asc",
    q: Optional[str] = None,
    tag: Optional[str] = None,
    # Advanced filters
    media_type: Optional[str] = None,  # video, audio, image, all
    min_size: Optional[int] = None,
    max_size: Optional[int] = None,
    min_duration: Optional[float] = None,
    max_duration: Optional[float] = None,
    has_thumbnail: Optional[bool] = None,
    exclude_images: Optional[bool] = None,
    exclude_videos: Optional[bool] = None,
    # New filters for Source Browsing
    cloud_provider: Optional[str] = None, # "local", "onedrive", "telegram", etc.
    path: Optional[str] = None, # Filter by specific folder path (recursive or flat)
    exact_path: Optional[bool] = False, # If True, only files IN this folder (not recursive)
    db = Depends(get_db),
):
    # --- Cache: build key from all params ---
    from .cache import cache
    cache_key = f"files:{offset}:{limit}:{sort_by}:{order}:{q}:{tag}:{media_type}:{min_size}:{max_size}:{min_duration}:{max_duration}:{has_thumbnail}:{exclude_images}:{exclude_videos}:{cloud_provider}:{path}:{exact_path}"
    if cache:
        cached = await cache.get(cache_key)
        if cached:
            return cached

    stmt = select(MediaFile)
    count_stmt = select(func.count(MediaFile.id)).select_from(MediaFile)
    conditions = []
    
    # Text search
    if q:
        like = f"%{q}%"
        conditions.append(MediaFile.name.ilike(like))
    
    # Tag filter
    if tag:
        stmt = stmt.join(MediaFile.tags).where(Tag.name == tag)
        count_stmt = count_stmt.join(MediaFile.tags).where(Tag.name == tag)
    
    # Source/Cloud Provider Filter
    if cloud_provider:
        if cloud_provider == "local":
            conditions.append(MediaFile.cloud_backed == False)
        elif cloud_provider == "cloud_all":
             conditions.append(MediaFile.cloud_backed == True)
        else:
            conditions.append(MediaFile.cloud_provider == cloud_provider)
            
    # Path Filter (Browsing)
    if path:
        # Normalize path separators
        norm_path = path.replace("/", "\\")
        if exact_path:
            # Files directly in this folder (parent path matches exactly)
            # Use some string manipulation or specialized logic if path is stored relative
            pass # Creating exact folder logic via simple LIKE is hard without parent_id
            # For now, approximate with LIKE 'path\%' and exclusion of further subdirs
            # Implementation for exact path in flat string DB is complex, skipping strict 'exact' for now
            # and just using prefix match
            conditions.append(MediaFile.path.startswith(norm_path))
        else:
            conditions.append(MediaFile.path.startswith(norm_path))

    # Media type filter (based on file extension in name)
    if media_type and media_type != "all":
        if media_type == "video":
            video_exts = (".mp4", ".mkv", ".avi", ".mov", ".webm", ".wmv", ".flv")
            conditions.append(func.lower(MediaFile.name).like(f"%{video_exts[0]}") | 
                            func.lower(MediaFile.name).like(f"%{video_exts[1]}") |
                            func.lower(MediaFile.name).like(f"%{video_exts[2]}") |
                            func.lower(MediaFile.name).like(f"%{video_exts[3]}") |
                            func.lower(MediaFile.name).like(f"%{video_exts[4]}") |
                            func.lower(MediaFile.name).like(f"%{video_exts[5]}") |
                            func.lower(MediaFile.name).like(f"%{video_exts[6]}"))
        elif media_type == "audio":
            conditions.append(func.lower(MediaFile.name).like("%.mp3") | 
                            func.lower(MediaFile.name).like("%.flac") |
                            func.lower(MediaFile.name).like("%.wav") |
                            func.lower(MediaFile.name).like("%.aac") |
                            func.lower(MediaFile.name).like("%.ogg"))
        elif media_type == "image":
            conditions.append(func.lower(MediaFile.name).like("%.jpg") | 
                            func.lower(MediaFile.name).like("%.jpeg") |
                            func.lower(MediaFile.name).like("%.png") |
                            func.lower(MediaFile.name).like("%.gif") |
                            func.lower(MediaFile.name).like("%.webp"))
    
    # Size filters
    if min_size is not None:
        conditions.append(MediaFile.size >= min_size)
    if max_size is not None:
        conditions.append(MediaFile.size <= max_size)
    
    # Duration filters
    if min_duration is not None:
        conditions.append(MediaFile.duration >= min_duration)
    if max_duration is not None:
        conditions.append(MediaFile.duration <= max_duration)
    
    # Thumbnail filter
    if has_thumbnail is not None:
        if has_thumbnail:
            conditions.append(MediaFile.thumbnail.isnot(None))
        else:
            conditions.append(MediaFile.thumbnail.is_(None))
    
    # Exclude filters
    if exclude_images:
        # Exclude common image extensions
        image_exts = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg")
        image_conditions = [~func.lower(MediaFile.name).like(f"%{ext}") for ext in image_exts]
        conditions.append(and_(*image_conditions))
    
    if exclude_videos:
        # Exclude common video extensions
        video_exts = (".mp4", ".mkv", ".avi", ".mov", ".webm", ".wmv", ".flv", ".m4v", ".ts")
        video_conditions = [~func.lower(MediaFile.name).like(f"%{ext}") for ext in video_exts]
        conditions.append(and_(*video_conditions))
    
    # Apply all conditions
    if conditions:
        stmt = stmt.where(and_(*conditions))
        count_stmt = count_stmt.where(and_(*conditions))

    # Sorting
    if sort_by == "size":
        order_col = MediaFile.size
    elif sort_by == "created_at":
        order_col = MediaFile.created_at
    elif sort_by == "rating":
        order_col = MediaFile.rating
    elif sort_by == "duration":
        order_col = MediaFile.duration
    else:
        order_col = MediaFile.name
    order_col = order_col.desc() if order == "desc" else order_col.asc()
    stmt = stmt.order_by(order_col).offset(offset).limit(limit)

    res_total = await db.execute(count_stmt)
    total = res_total.scalar_one()

    res = await db.execute(stmt.options(selectinload(MediaFile.tags)))
    items = res.scalars().all()
    items_dicts = [mediafile_to_dict(m) for m in items]
    result = {"items": items_dicts, "total": total}

    # --- Cache: store result (60s TTL) ---
    if cache:
        await cache.set(cache_key, result, ttl=60)

    return result

@app.get("/browse")
async def browse_folder(
    path: Optional[str] = None,
    cloud_provider: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db = Depends(get_db)
):
    """
    Browse folders and files like a file system.
    If path is None, returns root folders/files.
    Optimized: uses SQL-level extraction instead of loading all files into RAM.
    """
    # Normalize path
    target_path = path.replace("/", "\\") if path else ""
    if target_path == ".": target_path = ""

    # Build shared conditions for cloud provider filtering
    base_conditions = []
    if cloud_provider:
        if cloud_provider == "local":
            base_conditions.append(MediaFile.cloud_backed == False)
        elif cloud_provider != "all":
            base_conditions.append(MediaFile.cloud_provider == cloud_provider)

    # --- QUERY 1: Get DISTINCT subfolders (SQL-level, no full file load) ---
    # Strategy: find all paths starting with target_path that have at least one
    # more backslash after the prefix, then extract the next path component.
    folder_conditions = list(base_conditions)
    if target_path:
        # Files under target_path with at least one more subfolder level
        # e.g. target="Movies", match "Movies\Action\..." (has \ after "Movies\")
        folder_conditions.append(MediaFile.path.like(f"{target_path}\\\\%\\\\%"))
    else:
        # Root level: any path with at least one backslash (i.e. in a subfolder)
        folder_conditions.append(MediaFile.path.like("%\\\\%"))

    # Use raw SQL for efficient DISTINCT subfolder extraction
    # We extract the component right after target_path prefix
    if target_path:
        prefix_len = len(target_path) + 1  # +1 for the trailing backslash
        # SUBSTR(path, prefix_len+1) gives everything after "target_path\"
        # Then we find the first \ in that remainder to isolate the subfolder name
        subfolder_expr = func.substr(
            MediaFile.path,
            prefix_len + 1,
            func.instr(func.substr(MediaFile.path, prefix_len + 1), "\\") - 1
        )
    else:
        # Root: extract first component before first backslash
        subfolder_expr = func.substr(
            MediaFile.path,
            1,
            func.instr(MediaFile.path, "\\") - 1
        )

    folder_stmt = (
        select(subfolder_expr.label("subfolder"))
        .select_from(MediaFile)
        .where(and_(*folder_conditions))
        .where(subfolder_expr != "")  # Filter out empty results
        .distinct()
        .order_by(subfolder_expr)
    )
    folder_res = await db.execute(folder_stmt)
    sorted_folders = [row[0] for row in folder_res.all() if row[0]]

    # --- QUERY 2: Get files DIRECTLY in this folder (not in subfolders) ---
    file_conditions = list(base_conditions)
    if target_path:
        # Files that start with target_path\ but do NOT have another \ after that
        # i.e. "Movies\film.mp4" matches, "Movies\Action\film.mp4" does not
        file_conditions.append(MediaFile.path.like(f"{target_path}\\\\%"))
        file_conditions.append(~MediaFile.path.like(f"{target_path}\\\\%\\\\%"))
    else:
        # Root level: files with NO backslash in path (directly at root)
        file_conditions.append(~MediaFile.path.like("%\\\\%"))

    # Count total files in this folder (for pagination)
    count_stmt = (
        select(func.count(MediaFile.id))
        .select_from(MediaFile)
        .where(and_(*file_conditions))
    )
    count_res = await db.execute(count_stmt)
    total_files = count_res.scalar_one()

    # Fetch paginated files
    file_stmt = (
        select(MediaFile)
        .where(and_(*file_conditions))
        .order_by(MediaFile.name)
        .offset(offset)
        .limit(limit)
    )
    file_res = await db.execute(file_stmt)
    files = [mediafile_to_dict(mf) for mf in file_res.scalars().all()]

    return {
        "current_path": target_path,
        "folders": sorted_folders,
        "files": files,
        "total_files": total_files,
        "breadcrumbs": target_path.split("\\") if target_path else []
    }

# Play endpoint: single media_id (query) or list via JSON body
@app.post("/play")
async def play(
    media_id: Optional[int] = None,
    resume: bool = True,
    mpv: bool = True,
    media_ids: Optional[List[int]] = Body(None),
    db = Depends(get_db),
    user = Depends(require_auth),
):
    ids = []
    if media_ids:
        ids = media_ids
    elif media_id is not None:
        ids = [media_id]
    else:
        raise HTTPException(status_code=400, detail="media_id or media_ids required")

    # fetch media paths
    res = await db.execute(select(MediaFile).where(MediaFile.id.in_(ids)))
    media_list = res.scalars().all()
    if not media_list:
        raise HTTPException(status_code=404, detail="media not found")
    paths = [mf.path for mf in media_list]

    # record play history
    for mid in ids:
        ph = PlayHistory(media_id=mid, position=0.0, finished=False)
        db.add(ph)
    await db.commit()

    if mpv:
        mpv_exe = r"C:\mpv\mpv.exe"
        ipc_pipe = r"\\.\pipe\mpv-remote"
        if not Path(mpv_exe).exists():
            return {"error": f"mpv not found at {mpv_exe}"}

        resolved = []
        for p in paths:
            pth = Path(p)
            candidate = (MEDIA_ROOT / p).resolve() if not pth.is_absolute() else pth
            resolved.append(str(candidate))

        try:
            # Start MPV with IPC server
            # --keep-open=playlist: auto-advance through playlist, keep open on last item
            cmd = [mpv_exe, "--no-terminal", "--force-window=yes", "--keep-open=playlist", f"--input-ipc-server={ipc_pipe}"] + resolved
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False)
            return {"status": "playing", "via": "mpv", "count": len(resolved), "ipc": ipc_pipe}
        except Exception as e:
            return {"error": str(e)}
    else:
        # return paths for web playback (frontend can call /stream)
        return {"status": "queued", "paths": paths}

# Playlists endpoints
@app.post("/playlists")
async def create_playlist(body: dict = Body(...), db = Depends(get_db)):
    name = body.get("name") or f"Playlist {int(func.now().execute if False else 0)}"
    description = body.get("description")
    items = body.get("items", [])
    pl = Playlist(name=name, description=description)
    db.add(pl)
    await db.flush()
    for i, mid in enumerate(items, start=1):
        pi = PlaylistItem(playlist_id=pl.id, media_id=mid, order_index=i)
        db.add(pi)
    await db.commit()
    return {"id": pl.id, "name": pl.name, "count": len(items)}

@app.get("/playlists")
async def list_playlists(db = Depends(get_db)):
    res = await db.execute(select(Playlist))
    pls = res.scalars().all()
    out = []
    for p in pls:
        out.append({"id": p.id, "name": p.name, "description": p.description, "count": len(p.items)})
    return out

# Favorites endpoints
@app.post("/favorites/{media_id}")
async def add_favorite(media_id: int, db = Depends(get_db)):
    res = await db.execute(select(Favorite).where(Favorite.media_id == media_id))
    if res.scalar_one_or_none():
        return {"status": "exists"}
    fav = Favorite(media_id=media_id)
    db.add(fav)
    await db.commit()
    return {"status": "ok"}

@app.delete("/favorites/{media_id}")
async def remove_favorite(media_id: int, db = Depends(get_db)):
    res = await db.execute(select(Favorite).where(Favorite.media_id == media_id))
    f = res.scalar_one_or_none()
    if not f:
        return {"status": "not found"}
    await db.delete(f)
    await db.commit()
    return {"status": "deleted"}

@app.get("/favorites")
async def list_favorites(db = Depends(get_db)):
    res = await db.execute(select(Favorite))
    favs = res.scalars().all()
    media_ids = [f.media_id for f in favs]
    if not media_ids:
        return []
    res2 = await db.execute(select(MediaFile).where(MediaFile.id.in_(media_ids)))
    items = res2.scalars().all()
    return [mediafile_to_dict(m) for m in items]

# Progress tracking endpoints
@app.post("/progress/{media_id}")
async def save_progress(request: Request, media_id: int, body: dict = Body(...), db = Depends(get_db)):
    """Save playback position for a media file."""
    position = body.get("position", 0.0)
    finished = body.get("finished", False)

    # Find or create play history entry
    res = await db.execute(
        select(PlayHistory)
        .where(PlayHistory.media_id == media_id)
        .order_by(PlayHistory.played_at.desc())
        .limit(1)
    )
    history = res.scalar_one_or_none()

    if history:
        # Update existing
        history.position = position
        history.finished = finished
        history.played_at = func.now()
    else:
        # Create new
        history = PlayHistory(media_id=media_id, position=position, finished=finished)
        db.add(history)

    await db.commit()
    return {"status": "ok", "position": position}

@app.get("/progress/{media_id}")
async def get_progress(media_id: int, db = Depends(get_db)):
    """Get last playback position for a media file."""
    res = await db.execute(
        select(PlayHistory)
        .where(PlayHistory.media_id == media_id)
        .order_by(PlayHistory.played_at.desc())
        .limit(1)
    )
    history = res.scalar_one_or_none()

    if not history:
        return {"position": 0.0, "finished": False}

    return {
        "position": history.position,
        "finished": history.finished,
        "played_at": history.played_at.isoformat() if history.played_at else None
    }

# Stream endpoint (simple FileResponse)
def safe_media_path(rel_path: str) -> Optional[Path]:
    try:
        p = (MEDIA_ROOT / rel_path).resolve()
        root = MEDIA_ROOT.resolve()
        if root in p.parents or p == root:
            return p
    except Exception:
        return None
    return None

@app.get("/stream")
async def stream(request: Request, path: str = Query(...)):
    """Stream media file with HTTP Range support for seeking and resume."""
    sp = safe_media_path(path)
    if not sp or not sp.exists():
        raise HTTPException(status_code=404, detail="file not found")

    file_size = sp.stat().st_size
    range_header = request.headers.get("range")

    # Determine content type
    import mimetypes
    content_type, _ = mimetypes.guess_type(str(sp))
    if not content_type:
        content_type = "application/octet-stream"

    # No range request - return full file
    if not range_header:
        def file_iterator():
            with open(sp, "rb") as f:
                while chunk := f.read(1024 * 1024):  # 1MB chunks
                    yield chunk

        return StreamingResponse(
            file_iterator(),
            media_type=content_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Content-Disposition": f'inline; filename="{sp.name}"',
                "Access-Control-Allow-Origin": "*",
            }
        )

    # Parse range header (format: "bytes=start-end")
    try:
        range_match = range_header.replace("bytes=", "").split("-")
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] else file_size - 1

        # Validate range
        if start >= file_size or end >= file_size or start > end:
            raise HTTPException(
                status_code=416,
                detail="Requested range not satisfiable",
                headers={"Content-Range": f"bytes */{file_size}"}
            )

        content_length = end - start + 1

        def range_iterator():
            with open(sp, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(1024 * 1024, remaining)  # 1MB chunks
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            range_iterator(),
            status_code=206,  # Partial Content
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Content-Disposition": f'inline; filename="{sp.name}"',
                "Access-Control-Allow-Origin": "*",
            }
        )

    except (ValueError, IndexError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid range header: {e}")

# Video streaming with transcoding for browser-incompatible codecs
@app.get("/stream/transcode")
async def stream_transcode(
    path: str = Query(...),
    rotate: Optional[bool] = True,
    start_time: Optional[float] = None,
):
    """
    Transcode video to H.264/AAC for browser compatibility.
    Use when the browser can't play the original codec (e.g. HEVC, AV1).
    Supports automatic rotation correction via FFmpeg.
    """
    from .video_processor import get_transcode_command, get_cached_rotation

    # Resolve path safely
    sp = safe_media_path(path)
    if not sp or not sp.exists() or not sp.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Detect rotation if enabled
    rotation = 0
    if rotate:
        rotation = await get_cached_rotation(sp)

    # Build transcode command (H.264 + AAC, fragmented MP4)
    cmd = await get_transcode_command(sp, rotation=rotation, start_time=start_time)

    from .video_processor import VideoStreamContext
    ctx = VideoStreamContext(cmd)

    async def transcode_stream():
        import gc
        try:
            async with ctx as proc:
                while True:
                    chunk = await proc.stdout.read(65536)  # 64KB chunks
                    if not chunk:
                        break
                    yield chunk
        except Exception as e:
            logger.error(f"Transcode streaming error: {e}")
        finally:
            gc.collect()

    return StreamingResponse(
        transcode_stream(),
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "none",  # Transcoded stream doesn't support ranges
            "Access-Control-Allow-Origin": "*",
            "X-Video-Rotation": str(rotation),
            "X-Transcoded": "true",
        }
    )

# Thumbnail proxy (calls thumbnails module)
@app.get("/thumbnail")
async def thumbnail(path: str = Query(...)):
    # thumbnails.py will handle generation/caching; import lazily to avoid circular import
    from . import thumbnails
    return await thumbnails.get_thumbnail_response(path, MEDIA_ROOT)

# Thumbnail progress tracking (SSE)
@app.get("/thumbnail/progress/{job_id}")
async def thumbnail_progress(job_id: str):
    """Stream thumbnail generation progress via Server-Sent Events."""
    from .thumbnail_queue import thumbnail_queue
    from fastapi.responses import StreamingResponse
    import asyncio

    async def event_generator():
        while True:
            job = thumbnail_queue.get_job(job_id)

            if not job:
                yield f'data: {{"error": "Job not found"}}\n\n'
                break

            # Send progress update
            yield f"data: {json.dumps(job.to_dict())}\n\n"

            # Stop if job is complete or errored
            if job.status in ["done", "error"]:
                break

            await asyncio.sleep(0.5)  # Update every 500ms

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

# Batch thumbnail generation
@app.post("/thumbnail/batch")
async def batch_generate_thumbnails(
    background_tasks: BackgroundTasks,
    limit: int = 1000,
    db = Depends(get_db)
):
    """Generate thumbnails for all media files without thumbnails."""
    from .thumbnail_queue import thumbnail_queue

    # Find files without thumbnails
    result = await db.execute(
        select(MediaFile)
        .where(MediaFile.thumbnail.is_(None))
        .limit(limit)
    )
    files = result.scalars().all()

    if not files:
        return {"status": "no_files", "message": "All files already have thumbnails"}

    # Add to queue
    job_ids = await thumbnail_queue.add_batch([f.path for f in files])

    return {
        "status": "batch_started",
        "message": f"Generating thumbnails for {len(files)} files",
        "job_ids": job_ids,
        "count": len(files)
    }

# Queue statistics
@app.get("/thumbnail/queue/stats")
async def thumbnail_queue_stats():
    """Get current thumbnail queue statistics."""
    from .thumbnail_queue import thumbnail_queue
    return thumbnail_queue.get_queue_stats()

@app.post("/scan")
async def scan(request: Request, background_tasks: BackgroundTasks, include_cloud: bool = True):
    from .scanner import scan_media
    # Run scan in background - scanner manages its own db session
    async def scan_and_invalidate_cache():
        await scan_media(MEDIA_ROOT, skip_cloud_paths=not include_cloud)
        # Invalidate file listing cache after scan completes
        from .cache import cache
        if cache:
            await cache.clear_prefix("files:")
            print("--- CACHE INVALIDATED AFTER SCAN ---")
    background_tasks.add_task(scan_and_invalidate_cache)
    return {"status": "scan_started", "message": f"Library scan is running in the background (include_cloud={include_cloud})."}

# --- REMOTE CONTROL (MPV IPC) ---
from .mpv_control import send_mpv_command

@app.post("/control/pause")
async def control_pause():
    success = await send_mpv_command(["cycle", "pause"])
    return {"status": "ok" if success else "error"}

@app.post("/control/next")
async def control_next():
    success = await send_mpv_command(["playlist-next"])
    return {"status": "ok" if success else "error"}

@app.post("/control/prev")
async def control_prev():
    success = await send_mpv_command(["playlist-prev"])
    return {"status": "ok" if success else "error"}

@app.post("/control/seek")
async def control_seek(seconds: int = Body(..., embed=True)):
    # relative seek
    success = await send_mpv_command(["seek", seconds, "relative"])
    return {"status": "ok" if success else "error"}

@app.post("/control/volume")
async def control_volume(level: int = Body(..., embed=True)):
    # level 0-100
    success = await send_mpv_command(["set_property", "volume", level])
    return {"status": "ok" if success else "error"}

@app.post("/cast")
async def cast_media(
    file: UploadFile = File(...),
    mode: str = Query("play", regex="^(play|queue)$")
):
    """
    Upload a file and play (or queue) it on MPV.
    mode: 'play' (replace playlist) or 'queue' (append to playlist)
    """
    # Create temp directory if not exists
    temp_dir = MEDIA_ROOT / "temp_cast"
    temp_dir.mkdir(exist_ok=True)

    # Save file
    file_path = temp_dir / file.filename
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        await file.close()

    mpv_exe = r"C:\mpv\mpv.exe"
    ipc_pipe = r"\\.\pipe\mpv-remote"
    abs_path = str(file_path.resolve())

    # Command based on mode
    if mode == "queue":
        cmd_args = ["loadfile", abs_path, "append-play"]
    else:
        cmd_args = ["loadfile", abs_path, "replace"]

    # Try sending command first
    success = await send_mpv_command(cmd_args)

    if not success:
        if not Path(mpv_exe).exists():
            return JSONResponse(status_code=500, content={"error": "MPV executable not found"})

        # MPV not running, start it
        # If mode is queue but MPV wasn't running, it effectively plays it
        run_cmd = [mpv_exe, "--no-terminal", "--force-window=yes", "--keep-open=playlist", f"--input-ipc-server={ipc_pipe}", abs_path]
        subprocess.Popen(run_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False)

    return {"status": "casted", "file": file.filename, "mode": mode}


@app.post("/cast/url")
async def cast_url(
    url: str = Body(..., embed=True),
    mode: str = Body("play", regex="^(play|queue)$"),
    user = Depends(require_auth),
):
    """
    Cast a direct URL (HTTP, RTSP, Magnet, etc.) to MPV.
    """
    mpv_exe = r"C:\mpv\mpv.exe"
    ipc_pipe = r"\\.\pipe\mpv-remote"
    
    if mode == "queue":
        cmd_args = ["loadfile", url, "append-play"]
    else:
        cmd_args = ["loadfile", url, "replace"]
        
    success = await send_mpv_command(cmd_args)
    
    if not success:
        if not Path(mpv_exe).exists():
            return JSONResponse(status_code=500, content={"error": "MPV executable not found"})
            
        run_cmd = [mpv_exe, "--no-terminal", "--force-window=yes", "--keep-open=playlist", f"--input-ipc-server={ipc_pipe}", url]
        subprocess.Popen(run_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False)
        
    return {"status": "casted_url", "url": url, "mode": mode}

# --- WEBSOCKET FOR CROSS-CLIENT CONTROL ---

@app.websocket("/ws/mpv")
async def mpv_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time MPV control across multiple clients.
    Allows phone, tablet, desktop to control the same MPV instance.
    """
    from .mpv_hub import mpv_hub
    
    await mpv_hub.connect(websocket)
    
    try:
        while True:
            # Receive command from client
            data = await websocket.receive_json()
            
            # Handle command and broadcast to other clients
            await mpv_hub.handle_command(data, websocket)
            
    except WebSocketDisconnect:
        mpv_hub.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        mpv_hub.disconnect(websocket)


# --- CACHE & MONITORING ENDPOINTS ---

@app.get("/cache/stats")
async def cache_stats():
    """View cache backend info and stats."""
    from .cache import cache
    if cache:
        return cache.stats()
    return {"backend": "none", "message": "Cache not initialized"}


@app.get("/system/stats")
async def system_stats():
    """Get current CPU, RAM, and disk usage."""
    return get_system_stats()

