"""
Thumbnail Queue Manager with Progress Tracking
Optimized for Surface Pro 8 (i5, 8GB RAM)
- Max 2 concurrent workers (avoid overwhelming system)
- Progress tracking via Server-Sent Events (SSE)
- Batch generation support
"""

import asyncio
from asyncio import Queue
from dataclasses import dataclass, field
from typing import Dict, Optional, List
from datetime import datetime
import hashlib
import logging

logger = logging.getLogger("thumbnail_queue")


@dataclass
class ThumbnailJob:
    """Represents a single thumbnail generation job."""
    id: str
    path: str
    progress: float = 0.0
    status: str = "pending"  # pending, processing, done, error
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    def to_dict(self) -> dict:
        """Convert job to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "path": self.path,
            "progress": self.progress,
            "status": self.status,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class ThumbnailQueue:
    """
    Queue manager for thumbnail generation with progress tracking.
    Optimized for Surface Pro 8 with limited resources.
    """
    
    def __init__(self, max_workers: int = 2):
        """
        Initialize thumbnail queue.
        
        Args:
            max_workers: Maximum concurrent thumbnail generation (default: 2 for Surface Pro 8)
        """
        self.queue: Queue[ThumbnailJob] = Queue()
        self.jobs: Dict[str, ThumbnailJob] = {}
        self.max_workers = max_workers
        self.workers: List[asyncio.Task] = []
        self._running = False
        
        logger.info(f"Thumbnail queue initialized with {max_workers} workers")
    
    def _generate_job_id(self, path: str) -> str:
        """Generate unique job ID from file path."""
        return hashlib.sha1(path.encode()).hexdigest()[:12]
    
    async def add_job(self, path: str) -> str:
        """
        Add a new thumbnail generation job to the queue.
        
        Args:
            path: Path to media file
        
        Returns:
            Job ID for tracking progress
        """
        from .cloud_storage_manager import cloud_manager
        from pathlib import Path

        job_id = self._generate_job_id(path)
        
        # Check if job already exists
        if job_id in self.jobs:
            existing_job = self.jobs[job_id]
            if existing_job.status in ["pending", "processing"]:
                logger.info(f"Job {job_id} already in queue, skipping")
                return job_id
            elif existing_job.status == "done":
                # If force is True, we might re-do it, but for now skip
                logger.info(f"Job {job_id} already completed, skipping")
                return job_id
        
        # Cloud check removed to restore thumbnails for OneDrive users
        # effectively reverting the "skip cloud files" logic
        # We will handle memory usage by cleaning up after each job instead.

        # Create new job
        job = ThumbnailJob(id=job_id, path=path)
        self.jobs[job_id] = job
        await self.queue.put(job)
        return job_id
    
    async def add_batch(self, paths: List[str]) -> List[str]:
        """
        Add multiple jobs to the queue.
        
        Args:
            paths: List of file paths
        
        Returns:
            List of job IDs
        """
        job_ids = []
        for path in paths:
            job_id = await self.add_job(path)
            job_ids.append(job_id)
        
        logger.info(f"Added batch of {len(paths)} jobs")
        return job_ids
    
    def get_job(self, job_id: str) -> Optional[ThumbnailJob]:
        """Get job by ID."""
        return self.jobs.get(job_id)
    
    def get_queue_stats(self) -> dict:
        """Get current queue statistics."""
        pending = sum(1 for j in self.jobs.values() if j.status == "pending")
        processing = sum(1 for j in self.jobs.values() if j.status == "processing")
        done = sum(1 for j in self.jobs.values() if j.status == "done")
        error = sum(1 for j in self.jobs.values() if j.status == "error")
        
        return {
            "total": len(self.jobs),
            "pending": pending,
            "processing": processing,
            "done": done,
            "error": error,
            "workers": len(self.workers),
            "max_workers": self.max_workers,
        }
    
    async def _worker(self, worker_id: int):
        """
        Worker coroutine that processes jobs from the queue.
        
        Args:
            worker_id: Worker identifier
        """
        from .thumbnails import generate_thumbnail_sync
        from pathlib import Path
        
        logger.info(f"Worker {worker_id} started")
        
        while self._running:
            try:
                # Get job from queue (with timeout to allow graceful shutdown)
                try:
                    job = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                
                logger.info(f"Worker {worker_id} processing job {job.id}")
                
                # Update job status
                job.status = "processing"
                job.started_at = datetime.now()
                job.progress = 0.0
                
                try:
                    # Generate thumbnail (blocking operation, run in thread pool)
                    media_root = Path("C:/Users/Original")  # TODO: Get from config
                    await asyncio.to_thread(
                        generate_thumbnail_sync,
                        job.path,
                        media_root
                    )
                    
                    # Mark as complete
                    job.status = "done"
                    job.progress = 100.0
                    job.completed_at = datetime.now()
                    
                    duration = (job.completed_at - job.started_at).total_seconds()
                    logger.info(f"Worker {worker_id} completed job {job.id} in {duration:.2f}s")
                    
                except Exception as e:
                    # Mark as error
                    job.status = "error"
                    job.error = str(e)
                    job.completed_at = datetime.now()
                    
                    logger.error(f"Worker {worker_id} failed job {job.id}: {e}")
                
                finally:
                    self.queue.task_done()
                    # Explicit cleanup after each job to prevent memory accumulation
                    # especially important when processing cloud files
                    import gc
                    gc.collect()
                    try:
                        import ctypes
                        from ctypes import windll
                        # Reduce working set logic (same as used in streaming)
                        pid = ctypes.windll.kernel32.GetCurrentProcessId()
                        handle = ctypes.windll.kernel32.OpenProcess(0x001F0FFF, False, pid)
                        if handle:
                            ctypes.windll.psapi.EmptyWorkingSet(handle)
                            ctypes.windll.kernel32.CloseHandle(handle)
                    except:
                        pass
                    
            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}")
        
        logger.info(f"Worker {worker_id} stopped")
    
    async def start(self):
        """Start the queue workers."""
        if self._running:
            logger.warning("Queue already running")
            return
        
        self._running = True
        
        # Start workers
        for i in range(self.max_workers):
            worker = asyncio.create_task(self._worker(i))
            self.workers.append(worker)
        
        logger.info(f"Started {self.max_workers} workers")
    
    async def stop(self):
        """Stop the queue workers."""
        if not self._running:
            return
        
        self._running = False
        
        # Wait for workers to finish
        await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()
        
        logger.info("All workers stopped")


# Global queue instance
thumbnail_queue = ThumbnailQueue(max_workers=2)  # Optimized for Surface Pro 8
