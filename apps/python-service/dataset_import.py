"""Secure, transactional import of BioMolExplorer dataset directories.

The browser uploads individual files together with their paths relative to the
selected ``datasets`` directory.  This module validates the complete manifest
before writing anything and stages every file before atomically installing the
PDB and/or ChEMBL trees in a workspace.
"""

from __future__ import annotations

import csv
import io
import os
import re
import shutil
import struct
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Iterable, Sequence


MAX_IMPORT_FILES = int(os.environ.get("BIOMOL_DATASET_IMPORT_MAX_FILES", "25000"))
MAX_IMPORT_BYTES = int(
    os.environ.get("BIOMOL_DATASET_IMPORT_MAX_BYTES", str(10 * 1024**3))
)
MAX_FILE_BYTES = int(
    os.environ.get("BIOMOL_DATASET_IMPORT_MAX_FILE_BYTES", str(512 * 1024**2))
)
MAX_PATH_LENGTH = 512
MAX_SEGMENT_LENGTH = 128

_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _().+-]*$")
_DATASET_TYPES = {"PDB", "ChEMBL"}
_CHEMBL_REQUIRED_DIRS = {"bioactivity", "DrugBank", "molecules", "similars", "targets"}
_DRUGBANK_OPTIONAL_DIRS = {"ADMET", "Fingerprints", "Molecules", "Similarity"}


@dataclass(frozen=True)
class ImportIssue:
    path: str
    reason: str
    code: str

    def as_dict(self) -> dict[str, str]:
        return {"path": self.path, "reason": self.reason, "code": self.code}


@dataclass(frozen=True)
class DatasetManifest:
    paths: tuple[PurePosixPath, ...]
    sources: tuple[str, ...]
    file_count: int


@dataclass(frozen=True)
class UploadItem:
    relative_path: str
    stream: BinaryIO


class DatasetImportError(ValueError):
    def __init__(self, message: str, issues: Sequence[ImportIssue]):
        super().__init__(message)
        self.issues = list(issues)


def _issue(path: str, reason: str, code: str) -> ImportIssue:
    return ImportIssue(path=path or "datasets", reason=reason, code=code)


def _normalise_path(raw_path: str, *, expect_file: bool = True) -> tuple[PurePosixPath | None, ImportIssue | None]:
    display_path = str(raw_path or "").strip()
    if not display_path:
        return None, _issue("(missing path)", "The upload contains an item without a relative path.", "missing_path")
    if "\x00" in display_path or "\\" in display_path:
        return None, _issue(display_path, "The path contains invalid characters.", "invalid_path")
    if len(display_path) > MAX_PATH_LENGTH:
        return None, _issue(display_path, f"The path exceeds {MAX_PATH_LENGTH} characters.", "path_too_long")

    path = PurePosixPath(display_path)
    parts = path.parts
    if path.is_absolute() or not parts or any(part in {"", ".", ".."} for part in parts):
        return None, _issue(display_path, "Absolute paths and paths containing '..' are not allowed.", "path_traversal")

    for part in parts:
        if len(part) > MAX_SEGMENT_LENGTH:
            return None, _issue(display_path, f"The name '{part}' exceeds {MAX_SEGMENT_LENGTH} characters.", "name_too_long")
        if part.startswith(".") or not _SAFE_SEGMENT.fullmatch(part):
            return None, _issue(
                display_path,
                f"The name '{part}' contains unsupported characters or is hidden.",
                "unsafe_name",
            )

    minimum_parts = 3 if expect_file else 1
    if len(parts) < minimum_parts:
        return None, _issue(display_path, "The item is not inside datasets/PDB or datasets/ChEMBL.", "invalid_depth")
    return path, None


