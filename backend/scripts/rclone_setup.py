
import sys
import subprocess
import os
from pathlib import Path

def check_rclone():
    try:
        subprocess.run(["rclone", "--version"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return "rclone"
    except FileNotFoundError:
        # Check common locations
        common_paths = [
            Path(os.environ["USERPROFILE"]) / "scoop/apps/rclone/current/rclone.exe",
            Path("C:/ProgramData/chocolatey/bin/rclone.exe"),
        ]
        for p in common_paths:
            if p.exists():
                return str(p)
        return None

def list_remotes(rclone_bin):
    try:
        result = subprocess.run([rclone_bin, "listremotes"], check=True, stdout=subprocess.PIPE, text=True)
        remotes = [r.strip() for r in result.stdout.splitlines() if r.strip()]
        return remotes
    except Exception as e:
        print(f"Error listing remotes: {e}")
        return []

def main():
    print("--- DRAM Media Server Rclone Helper ---")
    
    rclone_bin = check_rclone()
    if not rclone_bin:
        print("Error: Rclone not found in PATH or standard locations.")
        print("Please install Rclone from https://rclone.org/downloads/")
        print("Or add it to your PATH environment variable.")
        return

    print(f"Rclone found: {rclone_bin}")
    
    remotes = list_remotes(rclone_bin)
    if not remotes:
        print("\nNo remotes found.")
        print("Run 'rclone config' to setup Google Drive or OneDrive.")
        return

    print("\nAvailable Remotes:")
    for i, remote in enumerate(remotes):
        print(f"{i+1}. {remote}")
        
    print("\nTo mount a remote as a drive (for Thumbnail reuse):")
    print("1. Pick a remote (e.g. 'gdrive:')")
    print("2. Pick a drive letter (e.g. 'Z:')")
    print("3. Run the following command:")
    
    print("\n---------------------------------------------------")
    print(f"{rclone_bin} mount REMOTE: Z: --vfs-cache-mode full")
    print("---------------------------------------------------")
    
    print("\nAfter mounting, run 'migrate_paths.py' to update the database.")
    print("Example: python migrate_paths.py --old \"C:\\Users\\...\\OneDrive\" --new \"Z:\" --execute")

if __name__ == "__main__":
    main()
