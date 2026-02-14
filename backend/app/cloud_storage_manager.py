"""
Cloud Storage Manager - Detect and manage cloud-mounted directories
Prevents RAM cache bloat from OneDrive, Google Drive, Rclone mounts
"""

import os
import platform
from pathlib import Path
from typing import Optional, List, Tuple
import logging

logger = logging.getLogger("cloud_storage_manager")


class CloudProvider:
    """Enumeration of supported cloud providers"""
    ONEDRIVE = "onedrive"
    ONEDRIVE_BUSINESS = "onedrive_business"
    GOOGLE_DRIVE = "google_drive"
    RCLONE = "rclone"
    DROPBOX = "dropbox"
    UNKNOWN = "unknown"


class CloudStorageManager:
    """
    Detects and manages cloud-mounted directories to prevent memory issues.
    
    OneDrive and other cloud storage clients cache files in RAM when accessed,
    which can cause severe memory bloat when scanning large libraries.
    """
    
    # OneDrive markers (Windows)
    ONEDRIVE_MARKERS = [
        ".849C9593-D756-4E56-8D6E-42412F2A707B",  # OneDrive Personal
        "desktop.ini",  # Contains OneDrive metadata
    ]
    
    # Common cloud storage paths (Windows)
    ONEDRIVE_PATHS = [
        "OneDrive",
        "OneDrive - Personal",
        "OneDrive - ",  # Business accounts
    ]
    
    GOOGLE_DRIVE_PATHS = [
        "Google Drive",
        "GoogleDrive",
    ]
    
    DROPBOX_PATHS = [
        "Dropbox",
    ]
    
    def __init__(self):
        self.detected_cloud_paths: List[Tuple[Path, str]] = []
        self._cache = {}
    
    def is_cloud_path(self, path: Path) -> Tuple[bool, Optional[str]]:
        """
        Check if a path is cloud-backed.
        
        Args:
            path: Path to check
            
        Returns:
            (is_cloud, provider_name) tuple
        """
        # Check cache first
        path_str = str(path.resolve())
        if path_str in self._cache:
            return self._cache[path_str]
        
        result = self._detect_cloud_provider(path)
        self._cache[path_str] = result
        return result
    
    def _detect_cloud_provider(self, path: Path) -> Tuple[bool, Optional[str]]:
        """
        Detect which cloud provider (if any) manages this path.
        
        Returns:
            (is_cloud, provider_name) tuple
        """
        if not path.exists():
            return (False, None)
        
        path_str = str(path.resolve())
        
        # Check OneDrive
        if self._is_onedrive_path(path):
            return (True, CloudProvider.ONEDRIVE)
        
        # Check Google Drive
        if self._is_google_drive_path(path):
            return (True, CloudProvider.GOOGLE_DRIVE)
        
        # Check Dropbox
        if self._is_dropbox_path(path):
            return (True, CloudProvider.DROPBOX)
        
        # Check Rclone mount
        if self._is_rclone_mount(path):
            return (True, CloudProvider.RCLONE)
        
        return (False, None)
    
    def _is_onedrive_path(self, path: Path) -> bool:
        """Check if path is in OneDrive"""
        path_str = str(path.resolve())
        
        # Check path contains OneDrive folder names
        for onedrive_marker in self.ONEDRIVE_PATHS:
            if onedrive_marker in path_str:
                return True
        
        # Check for OneDrive marker files
        # Walk up the directory tree looking for markers
        current = path if path.is_dir() else path.parent
        for _ in range(10):  # Limit depth to prevent infinite loop
            for marker in self.ONEDRIVE_MARKERS:
                marker_path = current / marker
                if marker_path.exists():
                    logger.info(f"Detected OneDrive path: {path} (marker: {marker})")
                    return True
            
            # Move up one level
            parent = current.parent
            if parent == current:  # Reached root
                break
            current = parent
        
        # Check Windows registry for OneDrive paths (Windows only)
        if platform.system() == "Windows":
            try:
                import winreg
                
                # Check personal OneDrive
                try:
                    key = winreg.OpenKey(
                        winreg.HKEY_CURRENT_USER,
                        r"Software\Microsoft\OneDrive\Accounts\Personal"
                    )
                    onedrive_path, _ = winreg.QueryValueEx(key, "UserFolder")
                    winreg.CloseKey(key)
                    
                    if path_str.startswith(onedrive_path):
                        logger.info(f"Detected OneDrive path via registry: {path}")
                        return True
                except (FileNotFoundError, OSError):
                    pass
                
                # Check business OneDrive accounts
                try:
                    accounts_key = winreg.OpenKey(
                        winreg.HKEY_CURRENT_USER,
                        r"Software\Microsoft\OneDrive\Accounts"
                    )
                    
                    # Enumerate all subkeys
                    i = 0
                    while True:
                        try:
                            account_name = winreg.EnumKey(accounts_key, i)
                            if account_name != "Personal":
                                account_key = winreg.OpenKey(accounts_key, account_name)
                                try:
                                    folder_path, _ = winreg.QueryValueEx(account_key, "UserFolder")
                                    if path_str.startswith(folder_path):
                                        logger.info(f"Detected OneDrive Business path: {path}")
                                        winreg.CloseKey(account_key)
                                        winreg.CloseKey(accounts_key)
                                        return True
                                except (FileNotFoundError, OSError):
                                    pass
                                winreg.CloseKey(account_key)
                            i += 1
                        except OSError:
                            break
                    
                    winreg.CloseKey(accounts_key)
                except (FileNotFoundError, OSError):
                    pass
                    
            except ImportError:
                pass  # winreg not available
        
        return False
    
    def _is_google_drive_path(self, path: Path) -> bool:
        """Check if path is in Google Drive"""
        path_str = str(path.resolve())
        
        for gdrive_marker in self.GOOGLE_DRIVE_PATHS:
            if gdrive_marker in path_str:
                logger.info(f"Detected Google Drive path: {path}")
                return True
        
        return False
    
    def _is_dropbox_path(self, path: Path) -> bool:
        """Check if path is in Dropbox"""
        path_str = str(path.resolve())
        
        for dropbox_marker in self.DROPBOX_PATHS:
            if dropbox_marker in path_str:
                logger.info(f"Detected Dropbox path: {path}")
                return True
        
        return False
    
    def _is_rclone_mount(self, path: Path) -> bool:
        """
        Check if path is an Rclone mount.
        
        Rclone mounts are harder to detect, but we can check:
        - Mount points in /mnt or drive letters on Windows
        - Presence of .rclone-cache directory
        """
        # Check for .rclone-cache directory (used by VFS cache)
        current = path if path.is_dir() else path.parent
        for _ in range(10):
            cache_dir = current / ".rclone-cache"
            if cache_dir.exists() and cache_dir.is_dir():
                logger.info(f"Detected Rclone mount: {path}")
                return True
            
            parent = current.parent
            if parent == current:
                break
            current = parent
        
        return False
    
    def scan_for_cloud_paths(self, root_path: Path) -> List[Tuple[Path, str]]:
        """
        Scan a directory tree for cloud-backed paths.
        
        Args:
            root_path: Root directory to scan
            
        Returns:
            List of (path, provider) tuples
        """
        cloud_paths = []
        
        try:
            for item in root_path.rglob("*"):
                if item.is_dir():
                    is_cloud, provider = self.is_cloud_path(item)
                    if is_cloud:
                        cloud_paths.append((item, provider))
                        logger.warning(f"Found cloud path: {item} (provider: {provider})")
        except Exception as e:
            logger.error(f"Error scanning for cloud paths: {e}")
        
        self.detected_cloud_paths = cloud_paths
        return cloud_paths
    
    def get_cloud_warning_message(self, path: Path, provider: str) -> str:
        """
        Get a user-friendly warning message for cloud paths.
        
        Args:
            path: Cloud path
            provider: Provider name
            
        Returns:
            Warning message
        """
        messages = {
            CloudProvider.ONEDRIVE: (
                f"⚠️ WARNING: '{path}' is in OneDrive.\n"
                "Scanning this folder will cause OneDrive to download files to RAM, "
                "which can quickly fill your memory.\n\n"
                "Recommendations:\n"
                "1. Exclude this path from library scanning\n"
                "2. Use Telegram Cloud Storage instead (automatic file splitting for large files)\n"
                "3. Or move files to a local directory first"
            ),
            CloudProvider.GOOGLE_DRIVE: (
                f"⚠️ WARNING: '{path}' is in Google Drive.\n"
                "Scanning this folder may trigger file downloads and consume RAM.\n\n"
                "Consider using Telegram Cloud Storage or moving files locally."
            ),
            CloudProvider.RCLONE: (
                f"⚠️ WARNING: '{path}' appears to be an Rclone mount.\n"
                "Accessing files may trigger downloads and consume bandwidth/RAM.\n\n"
                "Consider using Telegram Cloud Storage for better integration."
            ),
            CloudProvider.DROPBOX: (
                f"⚠️ WARNING: '{path}' is in Dropbox.\n"
                "Scanning this folder may trigger file downloads.\n\n"
                "Consider using Telegram Cloud Storage or moving files locally."
            ),
        }
        
        return messages.get(provider, f"⚠️ WARNING: '{path}' appears to be cloud-backed.")
    
    def clear_cache(self):
        """Clear the detection cache"""
        self._cache.clear()


# Global instance
cloud_manager = CloudStorageManager()
