"""
workspace.py — BioMolExplorer Workspace Module

Manages per-user workspaces stored in ~/.biomolexplorer/users/<username>/workspaces/.
Each workspace is an isolated directory containing that user's datasets and results.
"""

import os
import re
import shutil
from pathlib import Path
from datetime import datetime

from auth import BIOMOL_DATA_DIR

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WORKSPACE_NAME_MAX_LEN = 48
WORKSPACE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9 _\-\.]+$")

# Sub-directories that are automatically created inside a new workspace
WORKSPACE_SUBDIRS = [
    "datasets/PDB",
    "datasets/ChEMBL",
    "datasets/ZINC",
    "resultados/docking",
    "resultados/admet",
    "uploads",
]


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def _user_root(username: str) -> Path:
    return BIOMOL_DATA_DIR / "users" / username


def _workspaces_root(username: str) -> Path:
    return _user_root(username) / "workspaces"


def _workspace_registry_path(username: str, workspace_name: str) -> Path:
    """Return the internal registry directory for a workspace."""
    return _workspaces_root(username) / workspace_name


def resolve_workspace_path(username: str, workspace_name: str) -> Path:
    """
    Return the absolute Path to a workspace directory.
    This is the central function that replaces all hardcoded BASE_PATH
    constants in app.py — every file operation should resolve through here.

    Raises ValueError for path-traversal attempts.
    """
    # Never trust X-Workspace as a filesystem fragment. In particular,
    # ``Path(base) / '/tmp'`` discards ``base`` entirely, so checking only for
    # ``..`` would allow an authenticated request to select an arbitrary
    # absolute directory.
    _validate_workspace_name(workspace_name)
    if not username or any(separator in username for separator in ("/", "\\")) or ".." in username:
        raise ValueError("Invalid username or workspace name.")

    registry_path = _workspace_registry_path(username, workspace_name)
    if not registry_path.is_dir():
        raise ValueError(f"Workspace '{workspace_name}' not found.")
    meta_path = registry_path / ".workspace.json"
    if meta_path.is_file():
        try:
            import json
            storage_path = json.loads(meta_path.read_text()).get("storage_path")
            if storage_path:
                return Path(storage_path).expanduser().resolve()
        except (OSError, ValueError, TypeError):
            pass

    # Backward compatibility: old workspaces stored their data directly in
    # the registry directory and did not have a storage_path metadata field.
    return registry_path


# ---------------------------------------------------------------------------
# Dataset sub-path shortcuts  (mirrors the old hardcoded constants)
# ---------------------------------------------------------------------------

def pdb_path(username: str, workspace_name: str) -> Path:
    return resolve_workspace_path(username, workspace_name) / "datasets" / "PDB"


def chembl_path(username: str, workspace_name: str) -> Path:
    return resolve_workspace_path(username, workspace_name) / "datasets" / "ChEMBL"


def zinc_path(username: str, workspace_name: str) -> Path:
    return resolve_workspace_path(username, workspace_name) / "datasets" / "ZINC"


def results_path(username: str, workspace_name: str) -> Path:
    return resolve_workspace_path(username, workspace_name) / "resultados"


def uploads_path(username: str, workspace_name: str) -> Path:
    return resolve_workspace_path(username, workspace_name) / "uploads"


# ---------------------------------------------------------------------------
# Workspace CRUD
# ---------------------------------------------------------------------------

