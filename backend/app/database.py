"""
Database configuration - Optimized for Surface Pro 8 (i5, 8GB RAM)

Key optimizations:
1. WAL Mode (Write-Ahead Logging): Allows concurrent reads while writing.
   Without WAL, SQLite locks the entire DB on every write → readers must wait.
   With WAL, readers never block writers and vice versa.

2. Connection Pool: Configured for low-memory usage.
   - pool_size=10: Enough for a personal server.
   - max_overflow=5: Small burst capacity.
   - pool_recycle=3600: Prevent stale connections.

3. PRAGMA optimizations applied at connection time:
   - journal_mode=WAL: Concurrent read/write.
   - synchronous=NORMAL: Good balance of safety vs speed (2x faster than FULL).
   - cache_size=-8000: 8MB of page cache in RAM (very modest).
   - busy_timeout=5000: Wait 5s instead of failing immediately on lock.
   - temp_store=MEMORY: Temp tables in RAM instead of disk.
"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import event
from .config import DB_URL

engine = create_async_engine(
    DB_URL,
    echo=False,
    future=True,
    pool_size=10,         # Base connection count (enough for personal use)
    max_overflow=5,       # Extra connections under burst load
    pool_timeout=30,      # Wait time for a connection from pool
    pool_recycle=3600,    # Recycle connections every hour
    pool_pre_ping=True,   # Verify connection is alive before using it
)

# Apply SQLite PRAGMA optimizations whenever a new raw connection is created.
# These settings persist for the lifetime of that connection.
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")        # Concurrent reads + writes
    cursor.execute("PRAGMA synchronous=NORMAL")       # 2x faster, still safe
    cursor.execute("PRAGMA cache_size=-8000")          # 8MB page cache in RAM
    cursor.execute("PRAGMA busy_timeout=5000")         # Wait 5s on lock
    cursor.execute("PRAGMA temp_store=MEMORY")         # Temp tables in RAM
    cursor.execute("PRAGMA mmap_size=67108864")        # 64MB memory-mapped I/O
    cursor.close()

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