def validate_manifest(
    relative_paths: Sequence[str],
    empty_directories: Iterable[str] = (),
) -> DatasetManifest:
    """Validate every directory name and file location in an upload manifest."""
    issues: list[ImportIssue] = []
    paths: list[PurePosixPath] = []

    if not relative_paths:
        raise DatasetImportError(
            "The selected folder does not contain any files.",
            [_issue("datasets", "The selected folder is empty.", "empty_dataset")],
        )
    if len(relative_paths) > MAX_IMPORT_FILES:
        raise DatasetImportError(
            "The dataset exceeds the file limit.",
            [_issue("datasets", f"The limit is {MAX_IMPORT_FILES} files per import.", "too_many_files")],
        )

    seen_exact: set[str] = set()
    seen_casefolded: dict[str, str] = {}
    for raw_path in relative_paths:
        path, path_issue = _normalise_path(raw_path)
        if path_issue:
            issues.append(path_issue)
            continue
        assert path is not None
        canonical = path.as_posix()
        folded = canonical.casefold()
        if canonical in seen_exact:
            issues.append(_issue(canonical, "The same file was uploaded more than once.", "duplicate_file"))
            continue
        if folded in seen_casefolded:
            issues.append(_issue(
                canonical,
                f"The path conflicts with '{seen_casefolded[folded]}' on case-insensitive systems.",
                "case_collision",
            ))
            continue
        seen_exact.add(canonical)
        seen_casefolded[folded] = canonical
        paths.append(path)

    if issues:
        raise DatasetImportError("The dataset structure is invalid.", issues[:100])

    for path in paths:
        _validate_dataset_path(path, issues)

    directory_paths = {
        parent.as_posix()
        for path in paths
        for parent in path.parents
        if parent.as_posix() != "."
    }
    for raw_directory in empty_directories:
        directory, directory_issue = _normalise_path(raw_directory, expect_file=False)
        if directory_issue:
            issues.append(directory_issue)
            continue
        assert directory is not None
        _validate_dataset_directory(directory, issues)
        prefix = directory.as_posix().rstrip("/") + "/"
        if not any(path.as_posix().startswith(prefix) for path in paths):
            issues.append(_issue(
                directory.as_posix(),
                "The folder is empty. Remove it or add the expected files before importing.",
                "empty_directory",
            ))

    sources = sorted({path.parts[1] for path in paths if len(path.parts) > 1 and path.parts[1] in _DATASET_TYPES})
    if not sources:
        issues.append(_issue(
            "datasets",
            "The folder must contain PDB, ChEMBL, or both, using that exact spelling.",
            "missing_dataset_type",
        ))

    if "PDB" in sources:
        _validate_pdb_manifest(paths, directory_paths, issues)
    if "ChEMBL" in sources:
        _validate_chembl_manifest(paths, directory_paths, issues)

    if issues:
        raise DatasetImportError("The dataset structure is invalid.", issues[:100])

    return DatasetManifest(paths=tuple(paths), sources=tuple(sources), file_count=len(paths))


def _validate_dataset_path(path: PurePosixPath, issues: list[ImportIssue]) -> None:
    parts = path.parts
    display = path.as_posix()
    if parts[0] != "datasets":
        issues.append(_issue(
            display,
            f"The root folder must be named exactly 'datasets'; received '{parts[0]}'.",
            "wrong_root_name",
        ))
        return
    if len(parts) < 3 or parts[1] not in _DATASET_TYPES:
        received = parts[1] if len(parts) > 1 else "(missing)"
        issues.append(_issue(
            display,
            f"Only the 'PDB' and 'ChEMBL' folders are accepted inside datasets; received '{received}'.",
            "unknown_dataset_type",
        ))
        return

    if parts[1] == "PDB":
        _validate_pdb_path(path, issues)
    else:
        _validate_chembl_path(path, issues)


def _validate_dataset_directory(path: PurePosixPath, issues: list[ImportIssue]) -> None:
    parts = path.parts
    display = path.as_posix()
    if parts == ("datasets",):
        return
    if not parts or parts[0] != "datasets":
        issues.append(_issue(display, "The root folder must be named exactly 'datasets'.", "wrong_root_name"))
        return
    if len(parts) >= 2 and parts[1] not in _DATASET_TYPES:
        issues.append(_issue(display, "Only 'PDB' and 'ChEMBL' are accepted inside datasets.", "unknown_dataset_type"))
        return
    if len(parts) >= 3:
        # Add a harmless placeholder file name so the same structural rules can
        # validate the directory hierarchy itself.
        placeholder = path / ("placeholder.pdb" if parts[1] == "PDB" else "placeholder.csv")
        if parts[1] == "PDB":
            _validate_pdb_path(placeholder, issues)
        else:
            _validate_chembl_path(placeholder, issues)


