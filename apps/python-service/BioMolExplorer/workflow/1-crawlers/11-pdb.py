"""!

PhD research 2023~2026

@title 
    BioMolExplorer: a general framework based on a target-ligand strategy to investigate the 
    physicochemical potential of compounds through information retrieval and pre-processing 
    molecular data.

@info
    A general crawler to look at targets and bioactive molecules on the ChEMBL database.

@authors 
   - Michel Pires da Silva (michel@cefetmg.br / Academic student)
   - Alisson Marques da Silva (alisson@cefetmg.br / Co Advisor)
   - Alex Gutterres Taranto   (taranto@ufsj.edu.br / Advisor)

@date 2023-2026

@copyright MIT License

@cond MIT_LICENSE
    BioMolExplorer is free software: you can redistribute it and/or modify
    it under the terms of the MIT License as published by
    the Massachusetts Institute of Technology.
    
    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
@endcond

"""

#----------------------------------------------------------------------------------------------
import sys 
sys.path.append("src")
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from wrappers.crawlers import load_pdb
from crawlers.complex import PolymerEntityType, ExperimentalMethod
#----------------------------------------------------------------------------------------------



if __name__ == "__main__":
    

    #----------------------------------------------------------------------------------------------
    #EXAMPLE 1: Load PDBs for the target Acetylcholinesterase
    # @param target: A reference name for the target, used to create the output folder
    # @param base_output_path: The base path to save the output files
    # @param pdb_ec: The Enzyme Commission number for the target
    # @param organism: The organism name for the target
    # @param PolymerEntityTypeID: The type of polymer entity (DNA, NA_HYBRID, PROTEIN, RNA, OTHER)
    # @param ExperimentalMethodID: The experimental method used to obtain the structure (X_RAY_DIFFRACTION,
    # ELECTRON_MICROSCOPY, SOLID_STATE_NMR, SOLUTION_NMR, NEUTRON_DIFFRACTION, FIBER_DIFFRACTION,
    # POWDER_DIFFRACTION, ELECTRON_CRYSTALLOGRAPHY, OTHER)
    # @param max_resolution: The maximum resolution for the structure
    # @param must_have_ligand: If the structure must have a ligand as part of the complex
    # @obs: The parameters are flexible and can be adjusted according to the research needs.
    #----------------------------------------------------------------------------------------------
        load_pdb(target='Acetylcholinesterase', 
                base_output_path='/datasets', 
                pdb_ec='3.1.1.7',
                PolymerEntityTypeID=[PolymerEntityType.PROTEIN],
                ExperimentalMethodID=[ExperimentalMethod.X_RAY_DIFFRACTION],
                max_resolution=2.0, must_have_ligand=True)
    
    
    #----------------------------------------------------------------------------------------------
    #EXAMPLE 2: Load PDBs for the target Butyrylcholinesterase
    # @param target: A reference name for the target, used to create the output folder
    # @param base_output_path: The base path to save the output files
    # @param pdb_ec: The Enzyme Commission number for the target
    # @param organism: The organism name for the target
    # @param PolymerEntityTypeID: The type of polymer entity (DNA, NA_HYBRID, PROTEIN, RNA, OTHER)
    # @param ExperimentalMethodID: The experimental method used to obtain the structure (X_RAY_DIFFRACTION,
    # ELECTRON_MICROSCOPY, SOLID_STATE_NMR, SOLUTION_NMR, NEUTRON_DIFFRACTION, FIBER_DIFFRACTION,
    # POWDER_DIFFRACTION, ELECTRON_CRYSTALLOGRAPHY, OTHER)
    # @param max_resolution: The maximum resolution for the structure
    # @param must_have_ligand: If the structure must have a ligand as part of the complex
    # @obs: The parameters are flexible and can be adjusted according to the research needs.
    #----------------------------------------------------------------------------------------------
    # load_pdb(target='Butyrylcholinesterase', 
    #          base_output_path='/datasets', 
    #          pdb_ec='3.1.1.8', 
    #          PolymerEntityTypeID=[PolymerEntityType.PROTEIN],
    #          ExperimentalMethodID=[ExperimentalMethod.X_RAY_DIFFRACTION],
    #          max_resolution=2.0, must_have_ligand=True)
    
    
    #----------------------------------------------------------------------------------------------
    #EXAMPLE 3: Load PDBs for the target Beta-secretase1
    # @param target: A reference name for the target, used to create the output folder
    # @param base_output_path: The base path to save the output files
    # @param pdb_ec: The Enzyme Commission number for the target
    # @param organism: The organism name for the target
    # @param PolymerEntityTypeID: The type of polymer entity (DNA, NA_HYBRID, PROTEIN, RNA, OTHER)
    # @param ExperimentalMethodID: The experimental method used to obtain the structure (X_RAY_DIFFRACTION,
    # ELECTRON_MICROSCOPY, SOLID_STATE_NMR, SOLUTION_NMR, NEUTRON_DIFFRACTION, FIBER_DIFFRACTION,
    # POWDER_DIFFRACTION, ELECTRON_CRYSTALLOGRAPHY, OTHER)
    # @param max_resolution: The maximum resolution for the structure
    # @param must_have_ligand: If the structure must have a ligand as part of the complex
    # @obs: The parameters are flexible and can be adjusted according to the research needs.
    #----------------------------------------------------------------------------------------------
    # load_pdb(target='Beta-secretase1', 
    #          base_output_path='/datasets', 
    #          pdb_ec='3.4.23.46', organism=['Homo sapiens'],
    #          PolymerEntityTypeID=[PolymerEntityType.PROTEIN],
    #          ExperimentalMethodID=[ExperimentalMethod.X_RAY_DIFFRACTION],
    #          max_resolution=1.7, must_have_ligand=True)