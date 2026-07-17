#----------------------------------------------------------------------------------------------
#Configure PYTHONPATH to perform execution using the project classes
import sys 
sys.path.append("src")
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from kernel.header_builder import HeaderBuilder

__doc__ = HeaderBuilder.build(

    module_title="ADMET analysis",

    module_description=(
    "Main functions for managing and integrating docking " 
    "analysis available in the wrappers folder (docking.py)"
),

    module_version="1.0.0"
)
#----------------------------------------------------------------------------------------------


#----------------------------------------------------------------------------------------------
from wrappers.docking import perform_consensus
#----------------------------------------------------------------------------------------------


from kernel.config import BIOMOL_ROOT

if __name__ == "__main__":


    perform_consensus(base_input_path=BIOMOL_ROOT + 'datasets/PDB',
                      target='Acetylcholinesterase',
                      pdb_code=('9L27', 'ACT', 301, 'A'),
                      base_output_path=BIOMOL_ROOT + 'resultados/docking',
                      base_selected_mols=BIOMOL_ROOT + 'datasets/ChEMBL/DrugBank/Molecules',
                      mol_filename='molecules',
                      dock6_app_path='/home/lucas-roseno/progs/dock6/',
                      prepare_complex=False, charge_type='am1')
    
   
    