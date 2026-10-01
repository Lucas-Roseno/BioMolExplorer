import os
from pathlib import Path

# This dynamically calculates the absolute path to the BioMolExplorer root directory.
# Since this file is located at apps/python-service/BioMolExplorer/src/kernel/config.py
# The parent path resolution is as follows:
#   parent 1: kernel
#   parent 2: src
#   parent 3: BioMolExplorer
BIOMOL_ROOT = str(Path(__file__).resolve().parent.parent.parent) + "/"

# Historically, BioMolExplorer represented package-relative directories with a
# leading slash (for example ``/datasets/PDB``).  A leading slash normally means
# an operating-system absolute path, which became ambiguous once users could
# choose a real absolute workspace path.  Keep the legacy virtual roots working
# while preserving genuine absolute paths such as /home/... and /tmp/....
LEGACY_VIRTUAL_ROOTS = frozenset({
    "apps",
    "datasets",
    "logs",
    "resultados",
    "src",
})


def resolve_biomol_path(path: str | os.PathLike | None) -> str:
    """Resolve a BioMolExplorer directory and always return a trailing slash.

    - ``/datasets/...`` and other historical virtual roots are relative to
      ``BIOMOL_ROOT``.
    - Genuine absolute paths remain absolute.
    - Relative paths are resolved below ``BIOMOL_ROOT``.
    """
    if path is None or str(path).strip() == "":
        resolved = Path(BIOMOL_ROOT)
    else:
        raw = Path(path).expanduser()
        parts = raw.parts
        is_legacy_virtual = raw.is_absolute() and len(parts) > 1 and parts[1] in LEGACY_VIRTUAL_ROOTS

        if raw.is_absolute() and not is_legacy_virtual:
            resolved = raw
        else:
            relative = str(raw).lstrip("/\\")
            resolved = Path(BIOMOL_ROOT) / relative

    return os.path.join(str(resolved.resolve(strict=False)), "")
