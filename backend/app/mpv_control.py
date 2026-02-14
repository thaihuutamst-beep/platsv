import subprocess
import json
import asyncio
import os
import time
from pathlib import Path
from .config import MEDIA_ROOT

IPC_PIPE = r"\\.\pipe\mpv-remote"

def play_with_mpv(rel_path: str, position: float | None = None):
    full_path = MEDIA_ROOT / rel_path
    cmd = ["mpv", str(full_path)]
    if position is not None and position > 0:
        cmd.extend(["--start", str(position)])
    subprocess.Popen(cmd)

async def send_mpv_command(command: list):
    """Sends a JSON IPC command to the MPV process on Windows via named pipe."""
    try:
        message = json.dumps({"command": command}) + "\n"
        def _sync_send():
            with open(IPC_PIPE, "w") as f:
                f.write(message)
        await asyncio.to_thread(_sync_send)
        return True
    except Exception as e:
        print(f"IPC Send Error: {e}")
        return False

async def get_mpv_property(prop: str):
    """
    Get a property from MPV via IPC.
    Requires opening the pipe for Read/Write.
    """
    try:
        # Command to get property
        message = json.dumps({"command": ["get_property", prop]}) + "\n"
        
        def _sync_query():
            # Open for update (r+) to read and write
            # Buffering=0 (unbuffered) or 1 (line buffered) is important
            with open(IPC_PIPE, "r+t", encoding="utf-8", buffering=1) as f:
                f.write(message)
                f.flush()
                # Read response
                return f.readline()
        
        resp_line = await asyncio.to_thread(_sync_query)
        if not resp_line:
            return None
            
        data = json.loads(resp_line)
        if data.get("error") == "success":
            return data.get("data")
        return None
    except Exception as e:
        return None
