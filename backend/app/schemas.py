from pydantic import BaseModel
from typing import List, Optional

class TagBase(BaseModel):
    id: int
    name: str

class MediaFileBase(BaseModel):
    id: int
    path: str
    name: str
    size: int
    rating: int
    created_at: Optional[str]
    updated_at: Optional[str]
    tags: List[TagBase] = []

    model_config = {"from_attributes": True}

class FilesResponse(BaseModel):
    items: List[MediaFileBase]
    total: int
