"""
Video Processing Module - Server-Side Rotation & Optimization
Handles video rotation, transcoding, and streaming with hardware acceleration
"""

import asyncio
import subprocess
import json
from pathlib import Path
from typing import Optional, Tuple
import logging

logger = logging.getLogger("video_processor")

# Hardware acceleration priority (Surface Pro 8)
HW_ACCEL_PRIORITY = [
    ("h264_qsv", "Intel QuickSync"),  # Best for Surface
    ("h264_nvenc", "NVIDIA NVENC"),   # Fallback
    ("libx264", "Software (CPU)"),    # Last resort
]

# Custom Binary Paths
CUSTOM_FFMPEG = Path(r"C:\mpv\ffmpeg.exe")
CUSTOM_FFPROBE = Path(r"C:\mpv\ffprobe.exe")  # Usually unrelated to mpv folder structure but checking anyway

def get_ffmpeg_cmd(cmd: str = "ffmpeg") -> str:
    """Get path to ffmpeg executable"""
    if cmd == "ffmpeg" and CUSTOM_FFMPEG.exists():
        return str(CUSTOM_FFMPEG)
    if cmd == "ffprobe":
        # Check explicit path first
        if CUSTOM_FFPROBE.exists():
             return str(CUSTOM_FFPROBE)
        # Fallback: often in same dir as ffmpeg
        probe_in_ffmpeg_dir = CUSTOM_FFMPEG.parent / "ffprobe.exe"
        if probe_in_ffmpeg_dir.exists():
            return str(probe_in_ffmpeg_dir)
            
    return cmd

async def detect_rotation(video_path: Path) -> int:
    """
    Detect video rotation metadata using ffprobe.
    
    Returns:
        Rotation angle in degrees (0, 90, 180, 270)
    """
    try:
        cmd = [
            get_ffmpeg_cmd("ffprobe"),
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream_tags=rotate",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video_path)
        ]
        
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await proc.communicate()
        
        if proc.returncode == 0 and stdout:
            rotation = int(stdout.decode().strip())
            logger.info(f"Detected rotation: {rotation}° for {video_path.name}")
            return rotation
        
        # No rotation metadata
        return 0
        
    except Exception as e:
        logger.warning(f"Failed to detect rotation for {video_path}: {e}")
        return 0


async def detect_available_encoder() -> Tuple[str, str]:
    """
    Detect best available hardware encoder.
    
    Returns:
        (encoder_name, description)
    """
    for encoder, description in HW_ACCEL_PRIORITY:
        try:
            # Test if encoder is available
            cmd = [get_ffmpeg_cmd("ffmpeg"), "-hide_banner", "-encoders"]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            
            if encoder.encode() in stdout:
                logger.info(f"Using encoder: {description} ({encoder})")
                return encoder, description
                
        except Exception as e:
            logger.warning(f"Failed to test encoder {encoder}: {e}")
            continue
    
    # Fallback to software
    return "libx264", "Software (CPU)"


def get_transpose_filter(rotation: int) -> str:
    """
    Get FFmpeg transpose filter for rotation angle.
    
    Args:
        rotation: Rotation angle (0, 90, 180, 270)
    
    Returns:
        FFmpeg filter string
    """
    transpose_map = {
        0: "",  # No rotation
        90: "transpose=1",  # 90° clockwise
        180: "transpose=1,transpose=1",  # 180°
        270: "transpose=2",  # 90° counter-clockwise (270° clockwise)
    }
    
    return transpose_map.get(rotation, "")


async def get_video_stream_command(
    video_path: Path,
    rotation: Optional[int] = None,
    start_time: Optional[float] = None,
    encoder: Optional[str] = None
) -> list:
    """
    Build FFmpeg command for streaming with optional rotation.
    
    Args:
        video_path: Path to video file
        rotation: Rotation angle (auto-detect if None)
        start_time: Start position in seconds
        encoder: Video encoder (auto-detect if None)
    
    Returns:
        FFmpeg command as list
    """
    # Auto-detect rotation if not provided
    if rotation is None:
        rotation = await detect_rotation(video_path)
    
    # Auto-detect encoder if not provided
    if encoder is None:
        encoder, _ = await detect_available_encoder()
    
    # Build filter chain
    filters = []
    
    # Add transpose filter if needed
    transpose = get_transpose_filter(rotation)
    if transpose:
        filters.append(transpose)
    
    # Combine filters
    vf = ",".join(filters) if filters else "null"
    
    # Build command
    cmd = [get_ffmpeg_cmd("ffmpeg"), "-hide_banner"]
    
    # Start time (for seeking)
    if start_time:
        cmd.extend(["-ss", str(start_time)])
    
    # Input
    cmd.extend(["-i", str(video_path)])
    
    # Video filters
    cmd.extend(["-vf", vf])
    
    # Video encoding
    if encoder == "h264_qsv":
        # Intel QuickSync settings
        cmd.extend([
            "-c:v", "h264_qsv",
            "-preset", "veryfast",
            "-global_quality", "23",  # Quality (lower = better)
        ])
    elif encoder == "h264_nvenc":
        # NVIDIA NVENC settings
        cmd.extend([
            "-c:v", "h264_nvenc",
            "-preset", "p4",  # Fast preset
            "-cq", "23",
        ])
    else:
        # Software encoding
        cmd.extend([
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
        ])
    
    # Audio (copy without re-encoding)
    cmd.extend(["-c:a", "copy"])
    
    # Output format (MP4 fragmented for streaming)
    cmd.extend([
        "-f", "mp4",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "pipe:1"
    ])
    
    logger.info(f"Stream command: {' '.join(cmd[:10])}...")
    return cmd


