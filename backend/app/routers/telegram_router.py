from fastapi import APIRouter, HTTPException, WebSocket, Depends, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import asyncio
import logging

from ..database import get_db
from ..models import MediaFile, TelegramFile, TelegramFileChunk
from ..services.telegram_service import telegram_service

logger = logging.getLogger("telegram_router")
router = APIRouter(prefix="/telegram", tags=["telegram"])

# === Request/Response Models ===
# ... (Keep existing models like PhoneConnectRequest if checking works) ...
class PhoneConnectRequest(BaseModel):
    phone: str

class CodeVerifyRequest(BaseModel):
    phone: str
    code: str
    phone_code_hash: str

class TwoFactorRequest(BaseModel):
    password: str

class DownloadRequest(BaseModel):
    chat_id: int
    message_ids: list[int]

class UploadRequest(BaseModel):
    media_ids: list[int]
    chat_id: str  # Telegram Chat ID (e.g. Saved Messages "me" or group ID)

# ... (Keep existing Response models) ...

# === Endpoints ===

@router.get("/status")
async def get_status():
    """Get current Telegram connection status"""
    me = None
    if telegram_service.app and telegram_service.is_ready:
        try:
            me = await telegram_service.app.get_me()
        except:
            pass
            
    return {
        "connected": telegram_service.is_ready,
        "authenticated": telegram_service.is_ready, # Simplified
        "username": me.username if me else None,
        "first_name": me.first_name if me else None,
    }

@router.post("/auth/request-code")
async def request_code(req: PhoneConnectRequest):
    """Step 1: Request login code"""
    try:
        phone_code_hash = await telegram_service.send_code(req.phone)
        return {"status": "sent", "phone_code_hash": phone_code_hash}
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(400, str(e))

@router.post("/auth/verify-code")
async def verify_code(req: CodeVerifyRequest):
    """Step 2: Verify login code"""
    try:
        user = await telegram_service.sign_in(req.phone, req.code, req.phone_code_hash)
        return {"status": "authenticated", "user": {"id": user.id, "username": user.username}}
    except Exception as e:
        # Check if 2FA needed (SessionPasswordNeeded)
        if "SESSION_PASSWORD_NEEDED" in str(e) or "password" in str(e).lower():
             raise HTTPException(401, "2FA Password Required")
        raise HTTPException(400, str(e))

@router.post("/auth/2fa")
async def verify_2fa(req: TwoFactorRequest):
    """Step 3: 2FA Password (if needed)"""
    try:
        user = await telegram_service.sign_in_password(req.password)
        return {"status": "authenticated", "user": {"id": user.id, "username": user.username}}
    except Exception as e:
        raise HTTPException(400, str(e))

@router.post("/auth/logout")
async def logout():
    """Logout"""
    await telegram_service.logout()
    return {"status": "logged_out"}

