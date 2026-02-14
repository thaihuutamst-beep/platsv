import asyncio
import hashlib
import sys
import os
import subprocess
from pathlib import Path

# Mock config
MEDIA_ROOT = Path(r"C:\Users\Original")
THUMB_DIR = Path(__file__).parent.parent / "thumbnails"

# Ensure dir exists
if not THUMB_DIR.exists():
    print(f"Creating thumb dir: {THUMB_DIR}")
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
else:
    print(f"Thumb dir exists: {THUMB_DIR}")

def test_gen(rel_path):
    print(f"\n--- Testing Path: {rel_path} ---")
    orig = (MEDIA_ROOT / rel_path).resolve()
    print(f"Resolved path: {orig}")
    
    if not orig.exists():
        print("❌ File does not exist on disk!")
        return

    key = hashlib.sha1(str(orig).encode("utf-8")).hexdigest()
    thumb_path = THUMB_DIR / f"{key}.jpg"
    print(f"Target hash: {key}")
    print(f"Target thumb path: {thumb_path}")
    
    if thumb_path.exists():
        print("✅ Thumbnail already exists!")
        return

    print("⚡ Attempting generation...")
    # FFMPEG CMD
    cmd = [
        "ffmpeg", 
        "-y", 
        "-ss", "5", 
        "-i", str(orig), 
        "-vframes", "1", 
        "-vf", "scale=320:-1", 
        str(thumb_path)
    ]
    print(f"Command: {' '.join(cmd)}")
    
    try:
        # Capture strict output
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0:
            print("✅ FFmpeg success!")
            if thumb_path.exists():
                print(f"File created size: {thumb_path.stat().st_size} bytes")
            else:
                print("❌ Success reported but file missing!")
        else:
            print(f"❌ FFmpeg failed default (5s). Return code: {result.returncode}")
            print(f"STDERR: {result.stderr[:500]}...") # Show first 500 chars

            # Try 0s
            print("⚡ Retrying at 0s...")
            cmd[2] = "0"
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if result.returncode == 0:
                print("✅ FFmpeg (0s) success!")
            else:
                 print(f"❌ FFmpeg (0s) failed. STDERR: {result.stderr[:500]}...")

    except FileNotFoundError:
        print("❌ FFMPEG NOT FOUND in PATH!")
    except Exception as e:
        print(f"❌ Exception: {e}")

if __name__ == "__main__":
    # Hardcoded path based on previous file listings or typical test file
    # I saw valid OneDrive files in the list_dir output, let's try to construct one valid path
    # But list_dir showed filenames in THUMBNAILS folder, not MEDIA folder.
    # I need a guess. Based on "OneDrive_Videos_Terabox_.1080.mp4.mp4.jpg", maybe real path is:
    # "OneDrive\Videos\Terabox\.1080.mp4.mp4" ?
    
    # Let's try to verify if we can find *any* file first.
    # Since I cannot easily list MEDIA_ROOT recursively here without being slow, 
    # I will ask the user or just try a likely path.
    # Actually, I'll try to walk 1 level of MEDIA_ROOT to find a video file.
    
    found = None
    extensions = {".mp4", ".mkv", ".avi", ".mov", ".ts"}
    
    print(f"Scanning {MEDIA_ROOT} for a video file...")
    try:
        for root, dirs, files in os.walk(MEDIA_ROOT):
            for f in files:
                if Path(f).suffix.lower() in extensions:
                    found = Path(root) / f
                    # Make relative
                    try:
                        found = found.relative_to(MEDIA_ROOT)
                        break
                    except:
                        pass
            if found: break
    except Exception as e:
        print(f"Scan error: {e}")

    if found:
        test_gen(str(found))
    else:
        print("No video file found in root to test.")
