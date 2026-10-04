export interface DatasetValidationIssue {
  path: string;
  reason: string;
  code: string;
}

export interface DatasetSelectionSummary {
  files: File[];
  paths: string[];
  sources: Array<"PDB" | "ChEMBL">;
  totalBytes: number;
  emptyDirectories: string[];
}

export interface DatasetSelectionResult {
  summary: DatasetSelectionSummary | null;
  issues: DatasetValidationIssue[];
}

const MAX_FILES = 25_000;
const MAX_TOTAL_BYTES = 10 * 1024 ** 3;
const MAX_FILE_BYTES = 512 * 1024 ** 2;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9 _().+-]*$/;
const CHEMBL_FOLDERS = new Set(["bioactivity", "DrugBank", "molecules", "similars", "targets"]);
const DRUGBANK_FOLDERS = new Set(["ADMET", "Fingerprints", "Molecules", "Similarity"]);

function issue(path: string, reason: string, code: string): DatasetValidationIssue {
  return { path: path || "datasets", reason, code };
}

function relativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function validateSafePath(path: string, issues: DatasetValidationIssue[]): string[] | null {
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/")) {
    issues.push(issue(path || "(missing path)", "The path contains invalid characters.", "invalid_path"));
    return null;
  }
  const parts = path.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) {
    issues.push(issue(path, "Empty path segments, '.' and '..' are not allowed.", "path_traversal"));
    return null;
  }
  const invalid = parts.find(part => part.length > 128 || part.startsWith(".") || !SAFE_SEGMENT.test(part));
  if (invalid) {
    issues.push(issue(path, `The name '${invalid}' contains unsupported characters or is hidden.`, "unsafe_name"));
    return null;
  }
  return parts;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function validatePdbPath(parts: string[], path: string, issues: DatasetValidationIssue[]) {
  if (parts.length === 4) {
    if (![".pdb", ".csv"].includes(extension(parts[3]))) {
      issues.push(issue(path, "Only .pdb and .csv files are accepted at this PDB level.", "unsupported_pdb_file"));
    } else if (extension(parts[3]) === ".csv" && parts[3] !== "pdb_codes.csv") {
      issues.push(issue(path, "The only CSV recognized in a PDB target folder is 'pdb_codes.csv'.", "unsupported_pdb_file"));
    }
    return;
  }
  if (parts.length === 5 && parts[3] === "Prepared") {
    if (![".pdb", ".pdbqt", ".mol2", ".com", ".csv"].includes(extension(parts[4]))) {
      issues.push(issue(path, "This file type is not recognized inside Prepared.", "unsupported_pdb_file"));
    } else if (extension(parts[4]) === ".csv" && parts[4] !== "centers.csv") {
      issues.push(issue(path, "The only CSV recognized inside Prepared is 'centers.csv'.", "unsupported_pdb_file"));
    }
    return;
  }
  const folder = parts[3] || "(missing)";
  issues.push(issue(path, `The only subfolder accepted inside a PDB target is 'Prepared'; received '${folder}'.`, "unknown_pdb_folder"));
}

function validateChemblPath(parts: string[], path: string, issues: DatasetValidationIssue[]) {
  const category = parts[2];
  if (!CHEMBL_FOLDERS.has(category)) {
    issues.push(issue(path, `The folder '${category || "(missing)"}' is not recognized inside ChEMBL.`, "unknown_chembl_folder"));
    return;
  }

  let validShape = false;
  let allowed = [".csv"];
  if (category === "targets") {
    validShape = parts.length === 4;
  } else if (["bioactivity", "molecules", "similars"].includes(category)) {
    validShape = parts.length === 5;
  } else {
    validShape = parts.length === 4 || (parts.length === 5 && DRUGBANK_FOLDERS.has(parts[3]));
    if (parts.length === 5 && parts[3] === "ADMET") allowed = [".csv", ".png"];
  }
  if (!validShape) {
    issues.push(issue(path, `The path does not match the recognized structure for '${category}'.`, "invalid_chembl_depth"));
    return;
  }
  if (!allowed.includes(extension(parts.at(-1) || ""))) {
    issues.push(issue(path, `File extension not allowed in '${category}'. Use ${allowed.join(" or ")}.`, "unsupported_chembl_file"));
  }
}

