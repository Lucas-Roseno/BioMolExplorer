"""
auth.py — BioMolExplorer Authentication Module

Handles user management (admin/regular users), password hashing with bcrypt,
and session token lifecycle. All data is stored in ~/.biomolexplorer/auth.db
which is completely outside the repository and .deb package.
"""

import os
import sqlite3
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from contextlib import contextmanager

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BIOMOL_DATA_DIR = Path.home() / ".biomolexplorer"
AUTH_DB_PATH    = BIOMOL_DATA_DIR / "auth.db"
SESSION_TTL_HOURS = 24

# ---------------------------------------------------------------------------
# Database bootstrapping
# ---------------------------------------------------------------------------

def ensure_data_dir() -> None:
    """Create ~/.biomolexplorer/ if it does not exist."""
    BIOMOL_DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_db_connection() -> sqlite3.Connection:
    """Return a thread-safe SQLite connection with row_factory enabled."""
    conn = sqlite3.connect(str(AUTH_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db_conn():
    """Context manager that auto-commits or rolls back."""
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """
    Initialize the SQLite schema. Safe to call multiple times (IF NOT EXISTS).
    Must be called once at application startup.
    """
    ensure_data_dir()
    with db_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
                password   TEXT    NOT NULL,
                is_admin   INTEGER NOT NULL DEFAULT 0,
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT    PRIMARY KEY,
                user_id    INTEGER NOT NULL,
                expires_at TEXT    NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)


# ---------------------------------------------------------------------------
# Password helpers (bcrypt via passlib — falls back to hashlib+pbkdf2 if
# bcrypt is not available, preserving the same API surface)
# ---------------------------------------------------------------------------

def _hash_password(plain: str) -> str:
    """Hash a plain-text password.  Uses bcrypt when available."""
    try:
        import bcrypt  # type: ignore
        hashed = bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12))
        return hashed.decode()
    except ImportError:
        # Fallback: PBKDF2-HMAC-SHA256 with a random salt (still secure)
        salt = secrets.token_hex(32)
        dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), 600_000)
        return f"pbkdf2${salt}${dk.hex()}"


def _verify_password(plain: str, stored: str) -> bool:
    """Verify a plain-text password against a stored hash."""
    try:
        import bcrypt  # type: ignore
        return bcrypt.checkpw(plain.encode(), stored.encode())
    except ImportError:
        if stored.startswith("pbkdf2$"):
            _, salt, dk_hex = stored.split("$", 2)
            dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), 600_000)
            return secrets.compare_digest(dk.hex(), dk_hex)
        return False


# ---------------------------------------------------------------------------
# Setup detection
# ---------------------------------------------------------------------------

def setup_required() -> bool:
    """Return True if no admin user exists yet (fresh installation)."""
    init_db()
    with db_conn() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE is_admin = 1 LIMIT 1"
        ).fetchone()
    return row is None


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------

def create_admin(username: str, password: str) -> dict:
    """
    Create the first administrator account.
    Raises ValueError if an admin already exists or inputs are invalid.
    """
    username = username.strip()
    _validate_username(username)
    _validate_password(password)

    if not setup_required():
        raise ValueError("An admin account already exists.")

    pw_hash = _hash_password(password)
    with db_conn() as conn:
        conn.execute(
            "INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)",
            (username, pw_hash),
        )
    return {"username": username, "is_admin": True}


def create_user(username: str, password: str, requesting_user_id: int) -> dict:
    """
    Create a regular user. Only an admin may call this.
    Raises PermissionError or ValueError on failure.
    """
    _assert_admin(requesting_user_id)
    username = username.strip()
    _validate_username(username)
    _validate_password(password)

    pw_hash = _hash_password(password)
    try:
        with db_conn() as conn:
            conn.execute(
                "INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)",
                (username, pw_hash),
            )
    except sqlite3.IntegrityError:
        raise ValueError(f"Username '{username}' is already taken.")
    return {"username": username, "is_admin": False}


