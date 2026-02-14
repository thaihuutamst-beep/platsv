"""
Monitoring module for Media Drive - Optimized for Surface Pro 8

Features:
  - Request timing middleware (logs slow requests > 1s)
  - System stats endpoint (CPU, RAM, Disk)
  - X-Process-Time header on every response
"""

import time
import logging

logger = logging.getLogger("monitoring")


async def request_timing_middleware(request, call_next):
    """Middleware that measures request duration and logs slow requests."""
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start

    if duration > 1.0:
        logger.warning(f"SLOW {request.method} {request.url.path} → {duration:.2f}s")

    response.headers["X-Process-Time"] = f"{duration:.4f}"
    return response


def get_system_stats() -> dict:
    """Get current system resource usage."""
    try:
        import psutil

        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("C:\\")

        return {
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory": {
                "total_gb": round(mem.total / 1e9, 1),
                "used_gb": round(mem.used / 1e9, 1),
                "available_gb": round(mem.available / 1e9, 1),
                "percent": mem.percent,
            },
            "disk": {
                "total_gb": round(disk.total / 1e9, 1),
                "used_gb": round(disk.used / 1e9, 1),
                "free_gb": round(disk.free / 1e9, 1),
                "percent": disk.percent,
            },
        }
    except ImportError:
        return {"error": "psutil not installed. Run: pip install psutil"}