export function validateDatasetSelection(files: File[], emptyDirectories: string[] = []): DatasetSelectionResult {
  const issues: DatasetValidationIssue[] = [];
  if (!files.length) {
    return {
      summary: null,
      issues: [issue("datasets", "The selected folder is empty and cannot be imported.", "empty_dataset")],
    };
  }
  if (files.length > MAX_FILES) {
    issues.push(issue("datasets", `The limit is ${MAX_FILES.toLocaleString("en-US")} files per import.`, "too_many_files"));
  }

  const paths = files.map(relativePath);
  const parsedPaths: string[][] = [];
  const exact = new Set<string>();
  const folded = new Map<string, string>();
  let totalBytes = 0;

  files.forEach((file, index) => {
    const path = paths[index];
    const parts = validateSafePath(path, issues);
    if (!parts) return;
    parsedPaths.push(parts);
    const lower = path.toLocaleLowerCase("en-US");
    if (exact.has(path)) issues.push(issue(path, "The same file appears more than once.", "duplicate_file"));
    if (folded.has(lower) && folded.get(lower) !== path) {
      issues.push(issue(path, `The path conflicts with '${folded.get(lower)}'.`, "case_collision"));
    }
    exact.add(path);
    folded.set(lower, path);

    totalBytes += file.size;
    if (file.size === 0) issues.push(issue(path, "The file is empty.", "empty_file"));
    if (file.size > MAX_FILE_BYTES) issues.push(issue(path, "The file exceeds the 512 MB limit.", "file_too_large"));

    if (parts[0] !== "datasets") {
      issues.push(issue(path, `The root folder must be named exactly 'datasets'; received '${parts[0]}'.`, "wrong_root_name"));
      return;
    }
    if (!(["PDB", "ChEMBL"] as string[]).includes(parts[1])) {
      issues.push(issue(path, `Only 'PDB' and 'ChEMBL' are accepted inside datasets; received '${parts[1] || "(missing)"}'.`, "unknown_dataset_type"));
      return;
    }
    if (parts[1] === "PDB") validatePdbPath(parts, path, issues);
    else validateChemblPath(parts, path, issues);
  });

  if (totalBytes > MAX_TOTAL_BYTES) {
    issues.push(issue("datasets", "The dataset exceeds the 10 GB total limit.", "dataset_too_large"));
  }

  const sources = Array.from(new Set(
    parsedPaths.map(parts => parts[1]).filter((source): source is "PDB" | "ChEMBL" => source === "PDB" || source === "ChEMBL")
  )).sort() as Array<"PDB" | "ChEMBL">;

  if (sources.includes("PDB")) {
    const targets = Array.from(new Set(parsedPaths.filter(parts => parts[1] === "PDB" && parts.length >= 4).map(parts => parts[2])));
    if (!targets.length) issues.push(issue("datasets/PDB", "PDB must contain at least one target folder.", "empty_pdb"));
    for (const target of targets) {
      const direct = parsedPaths.filter(parts => parts[1] === "PDB" && parts[2] === target && parts.length === 4);
      if (!direct.some(parts => parts[3] === "pdb_codes.csv")) {
        issues.push(issue(`datasets/PDB/${target}`, "The required 'pdb_codes.csv' file is missing.", "missing_pdb_index"));
      }
      if (!direct.some(parts => extension(parts[3]) === ".pdb")) {
        issues.push(issue(`datasets/PDB/${target}`, "The target folder does not contain any .pdb files.", "missing_pdb_structure"));
      }
    }
  }

  if (sources.includes("ChEMBL")) {
    const present = new Set(parsedPaths.filter(parts => parts[1] === "ChEMBL" && parts.length >= 4).map(parts => parts[2]));
    for (const folder of CHEMBL_FOLDERS) {
      if (!present.has(folder)) {
        issues.push(issue(`datasets/ChEMBL/${folder}`, `The required '${folder}' folder is missing or empty.`, "missing_chembl_folder"));
      }
    }
    const targetSets = new Map<string, Set<string>>();
    for (const category of ["bioactivity", "molecules", "similars"]) {
      targetSets.set(category, new Set(
        parsedPaths.filter(parts => parts[1] === "ChEMBL" && parts[2] === category && parts.length === 5).map(parts => parts[3])
      ));
    }
    const targets = new Set(Array.from(targetSets.values()).flatMap(targetSet => Array.from(targetSet)));
    for (const target of targets) {
      for (const [category, targetSet] of targetSets) {
        if (!targetSet.has(target)) {
          issues.push(issue(`datasets/ChEMBL/${category}/${target}`, `The target '${target}' must also exist in '${category}'.`, "incomplete_chembl_target"));
        }
      }
    }
  }

  for (const directory of emptyDirectories) {
    issues.push(issue(directory, "The folder is empty. Remove it or add the expected files.", "empty_directory"));
  }

  const uniqueIssues = Array.from(
    new Map(issues.map(current => [`${current.code}\0${current.path}\0${current.reason}`, current])).values()
  );
  return {
    summary: uniqueIssues.length ? null : { files, paths, sources, totalBytes, emptyDirectories },
    issues: uniqueIssues.slice(0, 100),
  };
}

interface LegacyFileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface LegacyFileSystemDirectoryEntry extends LegacyFileSystemEntry {
  createReader(): {
    readEntries(success: (entries: LegacyFileSystemEntry[]) => void, error?: () => void): void;
  };
}

async function readDirectoryEntries(entry: LegacyFileSystemDirectoryEntry): Promise<LegacyFileSystemEntry[]> {
  const reader = entry.createReader();
  const all: LegacyFileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<LegacyFileSystemEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (!batch.length) return all;
    all.push(...batch);
  }
}

async function walkDirectory(entry: LegacyFileSystemDirectoryEntry, path: string, empty: string[]): Promise<boolean> {
  const children = await readDirectoryEntries(entry);
  let containsFile = false;
  for (const child of children) {
    if (child.isFile) {
      containsFile = true;
    } else if (child.isDirectory) {
      const childPath = `${path}/${child.name}`;
      if (await walkDirectory(child as LegacyFileSystemDirectoryEntry, childPath, empty)) containsFile = true;
    }
  }
  if (!containsFile) empty.push(path);
  return containsFile;
}

/** Best-effort detection for empty folders omitted from FileList by browsers. */
export async function findEmptySelectedDirectories(input: HTMLInputElement): Promise<string[]> {
  const entries = (input as HTMLInputElement & { webkitEntries?: LegacyFileSystemEntry[] }).webkitEntries;
  if (!entries?.length) return [];
  const empty: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      await walkDirectory(entry as unknown as LegacyFileSystemDirectoryEntry, entry.name, empty);
    }
  }
  return empty;
}

export function formatDatasetBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
