import { validateDatasetSelection } from "@/lib/datasetImport";


function datasetFile(path: string, content = "data"): File {
  const file = new File([content], path.split("/").at(-1) || "file", { type: "application/octet-stream" });
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

describe("validateDatasetSelection", () => {
  it("accepts a complete PDB directory", () => {
    const result = validateDatasetSelection([
      datasetFile("datasets/PDB/Target/pdb_codes.csv"),
      datasetFile("datasets/PDB/Target/1ABC.pdb"),
    ]);

    expect(result.issues).toEqual([]);
    expect(result.summary?.sources).toEqual(["PDB"]);
  });

  it("requires the exact datasets root name", () => {
    const result = validateDatasetSelection([
      datasetFile("Dataset/PDB/Target/pdb_codes.csv"),
      datasetFile("Dataset/PDB/Target/1ABC.pdb"),
    ]);

    expect(result.summary).toBeNull();
    expect(result.issues.some(current => current.code === "wrong_root_name")).toBe(true);
  });

  it("reports the unrelated file that blocks the import", () => {
    const result = validateDatasetSelection([
      datasetFile("datasets/PDB/Target/pdb_codes.csv"),
      datasetFile("datasets/PDB/Target/1ABC.pdb"),
      datasetFile("datasets/PDB/Target/readme.txt"),
    ]);

    expect(result.summary).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "datasets/PDB/Target/readme.txt", code: "unsupported_pdb_file" }),
    ]));
  });

  it("rejects an empty file and identifies it", () => {
    const result = validateDatasetSelection([
      datasetFile("datasets/PDB/Target/pdb_codes.csv"),
      datasetFile("datasets/PDB/Target/1ABC.pdb", ""),
    ]);

    expect(result.summary).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "datasets/PDB/Target/1ABC.pdb", code: "empty_file" }),
    ]));
  });

  it("requires all five ChEMBL folders", () => {
    const result = validateDatasetSelection([
      datasetFile("datasets/ChEMBL/targets/TARGET.csv"),
    ]);

    expect(result.summary).toBeNull();
    expect(result.issues.filter(current => current.code === "missing_chembl_folder")).toHaveLength(4);
  });

  it("reports empty directories discovered by the browser", () => {
    const result = validateDatasetSelection(
      [
        datasetFile("datasets/PDB/Target/pdb_codes.csv"),
        datasetFile("datasets/PDB/Target/1ABC.pdb"),
      ],
      ["datasets/PDB/Target/Prepared"],
    );

    expect(result.summary).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "datasets/PDB/Target/Prepared", code: "empty_directory" }),
    ]));
  });
});
