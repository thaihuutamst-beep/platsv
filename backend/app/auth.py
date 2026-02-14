"""
Authentication module for Media Drive - Personal Use Edition

Two modes:
  1. API Key (simple, default) - single shared key for all access
  2. JWT Token (optional) - if you want user login/logout flow

For personal/home use, API Key is recommended.
JWT is available if you ever share access with others.

Usage in main.py:
    from .auth import require_auth, auth_router
    app.include_router(auth_router)

    # Protect any endpoint:
    @app.get("/protected")
    async def secret(user = Depends(require_auth)):
        return {"message": "authenticated", "user": user}
"""

import os
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger("auth")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# API key: set via environment variable or auto-generate on first run
# Store in .env or set: MEDIA_DRIVE_API_KEY=your-secret-key
API_KEY = os.environ.get("MEDIA_DRIVE_API_KEY", "")

# Auth mode: "none" (no auth), "apikey", "jwt"
AUTH_MODE = os.environ.get("MEDIA_DRIVE_AUTH_MODE", "none")

# JWT settings (only used if AUTH_MODE == "jwt")
JWT_SECRET = os.environ.get("MEDIA_DRIVE_JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 7  # 1 week

# ---------------------------------------------------------------------------
# Security scheme
# ---------------------------------------------------------------------------
security = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# JWT helpers (uses python-jose if available, otherwise disabled)
# ---------------------------------------------------------------------------
_HAS_JOSE = False
try:
    from jose import jwt as jose_jwt, JWTError
    _HAS_JOSE = True
except ImportError:
    pass


def create_jwt_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT token. Requires python-jose[cryptography]."""
    if not _HAS_JOSE:
        raise HTTPException(status_code=500, detail="JWT not available. Install: pip install python-jose[cryptography]")
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=JWT_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jose_jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str) -> dict:
    """Verify and decode a JWT token."""
    if not _HAS_JOSE:
        raise HTTPException(status_code=500, detail="JWT not available")
    try:
        payload = jose_jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---------------------------------------------------------------------------
# Password hashing (simple SHA-256 + salt for personal use)
# ---------------------------------------------------------------------------
def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Hash a password with a random salt. Returns (hash, salt)."""
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return hashed, salt


def verify_password(password: str, hashed: str, salt: str) -> bool:
    """Verify a password against its hash."""
    computed, _ = hash_password(password, salt)
    return secrets.compare_digest(computed, hashed)


# ---------------------------------------------------------------------------
# Auth dependency (use in endpoints)
# ---------------------------------------------------------------------------
async def require_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    FastAPI dependency that checks authentication.
    Returns user info dict if authenticated, raises 401 otherwise.

    Behavior depends on AUTH_MODE:
      - "none": always allows (returns {"user": "anonymous"})
      - "apikey": checks Authorization header or ?api_key query param
      - "jwt": checks Bearer token
    """
    if AUTH_MODE == "none":
        return {"user": "anonymous", "mode": "none"}

    if AUTH_MODE == "apikey":
        # Check header first
        token = None
        if credentials and credentials.credentials:
            token = credentials.credentials
        # Check query param fallback
        if not token:
            token = request.query_params.get("api_key", "")
        # Check X-API-Key header
        if not token:
            token = request.headers.get("X-API-Key", "")

        if not token or not API_KEY:
            raise HTTPException(status_code=401, detail="API key required")
        if not secrets.compare_digest(token, API_KEY):
            raise HTTPException(status_code=401, detail="Invalid API key")
        return {"user": "owner", "mode": "apikey"}

    if AUTH_MODE == "jwt":
        if not credentials or not credentials.credentials:
            raise HTTPException(status_code=401, detail="Bearer token required")
        payload = verify_jwt_token(credentials.credentials)
        return {"user": payload.get("sub", "unknown"), "mode": "jwt"}

    return {"user": "anonymous", "mode": "unknown"}


# ---------------------------------------------------------------------------
# Auth Router (login, status, key generation)
# ---------------------------------------------------------------------------
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])


@auth_router.get("/status")
async def auth_status():
    """Check current auth configuration."""
    return {
        "auth_mode": AUTH_MODE,
        "api_key_set": bool(API_KEY),
        "jwt_available": _HAS_JOSE,
    }


@auth_router.post("/login")
async def login(body: dict = Body(...)):
    """
    Login endpoint (JWT mode only).
    Body: {"username": "admin", "password": "your-password"}

    For API key mode, no login is needed - just pass the key.
    """
    if AUTH_MODE != "jwt":
        return {"message": f"Auth mode is '{AUTH_MODE}'. No login needed for this mode."}

    username = body.get("username", "")
    password = body.get("password", "")

    # For personal use: check against env vars
    expected_user = os.environ.get("MEDIA_DRIVE_USER", "admin")
    expected_pass = os.environ.get("MEDIA_DRIVE_PASS", "admin")

    if username != expected_user or password != expected_pass:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_jwt_token({"sub": username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": JWT_EXPIRE_HOURS * 3600,
    }


@auth_router.get("/generate-key")
async def generate_api_key():
    """Generate a random API key (for setup purposes)."""
    key = secrets.token_urlsafe(32)
    return {
        "generated_key": key,
        "instructions": [
            "Set this as your API key:",
            f"  Windows: set MEDIA_DRIVE_API_KEY={key}",
            f"  Linux:   export MEDIA_DRIVE_API_KEY={key}",
            "Also set: MEDIA_DRIVE_AUTH_MODE=apikey",
            "Then restart the server.",
        ],
    }
