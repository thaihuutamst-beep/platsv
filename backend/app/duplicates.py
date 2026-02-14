import hashlib
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .config import MEDIA_ROOT
from .models import MediaFile

def hash_file(path: Path, chunk_size=1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

async def compute_hashes(session: AsyncSession):
    result = await session.execute(select(MediaFile).where(MediaFile.hash == None))
    items = result.scalars().all()

    for item in items:
        full_path = MEDIA_ROOT / item.path
        if not full_path.exists():
            continue
        item.hash = hash_file(full_path)

    await session.commit()

async def mark_duplicates(session: AsyncSession):
    result = await session.execute(select(MediaFile))
    items = result.scalars().all()

    by_hash: dict[str, list[MediaFile]] = {}
    for item in items:
        if not item.hash:
            continue
        by_hash.setdefault(item.hash, []).append(item)

    for group in by_hash.values():
        if len(group) > 1:
            for item in group:
                item.is_duplicate = True

    await session.commit()
