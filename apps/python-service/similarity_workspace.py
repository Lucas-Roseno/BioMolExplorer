"""Workspace-scoped input preparation for molecular similarity analysis.

The ChEMBL crawler stores one CSV per molecule under ``molecules/<target>``
and ``similars/<target>``.  The original scientific pipeline expects two
consolidated CSV files.  This adapter bridges those layouts without making the
legacy ``datasets/ChEMBL/DrugBank`` folder a requirement.
"""

from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path

import pandas as pd


REQUIRED_COLUMNS = ("molecule_chembl_id", "canonical_smiles")


class SimilarityInputError(ValueError):
    """A workspace has no usable molecular data for similarity analysis."""


def _normalized(value: str) -> str:
    return "".join(value.split()).casefold()


def _target_directory(root: Path, target: str) -> Path | None:
    if not root.is_dir():
        return None
    expected = _normalized(target)
    return next((entry for entry in root.iterdir() if entry.is_dir() and _normalized(entry.name) == expected), None)


def _smiles(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        data = ast.literal_eval(value)
    except (SyntaxError, ValueError):
        try:
            data = json.loads(value)
        except (TypeError, ValueError):
            return None
    result = data.get("canonical_smiles") if isinstance(data, dict) else None
    return result.strip() if isinstance(result, str) and result.strip() else None


def _load_partition(directory: Path | None) -> pd.DataFrame:
    if directory is None:
        return pd.DataFrame(columns=REQUIRED_COLUMNS)
    frames: list[pd.DataFrame] = []
    for csv_file in sorted(directory.glob("*.csv")):
        try:
            frame = pd.read_csv(csv_file, usecols=lambda name: name in {
                "molecule_chembl_id", "canonical_smiles", "molecule_structures",
            })
        except (OSError, ValueError, pd.errors.ParserError):
            continue
        if "molecule_chembl_id" not in frame:
            continue
        if "canonical_smiles" not in frame:
            if "molecule_structures" not in frame:
                continue
            frame["canonical_smiles"] = frame["molecule_structures"].map(_smiles)
        frames.append(frame.loc[:, list(REQUIRED_COLUMNS)])
    if not frames:
        return pd.DataFrame(columns=REQUIRED_COLUMNS)
    merged = pd.concat(frames, ignore_index=True)
    merged = merged.dropna(subset=list(REQUIRED_COLUMNS))
    merged = merged[merged["canonical_smiles"].astype(str).str.strip() != ""]
    return merged.drop_duplicates(subset="molecule_chembl_id", keep="first")


def available_targets(chembl_root: Path) -> list[str]:
    targets: dict[str, str] = {}
    for partition in ("molecules", "similars"):
        folder = chembl_root / partition
        if folder.is_dir():
            for entry in folder.iterdir():
                if entry.is_dir() and any(entry.glob("*.csv")):
                    targets.setdefault(_normalized(entry.name), entry.name)
    legacy = chembl_root / "DrugBank"
    if legacy.is_dir():
        for entry in legacy.glob("*_MOLS.csv"):
            targets.setdefault(_normalized(entry.stem.removesuffix("_MOLS")), entry.stem.removesuffix("_MOLS"))
    return sorted(targets.values(), key=str.casefold)


def _source_signature(files: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(files):
        stat = path.stat()
        digest.update(str(path).encode())
        digest.update(f"{stat.st_size}:{stat.st_mtime_ns}".encode())
    return digest.hexdigest()


def prepare_inputs(workspace_root: Path, target: str) -> tuple[Path, dict]:
    """Materialize MOLS/SIMS files under resultados, returning their metadata."""
    chembl_root = workspace_root / "datasets" / "ChEMBL"
    molecules_dir = _target_directory(chembl_root / "molecules", target)
    similars_dir = _target_directory(chembl_root / "similars", target)
    mols = _load_partition(molecules_dir)
    sims = _load_partition(similars_dir)

    # Existing imported/legacy datasets remain supported, but are copied into
    # the workspace result area so scientific processing never mutates inputs.
    legacy_root = chembl_root / "DrugBank"
    if mols.empty:
        legacy = legacy_root / f"{target}_MOLS.csv"
        if legacy.is_file():
            mols = pd.read_csv(legacy, usecols=list(REQUIRED_COLUMNS)).dropna().drop_duplicates("molecule_chembl_id")
    if sims.empty:
        legacy = legacy_root / f"{target}_SIMS.csv"
        if legacy.is_file():
            sims = pd.read_csv(legacy, usecols=list(REQUIRED_COLUMNS)).dropna().drop_duplicates("molecule_chembl_id")

    if mols.empty and sims.empty:
        raise SimilarityInputError(f"No usable molecular records were found for '{target}' in this workspace.")
    if not mols.empty:
        sims = sims[~sims["molecule_chembl_id"].isin(set(mols["molecule_chembl_id"]))]

    safe_target = target.replace("/", "_").replace("\\", "_")
    input_dir = workspace_root / "resultados" / "similarity" / "inputs" / safe_target
    input_dir.mkdir(parents=True, exist_ok=True)
    if not mols.empty:
        mols.to_csv(input_dir / f"{target}_MOLS.csv", index=False)
    if not sims.empty:
        sims.to_csv(input_dir / f"{target}_SIMS.csv", index=False)

    source_files = [*([] if molecules_dir is None else list(molecules_dir.glob("*.csv"))), *([] if similars_dir is None else list(similars_dir.glob("*.csv")))]
    if not source_files:
        source_files = list(legacy_root.glob(f"{target}_MOLS.csv")) + list(legacy_root.glob(f"{target}_SIMS.csv"))
    metadata = {
        "target": target,
        "source_signature": _source_signature(source_files),
        "mols": int(len(mols)),
        "sims": int(len(sims)),
        "input_dir": str(input_dir),
    }
    (input_dir / "manifest.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return input_dir, metadata
