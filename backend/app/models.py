from __future__ import annotations
from typing import List
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Float,
    DateTime,
    ForeignKey,
    Table,
    Text,
    Index,
    func,
)
from sqlalchemy.orm import relationship
from .database import Base

# Association table for many-to-many between media_files and tags
media_tags = Table(
    "media_tags",
    Base.metadata,
    Column("media_id", Integer, ForeignKey("media_files.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True),
)


class MediaFile(Base):
    __tablename__ = "media_files"

    id = Column(Integer, primary_key=True)
    path = Column(String, nullable=False, unique=False, index=True)  # relative path
    name = Column(String, nullable=False, index=True)
    size = Column(Integer, default=0)
    duration = Column(Float, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True)
    thumbnail = Column(String, nullable=True)
    rating = Column(Integer, default=0)
    is_duplicate = Column(Boolean, default=False)
    hash = Column(String, nullable=True, index=True)
    
    # Cloud storage tracking
    cloud_backed = Column(Boolean, default=False, index=True)
    cloud_provider = Column(String, nullable=True)  # "onedrive", "google_drive", "rclone", etc.

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)

    # relationships
    tags = relationship("Tag", secondary=media_tags, back_populates="media_files")
    collection_items = relationship("CollectionItem", back_populates="media", cascade="all, delete-orphan")
    play_history = relationship("PlayHistory", back_populates="media", cascade="all, delete-orphan")
    telegram_file = relationship("TelegramFile", uselist=False, back_populates="media", cascade="all, delete-orphan")

    # Composite indexes for common query patterns
    __table_args__ = (
        Index('idx_media_size', 'size'),
        Index('idx_media_duration', 'duration'),
        Index('idx_media_created_at', 'created_at'),
        Index('idx_media_mime_type', 'mime_type'),
        Index('idx_media_name_size', 'name', 'size'),
        Index('idx_media_created_duration', 'created_at', 'duration'),
    )


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True, index=True)

    media_files = relationship("MediaFile", secondary=media_tags, back_populates="tags")


class Collection(Base):
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship("CollectionItem", back_populates="collection", cascade="all, delete-orphan")


class CollectionItem(Base):
    __tablename__ = "collection_items"

    id = Column(Integer, primary_key=True)
    collection_id = Column(Integer, ForeignKey("collections.id"), nullable=False, index=True)
    media_id = Column(Integer, ForeignKey("media_files.id"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False, default=0)

    collection = relationship("Collection", back_populates="items")
    media = relationship("MediaFile", back_populates="collection_items")


class PlayHistory(Base):
    __tablename__ = "play_history"

    id = Column(Integer, primary_key=True)
    media_id = Column(Integer, ForeignKey("media_files.id"), nullable=False, index=True)
    played_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    position = Column(Float, default=0.0)
    finished = Column(Boolean, default=False)

    media = relationship("MediaFile", back_populates="play_history")


# --- Playlist and Favorites models (new) ---

class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship("PlaylistItem", back_populates="playlist", cascade="all, delete-orphan")


class PlaylistItem(Base):
    __tablename__ = "playlist_items"

    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id"), nullable=False, index=True)
    media_id = Column(Integer, ForeignKey("media_files.id"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False, default=0)

    playlist = relationship("Playlist", back_populates="items")
    media = relationship("MediaFile")



class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True)
    media_id = Column(Integer, ForeignKey("media_files.id"), unique=True, nullable=False, index=True)


class TelegramFile(Base):
    __tablename__ = "telegram_files"
    
    id = Column(Integer, primary_key=True)
    media_id = Column(Integer, ForeignKey("media_files.id"), unique=True, nullable=False, index=True)
    chat_id = Column(String, nullable=False)  # Chat where files are stored
    message_id = Column(Integer, nullable=True) # Main message ID if single file
    file_id = Column(String, nullable=True)   # Main file_id if single file
    is_split = Column(Boolean, default=False)
    
    media = relationship("MediaFile", back_populates="telegram_file")
    chunks = relationship("TelegramFileChunk", back_populates="telegram_file", cascade="all, delete-orphan", order_by="TelegramFileChunk.chunk_index")


class TelegramFileChunk(Base):
    __tablename__ = "telegram_file_chunks"
    
    id = Column(Integer, primary_key=True)
    telegram_file_id = Column(Integer, ForeignKey("telegram_files.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    message_id = Column(Integer, nullable=False)  # Message ID containing the chunk
    file_id = Column(String, nullable=False)      # Telegram file_id of the chunk
    size = Column(Integer, nullable=False)
    
    telegram_file = relationship("TelegramFile", back_populates="chunks")


class Setting(Base):
    """Key-value settings storage for application configuration."""
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    key = Column(String, nullable=False, unique=True, index=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

