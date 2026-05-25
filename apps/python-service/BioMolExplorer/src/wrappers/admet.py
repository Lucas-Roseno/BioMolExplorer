"""!

PhD research 2023~2026

@title
    ADMET Wrapper — integrates ADMET evaluation into the BioMolExplorer pipeline.

@info
    ADMETWrapper orchestrates molecule loading, property calculation, toxicity
    filtering, classification (BBB/HIA/PGP), result export, and BOILED-Egg plot
    generation for a given ChEMBL target dataset.

@authors
   - Michel Pires da Silva (michel@cefetmg.br)
   - Alisson Marques da Silva (alisson@cefetmg.br)
   - Alex Gutterres Taranto (taranto@ufsj.edu.br)

@date 2023-2026
@copyright MIT License
"""
#----------------------------------------------------------------------------------------------
import os
import glob
import pandas as pd
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from caad.admet import MoleculeEvaluator, BoiledEggPlotter
#----------------------------------------------------------------------------------------------


class ADMETWrapper:
    """
    Orchestrates the full ADMET analysis pipeline for a ChEMBL target.

    Args:
        base_input_path:  Absolute path to the directory containing the input CSV(s).
        base_output_path: Absolute path to the directory where results will be saved.
        input_file:       Optional — specific CSV filename (without extension) to process.
                          If None, all CSVs in base_input_path are processed.
        verbose:          If True, prints a summary to stdout after each file.
    """

    def __init__(self, base_input_path: str, base_output_path: str,
                 input_file: str | None = None, verbose: bool = False):
        self.base_input_path  = base_input_path
        self.base_output_path = base_output_path
        self.verbose          = verbose

        os.makedirs(self.base_output_path, exist_ok=True)

        self.csv_files    = self._resolve_input_files(input_file)
        self.evaluator    = MoleculeEvaluator()
        self.excluded_count = 0

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _resolve_input_files(self, input_file: str | None) -> list[str]:
        """Returns the list of CSV basenames (without extension) to process."""
        if input_file is not None:
            return [input_file]

        pattern = os.path.join(self.base_input_path, '*.csv')
        found   = glob.glob(pattern)
        if not found:
            raise FileNotFoundError(
                f"No CSV files found in: {self.base_input_path}"
            )
        return [os.path.splitext(os.path.basename(f))[0] for f in found]

    def _load_data(self, filename: str) -> pd.DataFrame:
        """
        Loads a CSV and normalises it to only expose the columns needed for ADMET.

        The ChEMBL crawler stores molecules in their raw API format, where
        `canonical_smiles` is nested inside the `molecule_structures` column as a
        serialised dict string.  This method handles both:

          1. Raw format  — columns: molecule_chembl_id, molecule_structures (dict str)
          2. Clean format — columns: molecule_chembl_id, canonical_smiles (plain str)
        """
        import ast

        path = os.path.join(self.base_input_path, filename + '.csv')
        df   = pd.read_csv(path)

        # ── Case 1: already has canonical_smiles ──────────────────────────────
        if 'canonical_smiles' in df.columns:
            return df[['molecule_chembl_id', 'canonical_smiles']].copy()

        # ── Case 2: raw ChEMBL format, SMILES nested in molecule_structures ──
        if 'molecule_structures' in df.columns:
            def _extract_smiles(cell) -> str | None:
                try:
                    if pd.isna(cell):
                        return None
                    d = ast.literal_eval(cell) if isinstance(cell, str) else cell
                    return d.get('canonical_smiles') if isinstance(d, dict) else None
                except Exception:
                    return None

            df['canonical_smiles'] = df['molecule_structures'].apply(_extract_smiles)
            df = df[['molecule_chembl_id', 'canonical_smiles']].copy()
            df.dropna(subset=['canonical_smiles'], inplace=True)
            return df

        # ── Neither column found ──────────────────────────────────────────────
        raise ValueError(
            f"CSV '{filename}.csv' has neither 'canonical_smiles' nor "
            f"'molecule_structures' column. Columns found: {list(df.columns)}"
        )


    # ------------------------------------------------------------------
    # Pipeline
    # ------------------------------------------------------------------

    def run_pipeline(self) -> dict:
        """
        Runs the full ADMET pipeline for all resolved input files.

        Returns:
            A summary dict with counts per file and totals.
        """
        summary = {
            'files_processed': [],
            'total_input': 0,
            'total_processed': 0,
            'total_excluded': 0,
        }

        for filename in self.csv_files:
            df_input = self._load_data(filename)

            rows = []
            self.excluded_count = 0

            for _, row in df_input.iterrows():
                smiles = row['canonical_smiles']
                name   = row['molecule_chembl_id']

                props = self.evaluator.calculate_properties(smiles)
                if props is None:
                    self.excluded_count += 1
                    continue

                # Toxicology filter
                if self.evaluator.is_toxic(props['Mol']):
                    self.excluded_count += 1
                    continue

                tpsa, logp, mw = props['TPSA'], props['WLOGP'], props['MW']
                hbd, hba, rb   = props['HBD'], props['HBA'], props['RB']

                bbb = self.evaluator.classify_bbb(tpsa, logp, mw, hbd, rb)
                hia = self.evaluator.classify_hia(tpsa, logp)
                pgp = self.evaluator.predict_pgp(mw, tpsa, logp, hbd)

                rows.append({
                    'canonical_smiles':   smiles,
                    'molecule_chembl_id': name,
                    'TPSA':  round(tpsa, 2),
                    'WLOGP': round(logp, 2),
                    'MW':    round(mw,   2),
                    'HBD':   hbd,
                    'HBA':   hba,
                    'RB':    rb,
                    'BBB':   bbb,
                    'HIA':   hia,
                    'PGP':   pgp,
                })

            results = pd.DataFrame(rows)
            self._export_results(results, filename)
            self._generate_plot(results, filename)

            file_summary = {
                'file':           filename,
                'input':          len(df_input),
                'processed':      len(results),
                'excluded':       self.excluded_count,
                'bbb_plus':       int((results['BBB'] == 'BBB+').sum()) if not results.empty else 0,
                'bbb_minus':      int((results['BBB'] == 'BBB-').sum()) if not results.empty else 0,
                'hia_plus':       int((results['HIA'] == 'HIA+').sum()) if not results.empty else 0,
                'pgp_plus':       int((results['PGP'] == 'PGP+').sum()) if not results.empty else 0,
            }
            summary['files_processed'].append(file_summary)
            summary['total_input']     += file_summary['input']
            summary['total_processed'] += file_summary['processed']
            summary['total_excluded']  += file_summary['excluded']

            if self.verbose:
                self._print_summary(file_summary)

        return summary

    # ------------------------------------------------------------------
    # Export & Plot
    # ------------------------------------------------------------------

    def _export_results(self, results: pd.DataFrame, filename: str) -> None:
        """Saves the main results CSV plus filtered sub-CSVs."""
        if results.empty:
            return

        main_path = os.path.join(self.base_output_path, filename + '.csv')
        results.to_csv(main_path, index=False)

        # Filtered sub-exports
        filters = [
            ('BBB=="BBB+"', filename + '_BBB+'),
            ('BBB=="BBB-"', filename + '_BBB-'),
            ('HIA=="HIA+"', filename + '_HIA+'),
        ]
        for query, out_name in filters:
            subset = results.query(query)[['canonical_smiles', 'molecule_chembl_id']]
            if not subset.empty:
                subset.to_csv(
                    os.path.join(self.base_output_path, out_name + '.csv'),
                    index=False
                )

    def _generate_plot(self, results: pd.DataFrame, filename: str) -> None:
        """Renders and saves the BOILED-Egg plot."""
        if results.empty:
            return
        BoiledEggPlotter.plot(
            df=results,
            output_path=self.base_output_path,
            output_image_file=filename + '_egg.png'
        )

    @staticmethod
    def _print_summary(s: dict) -> None:
        print('\n========== ADMET SUMMARY ==========')
        print(f"File       : {s['file']}")
        print(f"Input mols : {s['input']}")
        print(f"Excluded   : {s['excluded']}")
        print(f"Processed  : {s['processed']}")
        print(f"BBB+       : {s['bbb_plus']}")
        print(f"BBB-       : {s['bbb_minus']}")
        print(f"HIA+       : {s['hia_plus']}")
        print('====================================\n')
