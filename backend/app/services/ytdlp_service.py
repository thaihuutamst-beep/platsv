import yt_dlp
import asyncio
import os
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from .telegram_service import telegram_service

logger = logging.getLogger("ytdlp_service")

class YTDLPService:
    def __init__(self):
        self.download_dir = Path("temp/dl")
        self.download_dir.mkdir(parents=True, exist_ok=True)

    async def download_and_upload(self, url: str, cookies_path: Optional[str] = None, upload_to_telegram: bool = True, chat_id: str = "me"):
        """
        Download video from URL using yt-dlp and optionally upload to Telegram.
        Runs in a separate thread/process to avoid blocking.
        """
        try:
            logger.info(f"Starting download for: {url}")
            
            # yt-dlp options
            ydl_opts = {
                'outtmpl': str(self.download_dir / '%(title)s [%(id)s].%(ext)s'),
                'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                'quiet': True,
                'no_warnings': True,
            }
            
            if cookies_path:
                ydl_opts['cookiefile'] = cookies_path
            elif os.path.exists(r"C:\mpv\cookies.txt"):
                 ydl_opts['cookiefile'] = r"C:\mpv\cookies.txt"
                 logger.info("Using default cookies from C:\\mpv\\cookies.txt")

            # Run download in thread
            def _download():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    return ydl.prepare_filename(info)

            file_path = await asyncio.to_thread(_download)
            logger.info(f"Downloaded to: {file_path}")
            
            if not os.path.exists(file_path):
                raise Exception("File found in info but not on disk")

            if upload_to_telegram:
                logger.info(f"Uploading to Telegram chat: {chat_id}")
                # Use telegram service to upload
                # We need to ensure we wait for it
                if not telegram_service.is_ready:
                     logger.error("Telegram service not ready, skipping upload")
                     return {"status": "downloaded_only", "path": file_path, "error": "Telegram not connected"}

                # Re-use the background upload logic or call it directly?
                # Calling upload_large_file directly might take time, blocking this function (which is likely running in background task)
                meta = await telegram_service.upload_large_file(
                    file_path, 
                    chat_id, 
                    progress_callback=lambda c, t: logger.debug(f"TG Upload: {c}/{t}")
                )
                
                # Cleanup local file after upload?
                # For now let's keep it or delete it based on preference? 
                # User prompted "file tải về đẩy thẳng qua tele luôn", implying maybe they don't want to keep it local.
                # But safer to keep in temp until explicitly cleaned or auto-cleaned.
                # Let's delete to save space since it's "temp/dl"
                os.remove(file_path)
                logger.info("Local file cleaned up")
                
                return {"status": "success", "telegram_meta": meta}
            
            return {"status": "downloaded", "path": file_path}

        except Exception as e:
            logger.error(f"YT-DLP Error: {e}")
            raise e
        finally:
            # Cleanup cookies file if it was temporary
            if cookies_path and os.path.exists(cookies_path) and "temp_cookies" in cookies_path:
                try:
                    os.remove(cookies_path)
                except:
                    pass

ytdlp_service = YTDLPService()