def _validate_pdb_path(path: PurePosixPath, issues: list[ImportIssue]) -> None:
    parts = path.parts
    display = path.as_posix()
    if len(parts) == 3:
        issues.append(_issue(display, "PDB files must be inside a target folder.", "pdb_file_without_target"))
        return
    if len(parts) == 4:
        allowed = {".pdb", ".csv"}
    elif len(parts) == 5 and parts[3] == "Prepared":
        allowed = {".pdb", ".pdbqt", ".mol2", ".com", ".csv"}
    else:
        folder = parts[3] if len(parts) > 3 else "(missing)"
        issues.append(_issue(
            display,
            f"The only subfolder accepted inside a PDB target is 'Prepared'; received '{folder}'.",
            "unknown_pdb_folder",
        ))
        return
    if path.suffix.lower() not in allowed:
        issues.append(_issue(
            display,
            f"The file is not recognized PDB data. Extensions accepted here: {', '.join(sorted(allowed))}.",
            "unsupported_pdb_file",
        ))
    elif len(parts) == 4 and path.suffix.lower() == ".csv" and path.name != "pdb_codes.csv":
        issues.append(_issue(
            display,
            "The only CSV recognized in a PDB target folder is 'pdb_codes.csv'.",
            "unsupported_pdb_file",
        ))
    elif len(parts) == 5 and path.suffix.lower() == ".csv" and path.name != "centers.csv":
        issues.append(_issue(
            display,
            "The only CSV recognized inside Prepared is 'centers.csv'.",
            "unsupported_pdb_file",
        ))


def _validate_chembl_path(path: PurePosixPath, issues: list[ImportIssue]) -> None:
    parts = path.parts
    display = path.as_posix()
    if len(parts) < 4:
        issues.append(_issue(display, "ChEMBL files must be inside one of the five required folders.", "chembl_file_without_category"))
        return
    category = parts[2]
    if category not in _CHEMBL_REQUIRED_DIRS:
        issues.append(_issue(
            display,
            f"The folder '{category}' is not recognized inside ChEMBL. Use exactly: {', '.join(sorted(_CHEMBL_REQUIRED_DIRS))}.",
            "unknown_chembl_folder",
        ))
        return

    if category == "targets":
        valid_shape = len(parts) == 4
        allowed = {".csv"}
    elif category in {"bioactivity", "molecules", "similars"}:
        valid_shape = len(parts) == 5
        allowed = {".csv"}
    else:  # DrugBank
        valid_shape = len(parts) == 4 or (len(parts) == 5 and parts[3] in _DRUGBANK_OPTIONAL_DIRS)
        allowed = {".csv", ".png"} if len(parts) == 5 and parts[3] == "ADMET" else {".csv"}

    if not valid_shape:
        unexpected = parts[3] if len(parts) > 4 or category == "DrugBank" else "(file without a target folder)"
        if category == "DrugBank":
            reason = (
                f"The subfolder '{unexpected}' is not recognized inside DrugBank. "
                f"Accepted optional subfolders: {', '.join(sorted(_DRUGBANK_OPTIONAL_DIRS))}."
            )
        else:
            reason = f"In '{category}', each file must be directly inside a single target folder."
        issues.append(_issue(display, reason, "invalid_chembl_depth"))
        return
    if path.suffix.lower() not in allowed:
        issues.append(_issue(
            display,
            f"The file is not recognized in this folder. Accepted extensions: {', '.join(sorted(allowed))}.",
            "unsupported_chembl_file",
        ))


