# Playlist Service - Complete Implementation
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from ..models import Playlist, PlaylistItem, MediaFile


class PlaylistService:
    """Service for playlist management operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def list_playlists(self) -> list[dict]:
        """Get all playlists with item count"""
        playlists = self.db.query(Playlist).all()
        return [self._playlist_to_dict(p) for p in playlists]
    
    def create_playlist(self, name: str, description: str = "") -> dict:
        """Create a new playlist"""
        playlist = Playlist(name=name, description=description)
        self.db.add(playlist)
        self.db.commit()
        self.db.refresh(playlist)
        return self._playlist_to_dict(playlist)
    
    def get_playlist(self, playlist_id: int) -> Optional[dict]:
        """Get playlist with all items"""
        playlist = self.db.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            return None
        
        result = self._playlist_to_dict(playlist)
        result["items"] = [
            {
                "id": item.id,
                "position": item.order_index,
                "media": self._media_to_dict(item.media)
            }
            for item in sorted(playlist.items, key=lambda x: x.order_index)
        ]
        return result
    
    def update_playlist(self, playlist_id: int, name: Optional[str] = None, description: Optional[str] = None) -> Optional[dict]:
        """Update playlist name/description"""
        playlist = self.db.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            return None
        
        if name is not None:
            playlist.name = name
        if description is not None:
            playlist.description = description
        
        self.db.commit()
        self.db.refresh(playlist)
        return self._playlist_to_dict(playlist)
    
    def delete_playlist(self, playlist_id: int) -> bool:
        """Delete a playlist"""
        playlist = self.db.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            return False
        
        self.db.delete(playlist)
        self.db.commit()
        return True
    
    def add_items(self, playlist_id: int, media_ids: list[int]) -> dict:
        """Add media items to playlist"""
        playlist = self.db.query(Playlist).filter(Playlist.id == playlist_id).first()
        if not playlist:
            raise ValueError(f"Playlist {playlist_id} not found")
        
        # Get current max order_index
        max_order = self.db.query(func.max(PlaylistItem.order_index)).filter(
            PlaylistItem.playlist_id == playlist_id
        ).scalar() or -1
        
        added = []
        for i, media_id in enumerate(media_ids):
            # Check if media exists
            media = self.db.query(MediaFile).filter(MediaFile.id == media_id).first()
            if not media:
                continue
            
            # Check if already in playlist
            existing = self.db.query(PlaylistItem).filter(
                PlaylistItem.playlist_id == playlist_id,
                PlaylistItem.media_id == media_id
            ).first()
            if existing:
                continue
            
            item = PlaylistItem(
                playlist_id=playlist_id,
                media_id=media_id,
                order_index=max_order + 1 + i
            )
            self.db.add(item)
            added.append(media_id)
        
        self.db.commit()
        return {"added": added, "count": len(added)}
    
    def remove_item(self, playlist_id: int, media_id: int) -> bool:
        """Remove item from playlist"""
        item = self.db.query(PlaylistItem).filter(
            PlaylistItem.playlist_id == playlist_id,
            PlaylistItem.media_id == media_id
        ).first()
        
        if not item:
            return False
        
        self.db.delete(item)
        self.db.commit()
        return True
    
    def reorder_items(self, playlist_id: int, item_order: list[int]) -> bool:
        """Reorder playlist items
        
        Args:
            playlist_id: Playlist ID
            item_order: List of media_ids in new order
        """
        items = self.db.query(PlaylistItem).filter(
            PlaylistItem.playlist_id == playlist_id
        ).all()
        
        item_map = {item.media_id: item for item in items}
        
        for i, media_id in enumerate(item_order):
            if media_id in item_map:
                item_map[media_id].order_index = i
        
        self.db.commit()
        return True
    
    def get_playlist_for_playback(self, playlist_id: int) -> list[dict]:
        """Get playlist items ready for playback (ordered list of media)"""
        items = self.db.query(PlaylistItem).filter(
            PlaylistItem.playlist_id == playlist_id
        ).order_by(PlaylistItem.order_index).all()
        
        return [self._media_to_dict(item.media) for item in items if item.media]
    
    def _playlist_to_dict(self, playlist: Playlist) -> dict:
        """Convert Playlist model to dict"""
        return {
            "id": playlist.id,
            "name": playlist.name,
            "description": playlist.description,
            "item_count": len(playlist.items),
            "created_at": playlist.created_at.isoformat() if playlist.created_at else None
        }
    
    def _media_to_dict(self, media: MediaFile) -> dict:
        """Convert MediaFile model to dict"""
        if not media:
            return {}
        return {
            "id": media.id,
            "name": media.name,
            "path": media.path,
            "size": media.size,
            "duration": media.duration,
            "mime_type": media.mime_type,
            "thumbnail": media.thumbnail,
            "rating": media.rating
        }
