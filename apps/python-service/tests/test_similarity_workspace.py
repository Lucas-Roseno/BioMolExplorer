from __future__ import annotations

import csv
import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from similarity_workspace import available_targets, prepare_inputs  # noqa: E402


class SimilarityWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.tempdir.name)
        for partition, rows in {
            "molecules": [("CHEMBL1", "{'canonical_smiles': 'CCO'}")],
            "similars": [
                ("CHEMBL1", "{'canonical_smiles': 'CCO'}"),
                ("CHEMBL2", "{'canonical_smiles': 'CCN'}"),
            ],
        }.items():
            folder = self.workspace / "datasets" / "ChEMBL" / partition / "Target A"
            folder.mkdir(parents=True)
            with (folder / "source.csv").open("w", newline="", encoding="utf-8") as output:
                writer = csv.DictWriter(output, fieldnames=["molecule_chembl_id", "molecule_structures"])
                writer.writeheader()
                for molecule_id, structures in rows:
                    writer.writerow({"molecule_chembl_id": molecule_id, "molecule_structures": structures})

    def tearDown(self):
        self.tempdir.cleanup()

    def test_prepares_workspace_scoped_inputs_from_segmented_chembl_data(self):
        self.assertEqual(available_targets(self.workspace / "datasets" / "ChEMBL"), ["Target A"])

        input_dir, metadata = prepare_inputs(self.workspace, "Target A")

        self.assertEqual(metadata["mols"], 1)
        self.assertEqual(metadata["sims"], 1)
        self.assertTrue((input_dir / "Target A_MOLS.csv").is_file())
        self.assertTrue((input_dir / "Target A_SIMS.csv").is_file())
        self.assertTrue((input_dir / "manifest.json").is_file())
        self.assertTrue(str(input_dir).startswith(str(self.workspace)))


if __name__ == "__main__":
    unittest.main()
