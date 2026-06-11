"""!

PhD research 2023~2026

@title 
    BioMolExplorer: ADMET molecule evaluator

@info
    Provides MoleculeEvaluator for computing physicochemical descriptors and
    toxicity filters, and BoiledEggPlotter for generating the BOILED-Egg chart.

@authors 
   - Michel Pires da Silva (michel@cefetmg.br)
   - Alisson Marques da Silva (alisson@cefetmg.br)
   - Alex Gutterres Taranto (taranto@ufsj.edu.br)

@date 2023-2026
@copyright MIT License
"""
#----------------------------------------------------------------------------------------------
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from rdkit import Chem
from rdkit.Chem import Descriptors
from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams
#----------------------------------------------------------------------------------------------


class MoleculeEvaluator:
    """Responsible for calculating properties and applying filters on molecules (SMILES)."""
    
    MUTAGENIC_SMARTS = ['[N+](=O)[O-]', 'N=N', '[CX3](=O)[Cl]', '[SH]', '[C,c]Br', '[C,c]I']
    TUMORIGENIC_SMARTS = ['[N+](=O)[O-]', 'C=C=O', '[Cl][C]=O', '[C,c]Cl', '[C,c]Br']

    def __init__(self):
        # Initialize PAINS catalog
        params = FilterCatalogParams()
        params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS)
        self.pains_catalog = FilterCatalog(params)
        
        # Compile SMARTS patterns
        self.mutagenic_patterns = [Chem.MolFromSmarts(x) for x in self.MUTAGENIC_SMARTS]
        self.tumorigenic_patterns = [Chem.MolFromSmarts(x) for x in self.TUMORIGENIC_SMARTS]

    def calculate_properties(self, smiles: str) -> dict | None:
        """Computes physicochemical descriptors from a SMILES string."""
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return None
        return {
            'Mol': mol,
            'TPSA': Descriptors.TPSA(mol),
            'WLOGP': Descriptors.MolLogP(mol),
            'MW': Descriptors.MolWt(mol),
            'HBD': Descriptors.NumHDonors(mol),
            'HBA': Descriptors.NumHAcceptors(mol),
            'RB': Descriptors.NumRotatableBonds(mol)
        }

    def is_toxic(self, mol) -> bool:
        """Applies PAINS, mutagenic and tumorigenic filters."""
        if self.pains_catalog.GetFirstMatch(mol) is not None:
            return True
        if any(mol.HasSubstructMatch(patt) for patt in self.mutagenic_patterns):
            return True
        if any(mol.HasSubstructMatch(patt) for patt in self.tumorigenic_patterns):
            return True
        return False

    def predict_pgp(self, mw: float, tpsa: float, logp: float, hbd: int) -> str:
        """Predicts P-glycoprotein substrate likelihood via heuristic score."""
        score = sum([mw > 400, tpsa > 75, hbd >= 2, logp > 3.5])
        return "PGP+" if score >= 2 else "PGP-"

    def classify_bbb(self, tpsa: float, logp: float, mw: float, hbd: int, rb: int) -> str:
        """Classifies Blood-Brain Barrier permeability using the BOILED-Egg inner ellipse."""
        # Inner ellipse (yolk) for BBB
        ellipse_value = (((tpsa - 42) ** 2) / (47 ** 2)) + (((logp - 2.3) ** 2) / (2.2 ** 2))
        inside_ellipse = ellipse_value <= 1

        # Heuristic penalties
        penalty = sum([tpsa > 90, mw > 500, rb > 10, hbd > 2, logp < 0, logp > 6])
        return "BBB+" if (inside_ellipse and penalty <= 1) else "BBB-"

    def classify_hia(self, tpsa: float, logp: float) -> str:
        """Classifies Human Intestinal Absorption using the BOILED-Egg outer ellipse."""
        value = (((tpsa - 75) ** 2) / (75 ** 2)) + (((logp - 2.0) ** 2) / (3.0 ** 2))
        return "HIA+" if value <= 1 else "HIA-"


class BoiledEggPlotter:
    """Responsible for rendering and saving the BOILED-Egg chart."""
    
    @staticmethod
    def plot(df, output_path: str, output_image_file: str) -> None:
        """
        Generates the BOILED-Egg scatter plot (TPSA × WLOGP) and saves it as a PNG.

        Args:
            df: DataFrame with columns 'TPSA', 'WLOGP', 'BBB'.
            output_path: Absolute path to the output directory.
            output_image_file: Filename (including .png) to save.
        """
        import os
        os.makedirs(output_path, exist_ok=True)
        save_path = os.path.join(output_path, output_image_file)
        
        fig, ax = plt.subplots(figsize=(11, 8))
        ax.set_facecolor('#d9d9d9')

        # HIA region (egg white)
        white = Ellipse(xy=(75, 2.0), width=150, height=6.0, angle=0,
                        facecolor='white', edgecolor='black', linewidth=1.5)
        ax.add_patch(white)

        # BBB region (yolk)
        yolk = Ellipse(xy=(42, 2.3), width=94, height=4.4, angle=0,
                       facecolor='#ffe066', edgecolor='orange', linewidth=1.5)
        ax.add_patch(yolk)

        # Plot BBB+ and BBB- points
        bbb_plus = df[df['BBB'] == 'BBB+']
        bbb_minus = df[df['BBB'] == 'BBB-']

        ax.scatter(bbb_plus['TPSA'], bbb_plus['WLOGP'], color='red', s=55,
                   edgecolors='black', linewidths=0.4, alpha=0.85, label='BBB+')
        ax.scatter(bbb_minus['TPSA'], bbb_minus['WLOGP'], color='blue', s=55,
                   edgecolors='black', linewidths=0.4, alpha=0.75, label='BBB-')

        # Chart settings
        plt.xlim(0, 200)
        plt.ylim(-2, 7)
        plt.xlabel('TPSA (Å²)', fontsize=13)
        plt.ylabel('WLOGP', fontsize=13)
        plt.title('BOILED-Egg Plot', fontsize=15)
        plt.legend(loc='upper right')
        plt.tight_layout()

        plt.savefig(save_path, dpi=300)
        plt.close()  # Free pyplot memory
