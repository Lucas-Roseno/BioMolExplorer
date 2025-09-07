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
#Configure PYTHONPATH to perform execution using the project classes
import sys 
sys.path.append("src")

import json
from pathlib import Path
from typing import Optional, List
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from crawlers.targets import Targets
from crawlers.bioactivities import Bioactivity
from crawlers.molecules import Molecule
from crawlers.molecules import SimilarMols
from crawlers.molecules import ZincMols
from crawlers.complex import PDBComplex, PolymerEntityType, ExperimentalMethod

from kernel.loggers import LoggerManager
from kernel.utilities import fileHandling
#----------------------------------------------------------------------------------------------


logger = LoggerManager.get_logger('crawlers', log_file='logs/loaders.log')


def read_filters(path:str):

    try:
        path = str(Path.cwd()) + path
        with open(path, 'r') as fp:
            filters = json.load(fp)
        return filters
    
    except Exception as e:
        logger.error(f'Error during to perform {path} in read_filters wrapper function', exc_info=True)



def load_chembl(target_name:str, base_output_path:str):

    try:
        target_output_path = f'{base_output_path}/ChEMBL/targets/'
        bioactivity_output_path = f'{base_output_path}/ChEMBL/bioactivity/{target_name.replace(' ','')}/'
        molecule_output_path = f'{base_output_path}/ChEMBL/molecules/{target_name.replace(' ','')}/'
        similar_output_path = f'{base_output_path}/ChEMBL/similars/{target_name.replace(' ','')}/'
        

        target = Targets()
        bioact = Bioactivity()
        mols = Molecule()
        sims = SimilarMols()

        script_path = '/src/scripts/crawlers/target.json'
        filters = read_filters(script_path)
        target.set_outputpath(target_output_path)
        target.search(target_name, filters)

        script_path = '/src/scripts/crawlers/bioactivity.json'
        filters = read_filters(script_path)
        bioact.set_outputpath(bioactivity_output_path)
        bioact.set_targetpath(target_output_path)
        bioact.search(target_name, filters)

        script_path = '/src/scripts/crawlers/molecules.json'
        filters = read_filters(script_path)
        mols.set_outputpath(molecule_output_path)
        mols.set_bioactivitypath(bioactivity_output_path)
        mols.search(filters)

        script_path = '/src/scripts/crawlers/similarmols.json'
        filters = read_filters(script_path)
        sims.set_outputpath(similar_output_path)
        sims.set_bioactivitypath(bioactivity_output_path)
        sims.search(filters)


        drugbank_output_path = f'{base_output_path}/ChEMBL/DrugBank/'
        molecules = fileHandling(output_path=drugbank_output_path)

        molecules.prepare_datamols(target=target_name,
                                   inputpath_mols=molecule_output_path,
                                   inputpath_similars=similar_output_path)
    
    except Exception as e:
        logger.error(f'Error during to perform {target_name} in load_chembl wrapper function', exc_info=True)



def is_valid(value):
    return value is not None and (not isinstance(value, str) or value.strip() != '')


def load_pdb(target:str, base_output_path:str, pdb_ec:Optional[str]=None, organism:Optional[List[str]]=None,
             PolymerEntityTypeID:Optional[List[PolymerEntityType]]=None,
             ExperimentalMethodID:Optional[List[ExperimentalMethod]]=None,
             max_resolution:Optional[float]=None, must_have_ligand:Optional[bool]=True):

    pdb_output_path = f'{base_output_path}/PDB/{target.replace(' ','')}/'
    pdb = PDBComplex(output_path=pdb_output_path)

    filters = {
        key: value
        for key, value in {
            'PolymerEntityTypeID': PolymerEntityTypeID,
            'ExperimentalMethodID': ExperimentalMethodID,
            'ec_target': pdb_ec,
            'organism': organism,
            'max_resolution': max_resolution,
            'must_have_ligand': must_have_ligand
        }.items()
        if is_valid(value)
    }
    
    pdb.get_pdb_files(filters=filters)




def load_zinc(base_output_path:str, zinc2d=True, zinc3d=True, verbose=False):

    try:
        
        zinc = ZincMols()
    
        if zinc2d:
            zinc_output_path = f'{base_output_path}/ZINC/'
            zinc.set_uri_inputpath(f'{base_output_path}/ZINC/zinc_2d.uri')
            zinc.set_outputpath(zinc_output_path)
            zinc.search(output_filename='ZINC2D', verbose=verbose)
            
        if zinc3d:
            zinc_output_path = f'{base_output_path}/ZINC/'
            zinc.set_uri_inputpath(f'{base_output_path}/ZINC/zinc_3d.uri')
            zinc.set_outputpath(zinc_output_path)
            zinc.search(output_filename='ZINC3D', verbose=verbose)

    except Exception as e:
        logger.error(f'Error during to perform the wrapper load_zinc function', exc_info=True)