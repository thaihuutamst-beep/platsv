# Telegram Service - Real Implementation
# Supports: Cloud Streaming, Upload, Download, Bot Control

import os
import json
import asyncio
from pathlib import Path
from typing import Optional, AsyncGenerator, Dict, List, Union
import logging

try:
    from pyrogram import Client, filters, idle
    from pyrogram.types import Message, Document, Video, Audio, Photo
    from pyrogram.errors import FloodWait
except ImportError:
    print("Warning: Pyrogram not installed. Telegram features will be disabled.")
    Client = object  # Mock for typing

# Config Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = BASE_DIR / "config" / "telegram.json"
DATA_DIR = BASE_DIR / "data"
SESSION_NAME = "telegram_session"  # Production session name

logger = logging.getLogger("telegram_service")

class TelegramService:
    def __init__(self):
        self.app: Optional[Client] = None  # User Client (for heavy tasks)
        self.bot: Optional[Client] = None  # Bot Client (for commands)
        self.config = {}
        self.is_ready = False
        
        # Load Config
        self._load_config()

    def _load_config(self):
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, "r") as f:
                self.config = json.load(f)
        
        # Check if setup_wizard created a different session name
        # If setup_session.session exists but telegram_session.session doesn't, rename it
        setup_sess = DATA_DIR / "setup_session.session"
        prod_sess = DATA_DIR / f"{SESSION_NAME}.session"
        if setup_sess.exists() and not prod_sess.exists():
            try:
                os.rename(setup_sess, prod_sess)
                logger.info("Renamed setup session to production session.")
            except Exception as e:
                logger.error(f"Failed to rename session file: {e}")

    async def start(self):
        """Start Telegram Clients"""
        if not self.config.get("api_id") or not self.config.get("api_hash"):
            logger.warning("Telegram config missing. Skipping start.")
            return

        # 1. Start User Client
        try:
            self.app = Client(
                SESSION_NAME,
                api_id=self.config["api_id"],
                api_hash=self.config["api_hash"],
                workdir=str(DATA_DIR)
            )
            await self.app.start()
            me = await self.app.get_me()
            logger.info(f"Telegram User connected: {me.first_name} (@{me.username})")
            self.is_ready = True
        except Exception as e:
            logger.error(f"Failed to start User Client: {e}")

        # 2. Start Bot Client (if token exists)
        if self.config.get("bot_token"):
            try:
                self.bot = Client(
                    "telegram_bot",
                    api_id=self.config["api_id"],
                    api_hash=self.config["api_hash"],
                    bot_token=self.config["bot_token"],
                    workdir=str(DATA_DIR)
                )
                await self.bot.start()
                bot_me = await self.bot.get_me()
                logger.info(f"Telegram Bot connected: @{bot_me.username}")
                
                # Register Bot Handlers (Commands)
                self._register_handlers()
                
            except Exception as e:
                logger.error(f"Failed to start Bot Client: {e}")

    async def stop(self):
        """Stop Clients"""
        if self.app:
            try:
                if self.app.is_connected:
                    await self.app.stop()
            except: pass
        if self.bot:
            try:
                if self.bot.is_connected:
                    await self.bot.stop()
            except: pass

    # --- Authentication Logic ---
    async def send_code(self, phone: str):
        """Send login code to phone"""
        if not self.config.get("api_id") or not self.config.get("api_hash"):
             raise Exception("API ID and Hash not configured")

        if not self.app:
            self.app = Client(
                SESSION_NAME,
                api_id=self.config["api_id"],
                api_hash=self.config["api_hash"],
                workdir=str(DATA_DIR)
            )

        if not self.app.is_connected:
            await self.app.connect()

        try:
            sent_code = await self.app.send_code(phone)
            return sent_code.phone_code_hash
        except Exception as e:
            logger.error(f"Failed to send code: {e}")
            raise e

    async def sign_in(self, phone: str, code: str, phone_code_hash: str):
        """Verify login code"""
        if not self.app:
             raise Exception("Client not initialized")
        
        try:
            user = await self.app.sign_in(phone, code, phone_code_hash=phone_code_hash)
            self.is_ready = True
            
            # Save session for future restarts (Pyrogram does this automatically on disconnect/stop, but we ensure state)
            me = await self.app.get_me()
            logger.info(f"Authenticated as {me.first_name}")
            return user
        except Exception as e:
            logger.error(f"Failed to sign in: {e}")
            raise e

    async def sign_in_password(self, password: str):
        """2FA Password"""
        if not self.app:
             raise Exception("Client not initialized")
        
        try:
            user = await self.app.check_password(password)
            self.is_ready = True
            return user
        except Exception as e:
             logger.error(f"2FA Failed: {e}")
             raise e

    async def logout(self):
        """Logout session"""
        if self.app and self.app.is_connected:
            await self.app.log_out()
            self.is_ready = False


    # --- Streaming Logic ---
    async def stream_file_content(self, chat_id: Union[int, str], file_data: Dict, offset: int = 0) -> AsyncGenerator[bytes, None]:
        """
        Stream file content directly from Telegram.
        Handles both single files and split chunks seamlessly.
        
        Args:
            chat_id: Target chat ID
            file_data: Dictionary containing file info (from DB model)
                       Must have 'is_split', 'message_id'/'file_id' (single), 
                       or 'chunks' list (if split).
            offset: Byte offset to start streaming from
        """
        if not self.app:
            raise Exception("Telegram client not connected")

        try:
            if not file_data.get("is_split"):
                # Simple case: Single file
                message_id = file_data.get("message_id")
                if not message_id:
                     raise Exception("Missing message_id for single file")
                     
                msg = await self.app.get_messages(chat_id, message_ids=message_id)
                if not msg or not msg.media:
                    raise Exception("Message or media not found")
                
                async for chunk in self.app.stream_media(msg, offset=offset):
                    yield chunk
            else:
                # Complex case: Split file
                chunks = sorted(file_data.get("chunks", []), key=lambda x: x["chunk_index"])
                if not chunks:
                    raise Exception("No chunks found for split file")
                
                # Find which chunk covers the requested offset
                current_offset = 0
                start_chunk_index = 0
                blob_offset = 0 # Offset relative to the start of the specific chunk
                
                for i, chunk in enumerate(chunks):
                    chunk_size = chunk["size"]
                    if offset < current_offset + chunk_size:
                        start_chunk_index = i
                        blob_offset = offset - current_offset
                        break
                    current_offset += chunk_size
                
                # Stream from the found chunk onwards
                for i in range(start_chunk_index, len(chunks)):
                    chunk_info = chunks[i]
                    message_id = chunk_info["message_id"]
                    
                    logger.debug(f"Streaming chunk {i} (msg={message_id}) from offset {blob_offset}")
                    
                    msg = await self.app.get_messages(chat_id, message_ids=message_id)
                    if not msg or not msg.media:
                        logger.error(f"Chunk {i} not found in Telegram")
                        continue
                        
                    async for data in self.app.stream_media(msg, offset=blob_offset):
                        yield data
                    
                    # Reset relative offset for subsequent chunks (they start at 0)
                    blob_offset = 0

        except Exception as e:
            logger.error(f"Error streaming file: {e}")
            yield b""

    # --- Upload Logic ---
    async def upload_large_file(self, file_path: str, chat_id: Union[int, str], progress_callback=None) -> Dict:
        """
        Uploads a file to Telegram, splitting it if larger than 2GB.
        Returns a dictionary with metadata ready for DB storage.
        """
        if not self.app:
            raise Exception("Telegram client not connected")

        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
            
        file_size = path.stat().st_size
        CHUNK_SIZE = 2000 * 1024 * 1024  # 2000 MB safety limit (Telegram limit is 2GB/4GB)
        
        # Single file case
        if file_size <= CHUNK_SIZE:
            logger.info(f"Uploading single file: {path.name} ({file_size} bytes)")
            msg = await self.app.send_document(
                chat_id,
                document=path,
                caption=f"📂 {path.name}",
                progress=progress_callback
            )
            
            # Helper to get file_id from message
            file_id = None
            if msg.document: file_id = msg.document.file_id
            elif msg.video: file_id = msg.video.file_id
            elif msg.audio: file_id = msg.audio.file_id
            
            return {
                "is_split": False,
                "message_id": msg.id,
                "file_id": file_id,
                "chat_id": str(chat_id)
            }
        
        # Split file case
        else:
            logger.info(f"File too large ({file_size} bytes). Splitting into chunks...")
            chunks_metadata = []
            
            with open(path, "rb") as f:
                chunk_index = 0
                while True:
                    # Check if we are at EOF
                    current_pos = f.tell()
                    remaining = file_size - current_pos
                    if remaining <= 0:
                        break
                        
                    temp_chunk_name = f"{path.name}.part{chunk_index:03d}"
                    temp_chunk_path = DATA_DIR / temp_chunk_name
                    
                    # Stream write to temp file until CHUNK_SIZE or EOF
                    bytes_written = 0
                    limit = min(CHUNK_SIZE, remaining)
                    
                    with open(temp_chunk_path, "wb") as temp_f:
                        while bytes_written < limit:
                            # Read in 1MB buffers
                            read_size = min(1024 * 1024, limit - bytes_written)
                            buffer = f.read(read_size)
                            if not buffer:
                                break
                            temp_f.write(buffer)
                            bytes_written += len(buffer)
                            
                    current_chunk_size = bytes_written
                    logger.info(f"Uploading chunk {chunk_index}: {temp_chunk_name} ({current_chunk_size} bytes)")
                    

                    
                    try:
                        msg = await self.app.send_document(
                            chat_id,
                            document=temp_chunk_path,
                            caption=f"📦 {path.name} (Part {chunk_index+1})",
                            progress=progress_callback
                        )
                        
                        file_id = None
                        if msg.document: file_id = msg.document.file_id
                        elif msg.video: file_id = msg.video.file_id
                        
                        chunks_metadata.append({
                            "chunk_index": chunk_index,
                            "message_id": msg.id,
                            "file_id": file_id,
                            "size": current_chunk_size
                        })
                        
                    finally:
                        # Clean up temp part
                        if temp_chunk_path.exists():
                            os.remove(temp_chunk_path)
                            
                    chunk_index += 1
            
            return {
                "is_split": True,
                "chat_id": str(chat_id),
                "chunks": chunks_metadata
            }

    # --- Bot Handlers ---
    def _register_handlers(self):
        @self.bot.on_message(filters.command("start"))
        async def start_cmd(client, message):
            await message.reply_text("👋 Hello! DRAM Media Server Bot is Online.\n\nType /help for commands.")

        @self.bot.on_message(filters.command("ping"))
        async def ping_cmd(client, message):
            await message.reply_text("🏓 Pong! Server is running.")

        @self.bot.on_message(filters.command("search"))
        async def search_cmd(client, message):
            # Placeholder for search logic
            query = " ".join(message.command[1:])
            if not query:
                await message.reply_text("🔍 Please provide a keyword. Ex: `/search Avatar`")
                return
            await message.reply_text(f"🔍 Searching for: {query}...\n(Backend search not yet linked)")


telegram_service = TelegramService()