def _validate_pdb_manifest(paths: Sequence[PurePosixPath], directories: set[str], issues: list[ImportIssue]) -> None:
    pdb_paths = [path for path in paths if len(path.parts) > 1 and path.parts[1] == "PDB"]
    targets = sorted({path.parts[2] for path in pdb_paths if len(path.parts) >= 4})
    if not targets:
        issues.append(_issue("datasets/PDB", "PDB must contain at least one target folder with files.", "empty_pdb"))
        return
    for target in targets:
        direct_files = [path for path in pdb_paths if len(path.parts) == 4 and path.parts[2] == target]
        names = {path.name for path in direct_files}
        if "pdb_codes.csv" not in names:
            issues.append(_issue(
                f"datasets/PDB/{target}",
                "The required 'pdb_codes.csv' file is missing.",
                "missing_pdb_index",
            ))
        if not any(path.suffix.lower() == ".pdb" for path in direct_files):
            issues.append(_issue(
                f"datasets/PDB/{target}",
                "The target folder does not contain any .pdb files.",
                "missing_pdb_structure",
            ))
        prepared = f"datasets/PDB/{target}/Prepared"
        if prepared in directories and not any(
            len(path.parts) == 5 and path.parts[2] == target and path.parts[3] == "Prepared"
            for path in pdb_paths
        ):
            issues.append(_issue(prepared, "The Prepared folder is empty.", "empty_directory"))


def _validate_chembl_manifest(paths: Sequence[PurePosixPath], directories: set[str], issues: list[ImportIssue]) -> None:
    chembl_paths = [path for path in paths if len(path.parts) > 1 and path.parts[1] == "ChEMBL"]
    present = {path.parts[2] for path in chembl_paths if len(path.parts) >= 4}
    missing = sorted(_CHEMBL_REQUIRED_DIRS - present)
    for folder in missing:
        issues.append(_issue(
            f"datasets/ChEMBL/{folder}",
            f"The required '{folder}' folder is missing or empty.",
            "missing_chembl_folder",
        ))

    target_sets: dict[str, set[str]] = {}
    for category in ("bioactivity", "molecules", "similars"):
        target_sets[category] = {
            path.parts[3]
            for path in chembl_paths
            if len(path.parts) == 5 and path.parts[2] == category
        }
    all_targets = set().union(*target_sets.values())
    for target in sorted(all_targets):
        for category, targets in target_sets.items():
            if target not in targets:
                issues.append(_issue(
                    f"datasets/ChEMBL/{category}/{target}",
                    f"The target '{target}' must also exist in '{category}'.",
                    "incomplete_chembl_target",
                ))

    for directory in sorted(directories):
        if directory.startswith("datasets/ChEMBL/"):
            prefix = directory.rstrip("/") + "/"
            if not any(path.as_posix().startswith(prefix) for path in chembl_paths):
                issues.append(_issue(directory, "The folder is empty.", "empty_directory"))


def _read_prefix(path: Path, size: int = 2 * 1024**2) -> bytes:
    with path.open("rb") as handle:
        return handle.read(size)


def _csv_header(path: Path, relative_path: PurePosixPath) -> set[str]:
    prefix = _read_prefix(path, 256 * 1024)
    if b"\x00" in prefix:
        raise DatasetImportError(
            "Um arquivo CSV contém dados binários.",
            [_issue(relative_path.as_posix(), "O CSV contém bytes nulos e não é um arquivo de texto válido.", "invalid_csv")],
        )
    try:
        text = prefix.decode("utf-8-sig")
        row = next(csv.reader(io.StringIO(text)))
    except (UnicodeDecodeError, csv.Error, StopIteration) as exc:
        raise DatasetImportError(
            "Um arquivo CSV é inválido.",
            [_issue(relative_path.as_posix(), f"Não foi possível ler o cabeçalho CSV: {exc}.", "invalid_csv")],
        ) from exc
    header = {column.strip() for column in row if column.strip()}
    if not header:
        raise DatasetImportError(
            "Um arquivo CSV não possui cabeçalho.",
            [_issue(relative_path.as_posix(), "O CSV precisa ter um cabeçalho não vazio.", "invalid_csv")],
        )
    return header


def _validate_csv_content(path: Path, relative_path: PurePosixPath) -> None:
    header = _csv_header(path, relative_path)
    parts = relative_path.parts
    required: set[str] = set()
    if parts[1] == "PDB" and relative_path.name == "pdb_codes.csv":
        required = {"PDB_CODE", "LIGAND", "RESNUM", "CHAIN", "RESOLUTION"}
    elif parts[1] == "ChEMBL":
        category = parts[2]
        if category == "targets":
            required = {"pref_name", "target_chembl_id"}
        elif category == "bioactivity":
            required = {"canonical_smiles", "molecule_chembl_id", "value"}
        elif category in {"molecules", "similars"}:
            required = {"molecule_chembl_id", "molecule_structures"}
        elif category == "DrugBank" and len(parts) == 4:
            required = {"molecule_chembl_id", "canonical_smiles"}
    missing = sorted(required - header)
    if missing:
        raise DatasetImportError(
            "Um CSV não possui as colunas esperadas.",
            [_issue(
                relative_path.as_posix(),
                f"Faltam as colunas obrigatórias: {', '.join(missing)}.",
                "invalid_csv_schema",
            )],
        )


