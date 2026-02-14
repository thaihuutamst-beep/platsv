# Playlist Management Router - Complete Implementation
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.playlist_service import PlaylistService

router = APIRouter(prefix="/playlists", tags=["playlists"])

# === Request/Response Models ===

class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = None

class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class PlaylistAddItems(BaseModel):
    media_ids: list[int]

class PlaylistReorder(BaseModel):
    item_order: list[int]  # List of media_ids in new order

# === Endpoints ===

@router.get("/")
async def list_playlists(db: Session = Depends(get_db)):
    """List all playlists with item counts"""
    service = PlaylistService(db)
    return service.list_playlists()

@router.post("/")
async def create_playlist(req: PlaylistCreate, db: Session = Depends(get_db)):
    """Create a new playlist"""
    service = PlaylistService(db)
    return service.create_playlist(req.name, req.description or "")

@router.get("/{playlist_id}")
async def get_playlist(playlist_id: int, db: Session = Depends(get_db)):
    """Get playlist with all items"""
    service = PlaylistService(db)
    result = service.get_playlist(playlist_id)
    if not result:
        raise HTTPException(404, f"Playlist {playlist_id} not found")
    return result

@router.patch("/{playlist_id}")
async def update_playlist(
    playlist_id: int, 
    req: PlaylistUpdate, 
    db: Session = Depends(get_db)
):
    """Update playlist name/description"""
    service = PlaylistService(db)
    result = service.update_playlist(playlist_id, req.name, req.description)
    if not result:
        raise HTTPException(404, f"Playlist {playlist_id} not found")
    return result

@router.delete("/{playlist_id}")
async def delete_playlist(playlist_id: int, db: Session = Depends(get_db)):
    """Delete a playlist"""
    service = PlaylistService(db)
    success = service.delete_playlist(playlist_id)
    if not success:
        raise HTTPException(404, f"Playlist {playlist_id} not found")
    return {"deleted": True}

@router.post("/{playlist_id}/items")
async def add_items(
    playlist_id: int, 
    req: PlaylistAddItems, 
    db: Session = Depends(get_db)
):
    """Add media items to playlist"""
    service = PlaylistService(db)
    try:
        return service.add_items(playlist_id, req.media_ids)
    except ValueError as e:
        raise HTTPException(404, str(e))

@router.delete("/{playlist_id}/items/{media_id}")
async def remove_item(
    playlist_id: int, 
    media_id: int, 
    db: Session = Depends(get_db)
):
    """Remove item from playlist"""
    service = PlaylistService(db)
    success = service.remove_item(playlist_id, media_id)
    if not success:
        raise HTTPException(404, f"Item not found in playlist")
    return {"removed": True}

@router.put("/{playlist_id}/reorder")
async def reorder_items(
    playlist_id: int, 
    req: PlaylistReorder, 
    db: Session = Depends(get_db)
):
    """Reorder playlist items"""
    service = PlaylistService(db)
    success = service.reorder_items(playlist_id, req.item_order)
    return {"reordered": success}

@router.get("/{playlist_id}/play")
async def get_playback_list(
    playlist_id: int,
    shuffle: bool = False,
    db: Session = Depends(get_db)
):
    """Get playlist items ready for playback"""
    service = PlaylistService(db)
    items = service.get_playlist_for_playback(playlist_id)
    
    if not items:
        raise HTTPException(404, f"Playlist {playlist_id} is empty or not found")
    
    if shuffle:
        import random
        random.shuffle(items)
    
    return {"items": items, "count": len(items)}
