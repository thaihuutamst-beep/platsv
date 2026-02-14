"""
Caching layer for Media Drive - Optimized for Surface Pro 8 (8GB RAM)

Design:
  - Tries Redis first (if installed and running).
  - Falls back to a lightweight in-memory LRU cache automatically.
  - The in-memory cache is capped at 256 entries (~5-10 MB) to stay RAM-friendly.

Usage:
    from .cache import cache

    # Store
    await cache.set("files:0:60", data, ttl=60)

    # Retrieve (returns None on miss)
    result = await cache.get("files:0:60")

    # Invalidate
    await cache.delete("files:0:60")
    await cache.clear_prefix("files:")  # Clear all file listings
"""

import json
import time
import logging
from collections import OrderedDict
from typing import Any, Optional

logger = logging.getLogger("cache")


# ---------------------------------------------------------------------------
# In-Memory LRU Cache (zero dependencies, very light)
# ---------------------------------------------------------------------------
class InMemoryCache:
    """
    Thread-safe LRU cache with TTL support.
    Max 256 entries ≈ 5-10 MB RAM (each entry is a JSON-serialized list/dict).
    """

    def __init__(self, max_size: int = 256):
        self._store: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._max_size = max_size

    async def get(self, key: str) -> Optional[Any]:
        if key not in self._store:
            return None
        expire_at, raw = self._store[key]
        if time.time() > expire_at:
            del self._store[key]
            return None
        # Move to end (most recently used)
        self._store.move_to_end(key)
        return json.loads(raw)

    async def set(self, key: str, value: Any, ttl: int = 300):
        raw = json.dumps(value, default=str)
        self._store[key] = (time.time() + ttl, raw)
        self._store.move_to_end(key)
        # Evict oldest if over capacity
        while len(self._store) > self._max_size:
            self._store.popitem(last=False)

    async def delete(self, key: str):
        self._store.pop(key, None)

    async def clear_prefix(self, prefix: str):
        """Delete all keys that start with the given prefix."""
        keys_to_delete = [k for k in self._store if k.startswith(prefix)]
        for k in keys_to_delete:
            del self._store[k]

    async def clear_all(self):
        self._store.clear()

    def stats(self) -> dict:
        now = time.time()
        alive = sum(1 for _, (exp, _) in self._store.items() if exp > now)
        return {"backend": "memory", "entries": len(self._store), "alive": alive, "max": self._max_size}


# ---------------------------------------------------------------------------
# Redis Cache (optional, higher performance)
# ---------------------------------------------------------------------------
class RedisCache:
    """Async Redis cache. Only used if redis is installed and reachable."""

    def __init__(self, client):
        self._redis = client

    async def get(self, key: str) -> Optional[Any]:
        raw = await self._redis.get(f"md:{key}")
        if raw is None:
            return None
        return json.loads(raw)

    async def set(self, key: str, value: Any, ttl: int = 300):
        raw = json.dumps(value, default=str)
        await self._redis.setex(f"md:{key}", ttl, raw)

    async def delete(self, key: str):
        await self._redis.delete(f"md:{key}")

    async def clear_prefix(self, prefix: str):
        cursor = 0
        while True:
            cursor, keys = await self._redis.scan(cursor, match=f"md:{prefix}*", count=100)
            if keys:
                await self._redis.delete(*keys)
            if cursor == 0:
                break

    async def clear_all(self):
        await self.clear_prefix("")

    def stats(self) -> dict:
        return {"backend": "redis"}


# ---------------------------------------------------------------------------
# Factory: auto-select best available backend
# ---------------------------------------------------------------------------
async def create_cache():
    """
    Try Redis first. If not available, fall back to in-memory.
    This is called once at server startup.
    """
    # Try Redis
    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(
            "redis://localhost:6379",
            decode_responses=True,
            socket_connect_timeout=2,  # Don't hang if Redis is down
        )
        await client.ping()
        logger.info("✅ Cache backend: Redis (localhost:6379)")
        return RedisCache(client)
    except ImportError:
        logger.info("📦 redis package not installed → using in-memory cache")
    except Exception as e:
        logger.info(f"⚠️ Redis not available ({e}) → using in-memory cache")

    # Fallback: in-memory
    logger.info("✅ Cache backend: In-Memory LRU (max 256 entries)")
    return InMemoryCache(max_size=256)


# ---------------------------------------------------------------------------
# Global cache instance (initialized in main.py on_startup)
# ---------------------------------------------------------------------------
cache: Optional[Any] = None


async def init_cache():
    """Call this from app startup to initialize the cache."""
    global cache
    cache = await create_cache()
    return cache
