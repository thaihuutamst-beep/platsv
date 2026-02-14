from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form, Depends
from pydantic import BaseModel
from typing import Optional
import shutil
import os
from pathlib import Path
from ..services.ytdlp_service import ytdlp_service
from ..config import MEDIA_ROOT

router = APIRouter(prefix="/ytdlp", tags=["ytdlp"])

@router.post("/download")
async def download_video(
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    upload_to_telegram: bool = Form(True),
    cookies_file: Optional[UploadFile] = File(None)
):
    """
    Download video from URL.
    Optional: Upload cookies.txt for authentication.
    """
    cookies_path = None
    if cookies_file:
        # Save cookies to temp file
        temp_dir = Path("temp/cookies")
        temp_dir.mkdir(parents=True, exist_ok=True)
        cookies_path = str(temp_dir / f"cookies_{os.getpid()}.txt")
        try:
            with open(cookies_path, "wb") as buffer:
                shutil.copyfileobj(cookies_file.file, buffer)
        finally:
            await cookies_file.close()

    # Define background task wrapper
    async def _bg_task(u, c_path, upload):
        try:
            await ytdlp_service.download_and_upload(u, c_path, upload)
        except Exception as e:
            print(f"Background download failed: {e}")

    background_tasks.add_task(_bg_task, url, cookies_path, upload_to_telegram)
    
    return {"status": "queued", "message": "Download started in background"}