def create_workspace(
    username: str,
    workspace_name: str,
    storage_parent: str | None = None,
) -> dict:
    """
    Create a new workspace directory tree for a user.
    Raises ValueError on invalid name or if the workspace already exists.
    """
    workspace_name = workspace_name.strip()
    _validate_workspace_name(workspace_name)

    registry_path = _workspace_registry_path(username, workspace_name)
    if registry_path.exists():
        raise ValueError(f"Workspace '{workspace_name}' already exists.")

    if storage_parent:
        parent = Path(storage_parent).expanduser()
        if not parent.is_absolute():
            raise ValueError("Workspace folder must be an absolute path.")
        parent = parent.resolve()
        if not parent.is_dir():
            raise ValueError("The selected parent folder does not exist.")
        if not os.access(parent, os.W_OK | os.X_OK):
            raise ValueError("The selected parent folder is not writable.")
        ws_path = parent / workspace_name
        if ws_path.exists():
            raise ValueError(f"Folder '{ws_path}' already exists.")
    else:
        ws_path = registry_path

    workspace_created = False
    registry_created = False
    try:
        # Internal storage may be the user's very first workspace, so its
        # registry parents do not exist yet. External storage deliberately
        # requires an existing parent selected by the user.
        ws_path.mkdir(parents=ws_path == registry_path, exist_ok=False)
        workspace_created = True
        for sub in WORKSPACE_SUBDIRS:
            (ws_path / sub).mkdir(parents=True, exist_ok=False)

        # External workspaces keep a small internal registry entry so they can
        # be listed without scanning arbitrary disks.
        if registry_path != ws_path:
            registry_path.mkdir(parents=True, exist_ok=False)
            registry_created = True
    except OSError as exc:
        if workspace_created and ws_path.exists():
            shutil.rmtree(ws_path)
        if registry_created and registry_path.exists():
            shutil.rmtree(registry_path)
        detail = exc.strerror or str(exc)
        raise ValueError(f"Could not create workspace folder: {detail}.") from exc
    except Exception:
        if workspace_created and ws_path.exists():
            shutil.rmtree(ws_path)
        if registry_created and registry_path.exists():
            shutil.rmtree(registry_path)
        raise

    # Write metadata file
    meta_path = registry_path / ".workspace.json"
    import json
    meta = {
        "name": workspace_name,
        "created_at": datetime.utcnow().isoformat(),
        "owner": username,
        "storage_path": str(ws_path.resolve()),
    }
    try:
        meta_json = json.dumps(meta, indent=2)
        meta_path.write_text(meta_json)
        external_meta_path = ws_path / ".workspace.json"
        if external_meta_path != meta_path:
            external_meta_path.write_text(meta_json)
    except OSError as exc:
        if workspace_created and ws_path.exists():
            shutil.rmtree(ws_path)
        if registry_created and registry_path.exists():
            shutil.rmtree(registry_path)
        detail = exc.strerror or str(exc)
        raise ValueError(f"Could not write workspace metadata: {detail}.") from exc
    except Exception:
        if workspace_created and ws_path.exists():
            shutil.rmtree(ws_path)
        if registry_created and registry_path.exists():
            shutil.rmtree(registry_path)
        raise

    return _workspace_info(username, registry_path)


def list_workspaces(username: str) -> list[dict]:
    """Return info dicts for all workspaces belonging to a user."""
    root = _workspaces_root(username)
    if not root.exists():
        return []

    workspaces = []
    for entry in sorted(root.iterdir()):
        if entry.is_dir():
            workspaces.append(_workspace_info(username, entry))
    return workspaces


def list_all_workspaces() -> list[dict]:
    """
    Return workspace info for ALL users.  Admin-only view — read only.
    """
    users_root = BIOMOL_DATA_DIR / "users"
    if not users_root.exists():
        return []

    result = []
    for user_dir in sorted(users_root.iterdir()):
        if user_dir.is_dir():
            username = user_dir.name
            for ws in list_workspaces(username):
                ws["owner"] = username
                result.append(ws)
    return result


def delete_workspace(username: str, workspace_name: str) -> None:
    """
    Permanently delete a workspace and all its contents.
    Raises ValueError if the workspace does not exist.
    """
    registry_path = _workspace_registry_path(username, workspace_name)
    if not registry_path.exists():
        raise ValueError(f"Workspace '{workspace_name}' not found.")
    ws_path = resolve_workspace_path(username, workspace_name)
    if ws_path.exists():
        shutil.rmtree(ws_path)
    if registry_path != ws_path and registry_path.exists():
        shutil.rmtree(registry_path)


def workspace_exists(username: str, workspace_name: str) -> bool:
    return _workspace_registry_path(username, workspace_name).is_dir()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _workspace_info(username: str, registry_path: Path) -> dict:
    """Build a JSON-serialisable dict describing a workspace."""
    import json

    meta_path = registry_path / ".workspace.json"
    created_at = None
    storage_path = registry_path
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            created_at = meta.get("created_at")
            if meta.get("storage_path"):
                storage_path = Path(meta["storage_path"]).expanduser().resolve()
        except Exception:
            pass

    # Calculate rough disk usage (non-recursive for speed)
    size_bytes = sum(
        f.stat().st_size
        for f in storage_path.rglob("*")
        if f.is_file() and f.name != ".workspace.json"
    )

    return {
        "name": registry_path.name,
        "path": str(storage_path),
        "created_at": created_at,
        "owner": username,
        "size_bytes": size_bytes,
    }


def _validate_workspace_name(name: str) -> None:
    if not name:
        raise ValueError("Workspace name cannot be empty.")
    if len(name) > WORKSPACE_NAME_MAX_LEN:
        raise ValueError(f"Workspace name must be at most {WORKSPACE_NAME_MAX_LEN} characters.")
    if not WORKSPACE_NAME_PATTERN.match(name):
        raise ValueError(
            "Workspace name may only contain letters, numbers, spaces, hyphens, underscores, and dots."
        )
    if name in {".", ".."}:
        raise ValueError("Workspace name cannot be '.' or '..'.")