def delete_user(target_user_id: int, requesting_user_id: int) -> None:
    """
    Permanently delete a user and all their data.
    - Admin cannot delete themselves.
    - Only admin can delete users.
    Cascade deletion of sessions is handled by the FK ON DELETE CASCADE.
    """
    _assert_admin(requesting_user_id)

    if target_user_id == requesting_user_id:
        raise ValueError("Administrators cannot delete their own account.")

    with db_conn() as conn:
        row = conn.execute(
            "SELECT username, is_admin FROM users WHERE id = ?", (target_user_id,)
        ).fetchone()
        if row is None:
            raise ValueError("User not found.")
        if row["is_admin"]:
            raise ValueError("Cannot delete another administrator account.")
        conn.execute("DELETE FROM users WHERE id = ?", (target_user_id,))

    # Filesystem cleanup: remove ~/.biomolexplorer/users/<username>/
    _delete_user_data_dir(dict(row)["username"])


def list_users(requesting_user_id: int) -> list[dict]:
    """Return a list of all users. Admin-only."""
    _assert_admin(requesting_user_id)
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT id, username, is_admin, created_at FROM users ORDER BY created_at"
        ).fetchall()
    return [dict(r) for r in rows]


def get_user_by_id(user_id: int) -> dict | None:
    """Return a single user dict or None."""
    with db_conn() as conn:
        row = conn.execute(
            "SELECT id, username, is_admin, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def authenticate(username: str, password: str) -> dict | None:
    """
    Validate credentials. Returns user dict on success, None on failure.
    """
    with db_conn() as conn:
        row = conn.execute(
            "SELECT id, username, password, is_admin FROM users WHERE username = ?",
            (username.strip(),),
        ).fetchone()
    if row is None:
        return None
    if not _verify_password(password, row["password"]):
        return None
    return {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}


def generate_token(user_id: int) -> str:
    """Create a new session token for the given user and persist it."""
    token = secrets.token_hex(32)   # 256-bit entropy
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)).isoformat()
    with db_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires_at),
        )
    return token


def validate_token(token: str) -> dict | None:
    """
    Verify a session token. Returns the user dict if valid and not expired,
    None otherwise. Expired tokens are cleaned up automatically.
    """
    if not token:
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    with db_conn() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.username, u.is_admin, s.expires_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()

        if row is None:
            return None

        if row["expires_at"] < now_iso:
            # Token expired — purge it
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            return None

    return {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}


def revoke_token(token: str) -> None:
    """Invalidate a session token (logout)."""
    with db_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def purge_expired_sessions() -> None:
    """Remove all expired sessions from the database. Call periodically."""
    now_iso = datetime.now(timezone.utc).isoformat()
    with db_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now_iso,))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _assert_admin(user_id: int) -> None:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT is_admin FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if row is None or not row["is_admin"]:
        raise PermissionError("Only administrators can perform this action.")


def _validate_username(username: str) -> None:
    import re
    if not username:
        raise ValueError("Username cannot be empty.")
    if len(username) < 3 or len(username) > 32:
        raise ValueError("Username must be between 3 and 32 characters.")
    if not re.match(r"^[a-zA-Z0-9_\-]+$", username):
        raise ValueError("Username may only contain letters, numbers, underscores, and hyphens.")


def _validate_password(password: str) -> None:
    if not password:
        raise ValueError("Password cannot be empty.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")


def _delete_user_data_dir(username: str) -> None:
    """Remove the user's registered workspaces and internal data directory."""
    import shutil
    # Import locally to avoid the auth <-> workspace module import cycle.
    import workspace as workspace_module

    user_dir = BIOMOL_DATA_DIR / "users" / username
    for registered in workspace_module.list_workspaces(username):
        try:
            workspace_module.delete_workspace(username, registered["name"])
        except (OSError, ValueError):
            # Account deletion remains best-effort for unavailable removable
            # disks; the internal registry is removed below in every case.
            pass
    if user_dir.exists():
        shutil.rmtree(user_dir, ignore_errors=True)
