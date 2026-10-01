from __future__ import annotations

import io
import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dataset_import import (  # noqa: E402
    DatasetImportError,
    UploadItem,
    import_dataset,
    validate_manifest,
)


VALID_PDB = (
    b"HEADER    TEST STRUCTURE\n"
    b"ATOM      1  N   ALA A   1      11.104  13.207   9.754  1.00 20.00           N\n"
    b"END\n"
)
PDB_INDEX = b"PDB_CODE,LIGAND,RESNUM,CHAIN,RESOLUTION,RMSD\n1ABC,LIG,1,A,2.0,\n"


def upload(path: str, content: bytes) -> UploadItem:
    return UploadItem(relative_path=path, stream=io.BytesIO(content))


def issue_codes(error: DatasetImportError) -> set[str]:
    return {current.code for current in error.issues}


class DatasetManifestTests(unittest.TestCase):
    def test_rejects_path_traversal(self):
        with self.assertRaises(DatasetImportError) as raised:
            validate_manifest(["datasets/PDB/Target/../escape.pdb"])
        self.assertIn("path_traversal", issue_codes(raised.exception))

    def test_rejects_wrong_case_at_root(self):
        with self.assertRaises(DatasetImportError) as raised:
            validate_manifest(["Datasets/PDB/Target/pdb_codes.csv"])
        self.assertIn("wrong_root_name", issue_codes(raised.exception))

    def test_reports_unknown_chembl_folder(self):
        with self.assertRaises(DatasetImportError) as raised:
            validate_manifest(["datasets/ChEMBL/Molecule/Target/data.csv"])
        self.assertIn("unknown_chembl_folder", issue_codes(raised.exception))

    def test_rejects_unrelated_file_extension(self):
        with self.assertRaises(DatasetImportError) as raised:
            validate_manifest([
                "datasets/PDB/Target/pdb_codes.csv",
                "datasets/PDB/Target/structure.pdb",
                "datasets/PDB/Target/program.exe",
            ])
        self.assertIn("unsupported_pdb_file", issue_codes(raised.exception))

    def test_rejects_unknown_csv_in_pdb_target(self):
        with self.assertRaises(DatasetImportError) as raised:
            validate_manifest([
                "datasets/PDB/Target/pdb_codes.csv",
                "datasets/PDB/Target/structure.pdb",
                "datasets/PDB/Target/unrelated.csv",
            ])
        self.assertIn("unsupported_pdb_file", issue_codes(raised.exception))

    def test_rejects_empty_directory_reported_by_browser(self):
        with self.assertRaises(DatasetImportError) as raised:
            validate_manifest(
                [
                    "datasets/PDB/Target/pdb_codes.csv",
                    "datasets/PDB/Target/structure.pdb",
                ],
                empty_directories=["datasets/PDB/Target/Prepared"],
            )
        self.assertIn("empty_directory", issue_codes(raised.exception))

    def test_accepts_complete_chembl_manifest(self):
        manifest = validate_manifest([
            "datasets/ChEMBL/targets/TARGET.csv",
            "datasets/ChEMBL/bioactivity/Target/CHEMBL1.csv",
            "datasets/ChEMBL/molecules/Target/CHEMBL1.csv",
            "datasets/ChEMBL/similars/Target/CHEMBL2.csv",
            "datasets/ChEMBL/DrugBank/Target_MOLS.csv",
        ])
        self.assertEqual(manifest.sources, ("ChEMBL",))


class DatasetImportTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.tempdir.name) / "workspace"
        (self.workspace / "datasets" / "PDB").mkdir(parents=True)
        (self.workspace / "datasets" / "ChEMBL").mkdir(parents=True)

    def tearDown(self):
        self.tempdir.cleanup()

    def test_imports_valid_pdb_transactionally(self):
        result = import_dataset(self.workspace, [
            upload("datasets/PDB/Target/pdb_codes.csv", PDB_INDEX),
            upload("datasets/PDB/Target/1ABC.pdb", VALID_PDB),
        ])

        self.assertEqual(result["sources"], ["PDB"])
        self.assertEqual(result["file_count"], 2)
        self.assertTrue((self.workspace / "datasets" / "PDB" / "Target" / "1ABC.pdb").is_file())
        self.assertFalse(any(self.workspace.glob(".dataset-import-*")))

    def test_rejects_empty_file_without_leaving_partial_data(self):
        with self.assertRaises(DatasetImportError) as raised:
            import_dataset(self.workspace, [
                upload("datasets/PDB/Target/pdb_codes.csv", PDB_INDEX),
                upload("datasets/PDB/Target/1ABC.pdb", b""),
            ])

        self.assertIn("empty_file", issue_codes(raised.exception))
        self.assertEqual(list((self.workspace / "datasets" / "PDB").iterdir()), [])
        self.assertFalse(any(self.workspace.glob(".dataset-import-*")))

    def test_rejects_invalid_pdb_content(self):
        with self.assertRaises(DatasetImportError) as raised:
            import_dataset(self.workspace, [
                upload("datasets/PDB/Target/pdb_codes.csv", PDB_INDEX),
                upload("datasets/PDB/Target/1ABC.pdb", b"this is not a PDB file\n"),
            ])
        self.assertIn("invalid_pdb", issue_codes(raised.exception))

    def test_never_overwrites_existing_dataset(self):
        marker = self.workspace / "datasets" / "PDB" / "keep.txt"
        marker.write_text("existing research data", encoding="utf-8")

        with self.assertRaises(DatasetImportError) as raised:
            import_dataset(self.workspace, [
                upload("datasets/PDB/Target/pdb_codes.csv", PDB_INDEX),
                upload("datasets/PDB/Target/1ABC.pdb", VALID_PDB),
            ])

        self.assertIn("destination_not_empty", issue_codes(raised.exception))
        self.assertEqual(marker.read_text(encoding="utf-8"), "existing research data")

    @unittest.skipUnless(hasattr(Path, "is_symlink"), "Symbolic links are unavailable")
    def test_rejects_symlinked_dataset_destination(self):
        outside = Path(self.tempdir.name) / "outside"
        outside.mkdir()
        datasets = self.workspace / "datasets"
        for child in list(datasets.iterdir()):
            child.rmdir()
        datasets.rmdir()
        datasets.symlink_to(outside, target_is_directory=True)

        with self.assertRaises(DatasetImportError) as raised:
            import_dataset(self.workspace, [
                upload("datasets/PDB/Target/pdb_codes.csv", PDB_INDEX),
                upload("datasets/PDB/Target/1ABC.pdb", VALID_PDB),
            ])

        self.assertIn("unsafe_destination", issue_codes(raised.exception))
        self.assertEqual(list(outside.iterdir()), [])

    def test_imports_complete_chembl_dataset(self):
        molecule_header = b"molecule_chembl_id,molecule_structures\nCHEMBL1,{}\n"
        result = import_dataset(self.workspace, [
            upload("datasets/ChEMBL/targets/TARGET.csv", b"pref_name,target_chembl_id\nTarget,CHEMBL_T\n"),
            upload(
                "datasets/ChEMBL/bioactivity/Target/CHEMBL_T.csv",
                b"canonical_smiles,molecule_chembl_id,value\nCCO,CHEMBL1,10\n",
            ),
            upload("datasets/ChEMBL/molecules/Target/CHEMBL1.csv", molecule_header),
            upload("datasets/ChEMBL/similars/Target/CHEMBL2.csv", molecule_header),
            upload(
                "datasets/ChEMBL/DrugBank/Target_MOLS.csv",
                b"molecule_chembl_id,canonical_smiles\nCHEMBL1,CCO\n",
            ),
        ])

        self.assertEqual(result["sources"], ["ChEMBL"])
        self.assertTrue((self.workspace / "datasets" / "ChEMBL" / "targets" / "TARGET.csv").is_file())


if __name__ == "__main__":
    unittest.main()