def _validate_pdb_content(path: Path, relative_path: PurePosixPath) -> None:
    prefix = _read_prefix(path)
    if b"\x00" in prefix:
        valid = False
    else:
        valid = False
        for raw_line in prefix.splitlines():
            if raw_line.startswith((b"ATOM  ", b"HETATM")) and len(raw_line) >= 54:
                try:
                    float(raw_line[30:38])
                    float(raw_line[38:46])
                    float(raw_line[46:54])
                    valid = True
                    break
                except ValueError:
                    continue
    if not valid:
        raise DatasetImportError(
            "Uma estrutura molecular é inválida.",
            [_issue(relative_path.as_posix(), "O arquivo não contém registros ATOM/HETATM com coordenadas PDB válidas.", "invalid_pdb")],
        )


def _validate_mol2_content(path: Path, relative_path: PurePosixPath) -> None:
    if b"@<TRIPOS>MOLECULE" not in _read_prefix(path, 256 * 1024):
        raise DatasetImportError(
            "Um arquivo MOL2 é inválido.",
            [_issue(relative_path.as_posix(), "O marcador @<TRIPOS>MOLECULE não foi encontrado.", "invalid_mol2")],
        )


def _validate_png_content(path: Path, relative_path: PurePosixPath) -> None:
    prefix = _read_prefix(path, 32)
    valid = len(prefix) >= 24 and prefix[:8] == b"\x89PNG\r\n\x1a\n" and prefix[12:16] == b"IHDR"
    if valid:
        width, height = struct.unpack(">II", prefix[16:24])
        valid = 0 < width <= 20000 and 0 < height <= 20000
    if not valid:
        raise DatasetImportError(
            "Uma imagem PNG é inválida.",
            [_issue(relative_path.as_posix(), "O arquivo não possui um cabeçalho PNG seguro e válido.", "invalid_png")],
        )


def _validate_chimera_commands(path: Path, relative_path: PurePosixPath) -> None:
    data = _read_prefix(path, 256 * 1024)
    if path.stat().st_size > len(data) or b"\x00" in data:
        valid = False
    else:
        try:
            lines = data.decode("utf-8").splitlines()
        except UnicodeDecodeError:
            lines = []
        allowed_prefixes = (
            "open ", "select ", "select invert", "delete selected", "delete ligand", "delete element.H",
            "addh", "addcharge ", "minimize ", "write format pdb ", "write format mol2 ",
            "close session", "close all",
        )
        valid = bool(lines) and all(
            not line.strip() or line.strip().startswith(allowed_prefixes)
            for line in lines
        )
    if not valid:
        raise DatasetImportError(
            "Um arquivo auxiliar do Chimera contém comandos não permitidos.",
            [_issue(relative_path.as_posix(), "Somente comandos gerados pelo pipeline de preparação são aceitos em .com.", "unsafe_command_file")],
        )


def _validate_file_content(path: Path, relative_path: PurePosixPath) -> None:
    suffix = relative_path.suffix.lower()
    if suffix == ".csv":
        _validate_csv_content(path, relative_path)
    elif suffix in {".pdb", ".pdbqt"}:
        _validate_pdb_content(path, relative_path)
    elif suffix == ".mol2":
        _validate_mol2_content(path, relative_path)
    elif suffix == ".png":
        _validate_png_content(path, relative_path)
    elif suffix == ".com":
        _validate_chimera_commands(path, relative_path)


def _destination_is_empty(path: Path) -> bool:
    return not path.is_symlink() and (
        not path.exists() or (path.is_dir() and next(path.iterdir(), None) is None)
    )