@router.post("/upload")
async def upload_media(req: UploadRequest, background_tasks: BackgroundTasks, db=Depends(get_db)):
    """
    Queue media files for upload to Telegram.
    This runs in background to avoid blocking.
    """
    if not telegram_service.is_ready:
         raise HTTPException(503, "Telegram client not connected")

    # Fetch media files
    result = await db.execute(select(MediaFile).where(MediaFile.id.in_(req.media_ids)))
    media_files = result.scalars().all()
    
    if not media_files:
        raise HTTPException(404, "No valid media files found")

    # Define background upload task
    async def process_uploads(media_list, chat_id):
        # Apply strict concurrency sempahore if needed, but for now serial
        from ..database import AsyncSessionLocal
        
        async with AsyncSessionLocal() as session:
            for media in media_list:
                try:
                    logger.info(f"Starting upload for {media.name} (ID: {media.id})")
                    
                    # Check if already uploaded
                    # (In a real scenario, we should re-check DB here)
                    
                    # Perform upload
                    meta = await telegram_service.upload_large_file(
                        media.path, 
                        chat_id, 
                        progress_callback=lambda c, t: logger.debug(f"Upload progress: {c}/{t}")
                    )
                    
                    # Update Database
                    # Create TelegramFile
                    tg_file = TelegramFile(
                        media_id=media.id,
                        chat_id=meta["chat_id"],
                        is_split=meta["is_split"],
                        message_id=meta.get("message_id"),
                        file_id=meta.get("file_id")
                    )
                    session.add(tg_file)
                    await session.flush() # Get ID
                    
                    # Create Chunks if split
                    if meta["is_split"]:
                        for chunk in meta["chunks"]:
                            c = TelegramFileChunk(
                                telegram_file_id=tg_file.id,
                                chunk_index=chunk["chunk_index"],
                                message_id=chunk["message_id"],
                                file_id=chunk["file_id"],
                                size=chunk["size"]
                            )
                            session.add(c)
                    
                    # Update MediaFile
                    # We need to fetch it attached to this session
                    m = await session.get(MediaFile, media.id)
                    if m:
                        m.cloud_backed = True
                        m.cloud_provider = "telegram"
                    
                    await session.commit()
                    logger.info(f"Successfully uploaded and linked {media.name}")
                    
                except Exception as e:
                    logger.error(f"Failed to upload media {media.id}: {e}")
                    # Continue to next file

    # Start background task
    background_tasks.add_task(process_uploads, media_files, req.chat_id)
    
    return {"status": "queued", "count": len(media_files), "message": "Upload started in background"}


@router.get("/stream/{media_id}")
async def stream_telegram_media(
    media_id: int, 
    request: Request, # Need Request to access headers
    db=Depends(get_db)
):
    """Stream media directly from Telegram with Range support"""
    from fastapi import Request
    
    if not telegram_service.is_ready:
         raise HTTPException(503, "Telegram client not connected")

    # Fetch TelegramFile info with chunks and original media info
    stmt = (
        select(TelegramFile)
        .where(TelegramFile.media_id == media_id)
        .options(
            selectinload(TelegramFile.chunks),
            selectinload(TelegramFile.media)
        )
    )
    result = await db.execute(stmt)
    tg_file = result.scalar_one_or_none()
    
    if not tg_file:
        raise HTTPException(404, "Media not found on Telegram cloud")

    # Determine file size
    if tg_file.media and tg_file.media.size:
        file_size = tg_file.media.size
    elif tg_file.is_split:
        file_size = sum(c.size for c in tg_file.chunks)
    else:
        # Fallback for single without metadata (unlikely)
        file_size = 0 

    # Parse Range Header
    range_header = request.headers.get("range")
    start = 0
    end = file_size - 1
    content_length = file_size
    status_code = 200
    
    if range_header:
        try:
            range_match = range_header.replace("bytes=", "").split("-")
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1
            
            if start >= file_size:
                 raise HTTPException(
                    status_code=416,
                    detail="Requested range not satisfiable",
                    headers={"Content-Range": f"bytes */{file_size}"}
                )
            
            content_length = end - start + 1
            status_code = 206
        except ValueError:
            pass # Invalid range, ignore

    # Prepare file data structure expected by service
    file_data = {
        "is_split": tg_file.is_split,
        "message_id": tg_file.message_id,
        "chunks": [
            {
                "chunk_index": c.chunk_index,
                "message_id": c.message_id,
                "file_id": c.file_id,
                "size": c.size
            }
            for c in tg_file.chunks
        ] if tg_file.is_split else []
    }
    
    # Create generator with range limit
    async def range_stream_generator():
        bytes_sent = 0
        async for chunk in telegram_service.stream_file_content(tg_file.chat_id, file_data, offset=start):
            if bytes_sent + len(chunk) > content_length:
                # Truncate last chunk
                yield chunk[:content_length - bytes_sent]
                break
            yield chunk
            bytes_sent += len(chunk)
            if bytes_sent >= content_length:
                break
    
    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Access-Control-Allow-Origin": "*",
    }
    if tg_file.media and tg_file.media.mime_type:
        media_type = tg_file.media.mime_type
    else:
        media_type = "application/octet-stream"

    return StreamingResponse(
        range_stream_generator(),
        status_code=status_code,
        media_type=media_type,
        headers=headers
    )