async def stream_video_with_rotation(
    video_path: Path,
    rotation: Optional[int] = None
) -> asyncio.subprocess.Process:
    """
    Start streaming video with auto-rotation.
    
    Args:
        video_path: Path to video file
        rotation: Rotation angle (auto-detect if None)
    
    Returns:
        FFmpeg process (stdout contains video stream)
    """
    cmd = await get_video_stream_command(video_path, rotation)
    
    # Start FFmpeg process
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    return proc


# Cache for rotation metadata (max 1000 entries to prevent memory bloat)
from functools import lru_cache

@lru_cache(maxsize=1000)
def _get_rotation_sync(path_str: str) -> int:
    """Synchronous wrapper for rotation detection result caching"""
    return 0  # Placeholder, actual caching happens in get_cached_rotation

_rotation_cache = {}  # Keep for now but we'll use a better approach or just limit this dict

async def get_cached_rotation(video_path: Path) -> int:
    """Get rotation with caching (LRU limited)."""
    path_str = str(video_path)
    
    # Simple LRU implementation
    if path_str in _rotation_cache:
        # Move to end (most recently used)
        val = _rotation_cache.pop(path_str)
        _rotation_cache[path_str] = val
        return val
    
    # Get rotation
    rotation = await detect_rotation(video_path)
    
    # Store
    _rotation_cache[path_str] = rotation
    
    # Prune if too large
    if len(_rotation_cache) > 1000:
        # Remove first item (least recently used)
        it = iter(_rotation_cache)
        try:
            first = next(it)
            del _rotation_cache[first]
        except StopIteration:
            pass
            
    return rotation


class VideoStreamContext:
    """
    Context manager for video streaming processes.
    Ensures FFmpeg processes are killed when streaming ends or client disconnects.
    """
    def __init__(self, cmd: list):
        self.cmd = cmd
        self.proc = None
        
    async def __aenter__(self):
        self.proc = await asyncio.create_subprocess_exec(
            *self.cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        return self.proc

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.proc:
            if self.proc.returncode is None:
                try:
                    self.proc.kill()
                    await self.proc.wait()
                    logger.info("Killed FFmpeg process via context manager")
                except Exception as e:
                    logger.error(f"Failed to kill FFmpeg process: {e}")


async def stream_video_with_rotation(
    video_path: Path,
    rotation: Optional[int] = None
) -> VideoStreamContext:
    """
    Start streaming video with auto-rotation.
    Returns a context manager that yields the process.
    """
    cmd = await get_video_stream_command(video_path, rotation)
    return VideoStreamContext(cmd)


async def get_transcode_command(
    video_path: Path,
    rotation: int = 0,
    start_time: Optional[float] = None,
    encoder: Optional[str] = None,
) -> list:
    """
    Build FFmpeg command for full transcoding to H.264 + AAC.
    
    Unlike get_video_stream_command (which copies audio), this transcodes
    BOTH video and audio to ensure maximum browser compatibility.
    Use this when the browser reports a codec error on the original stream.
    
    Args:
        video_path: Path to video file
        rotation: Rotation angle (0, 90, 180, 270)
        start_time: Start position in seconds
        encoder: Video encoder (auto-detect if None)
    
    Returns:
        FFmpeg command as list
    """
    # Auto-detect encoder if not provided
    if encoder is None:
        encoder, enc_desc = await detect_available_encoder()
        logger.info(f"Transcode using encoder: {encoder} ({enc_desc})")

    # Build filter chain
    filters = []
    transpose = get_transpose_filter(rotation)
    if transpose:
        filters.append(transpose)
    
    # Scale down if very high resolution (4K+ → 1080p for smooth browser playback)
    filters.append("scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease")

    vf = ",".join(filters)

    # Build command
    cmd = [get_ffmpeg_cmd("ffmpeg"), "-hide_banner", "-loglevel", "warning"]

    # Start time (for seeking)
    if start_time:
        cmd.extend(["-ss", str(start_time)])

    # Input
    cmd.extend(["-i", str(video_path)])

    # Video filters
    cmd.extend(["-vf", vf])

    # Video encoding
    if encoder == "h264_qsv":
        cmd.extend([
            "-c:v", "h264_qsv",
            "-preset", "veryfast",
            "-global_quality", "25",
        ])
    elif encoder == "h264_nvenc":
        cmd.extend([
            "-c:v", "h264_nvenc",
            "-preset", "p4",
            "-cq", "25",
        ])
    else:
        cmd.extend([
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "25",
        ])

    # Audio: ALWAYS transcode to AAC for browser compatibility
    cmd.extend([
        "-c:a", "aac",
        "-b:a", "128k",
        "-ac", "2",  # Stereo (browsers handle stereo best)
    ])

    # Output format (fragmented MP4 for streaming)
    cmd.extend([
        "-f", "mp4",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "pipe:1"
    ])

    logger.info(f"Transcode command: {' '.join(cmd[:12])}...")
    return cmd