def import_dataset(
    workspace_root: Path,
    uploads: Sequence[UploadItem],
    empty_directories: Iterable[str] = (),
) -> dict[str, object]:
    """Validate, stage, and atomically install a dataset into a workspace."""
    manifest = validate_manifest(
        [upload.relative_path for upload in uploads],
        empty_directories=empty_directories,
    )
    workspace_root = workspace_root.resolve()
    if not workspace_root.is_dir():
        raise DatasetImportError(
            "O workspace não está disponível.",
            [_issue(str(workspace_root), "A pasta física do workspace não existe.", "workspace_unavailable")],
        )

    datasets_root = workspace_root / "datasets"
    if datasets_root.is_symlink() or (datasets_root.exists() and not datasets_root.is_dir()):
        raise DatasetImportError(
            "A estrutura física do workspace não é segura.",
            [_issue(
                "datasets",
                "A pasta datasets não pode ser um link simbólico nem um arquivo.",
                "unsafe_destination",
            )],
        )
    datasets_root.mkdir(parents=True, exist_ok=True)

    for source in manifest.sources:
        destination = datasets_root / source
        if not _destination_is_empty(destination):
            raise DatasetImportError(
                "O workspace já possui dados desse tipo.",
                [_issue(
                    f"datasets/{source}",
                    "A pasta de destino não está vazia. A importação não sobrescreve dados existentes.",
                    "destination_not_empty",
                )],
            )

    stage_root = workspace_root / f".dataset-import-{uuid.uuid4().hex}"
    backups: dict[str, Path] = {}
    installed: list[str] = []
    total_bytes = 0
    try:
        stage_root.mkdir(mode=0o700, parents=False, exist_ok=False)
        for upload, relative_path in zip(uploads, manifest.paths, strict=True):
            destination = stage_root.joinpath(*relative_path.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            file_bytes = 0
            with destination.open("xb") as output:
                while True:
                    chunk = upload.stream.read(1024 * 1024)
                    if not chunk:
                        break
                    file_bytes += len(chunk)
                    total_bytes += len(chunk)
                    if file_bytes > MAX_FILE_BYTES:
                        raise DatasetImportError(
                            "Um arquivo excede o limite permitido.",
                            [_issue(relative_path.as_posix(), f"O limite por arquivo é {MAX_FILE_BYTES} bytes.", "file_too_large")],
                        )
                    if total_bytes > MAX_IMPORT_BYTES:
                        raise DatasetImportError(
                            "O dataset excede o limite total permitido.",
                            [_issue("datasets", f"O limite por importação é {MAX_IMPORT_BYTES} bytes.", "dataset_too_large")],
                        )
                    output.write(chunk)
            if file_bytes == 0:
                raise DatasetImportError(
                    "O dataset contém um arquivo vazio.",
                    [_issue(relative_path.as_posix(), "Arquivos vazios não podem ser importados.", "empty_file")],
                )
            _validate_file_content(destination, relative_path)

        for source in manifest.sources:
            destination = datasets_root / source
            staged_source = stage_root / "datasets" / source
            if not _destination_is_empty(destination):
                raise DatasetImportError(
                    "O destino foi alterado durante a importação.",
                    [_issue(f"datasets/{source}", "A pasta deixou de estar vazia; tente novamente após encerrar outros processos.", "destination_changed")],
                )
            backup = workspace_root / f".dataset-backup-{source}-{uuid.uuid4().hex}"
            if destination.exists():
                destination.rename(backup)
                backups[source] = backup
            staged_source.rename(destination)
            installed.append(source)

        for backup in backups.values():
            shutil.rmtree(backup, ignore_errors=True)
        return {
            "sources": list(manifest.sources),
            "file_count": manifest.file_count,
            "total_bytes": total_bytes,
        }
    except Exception:
        for source in reversed(installed):
            destination = workspace_root / "datasets" / source
            if destination.exists():
                shutil.rmtree(destination, ignore_errors=True)
            backup = backups.get(source)
            if backup and backup.exists():
                backup.rename(destination)
        for source, backup in backups.items():
            if source not in installed and backup.exists():
                destination = workspace_root / "datasets" / source
                if not destination.exists():
                    backup.rename(destination)
        raise
    finally:
        shutil.rmtree(stage_root, ignore_errors=True)
