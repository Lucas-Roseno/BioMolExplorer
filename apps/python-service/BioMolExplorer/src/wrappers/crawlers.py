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
import os
import json
sys.path.append("src")

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
        # Resolve path relative to the package root (apps/python-service/BioMolExplorer/)
        # __file__ -> .../src/wrappers/crawlers.py
        # go up 3 levels: wrappers -> src -> BioMolExplorer (package root)
        package_root = Path(__file__).resolve().parents[2]
        full_path = package_root / path.lstrip('/')
        with open(full_path, 'r') as fp:
            filters = json.load(fp)
        return filters
    except Exception as e:
        logger.error(f'Error reading filters from {path}: {str(e)}', exc_info=True)
        raise


_ALIASES_PATH = '/src/scripts/crawlers/target_aliases.json'

def resolve_target_alias(target_name: str) -> str:
    """Resolve um nome popular/alternativo para o pref_name oficial no ChEMBL.
    Retorna o nome original caso não haja alias mapeado.
    A busca no dicionário é case-insensitive."""
    try:
        aliases = read_filters(_ALIASES_PATH)
        # Ignora a chave especial de comentário
        aliases = {k: v for k, v in aliases.items() if not k.startswith('_')}
        # Busca case-insensitive
        lower_map = {k.lower(): v for k, v in aliases.items()}
        resolved = lower_map.get(target_name.lower(), target_name)
        if resolved != target_name:
            logger.info(f"Alias resolvido: '{target_name}' -> '{resolved}' (ChEMBL pref_name)")
        return resolved
    except Exception:
        # Se o arquivo de aliases não existir ou falhar, continua com o nome original
        return target_name


def load_chembl(target_name:str, base_output_path:str):
    try:
        base_path = base_output_path.lstrip('/')
        
        target_output_path = f'/{os.path.join(base_path, "ChEMBL", "targets")}/'
        target_name_clean = target_name.replace(' ', '')
        bioactivity_output_path = f'/{os.path.join(base_path, "ChEMBL", "bioactivity", target_name_clean)}/'
        molecule_output_path = f'/{os.path.join(base_path, "ChEMBL", "molecules", target_name_clean)}/'
        similar_output_path = f'/{os.path.join(base_path, "ChEMBL", "similars", target_name_clean)}/'

        target = Targets()
        bioact = Bioactivity()
        mols = Molecule()
        sims = SimilarMols()

        # Resolve alias antes de buscar no ChEMBL (ex: 'Butyrylcholinesterase' -> 'Cholinesterase')
        chembl_target_name = resolve_target_alias(target_name)

        script_path = '/src/scripts/crawlers/target.json'
        filters = read_filters(script_path)
        
        # Remove campos que o frontend salva mas que não são filtros válidos da API ChEMBL
        if 'target_name' in filters:
            del filters['target_name']
            
        target.set_outputpath(target_output_path)
        target.search(chembl_target_name, filters)

        # Check if target was actually found by looking for the generated file
        from kernel.config import BIOMOL_ROOT
        target_file = os.path.join(BIOMOL_ROOT, target_output_path.lstrip('/'), f"{chembl_target_name.upper()}.csv")
        if not os.path.exists(target_file):
             raise ValueError(f"Target '{target_name}' not found in ChEMBL with the provided filters.")

        script_path = '/src/scripts/crawlers/bioactivity.json'
        filters = read_filters(script_path)
        bioact.set_outputpath(bioactivity_output_path)
        bioact.set_targetpath(target_output_path)
        bioact.search(chembl_target_name, filters)

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

        drugbank_output_path = f'/{os.path.join(base_path, "ChEMBL", "DrugBank")}/'
        molecules = fileHandling(output_path=drugbank_output_path)

        molecules.prepare_datamols(target=target_name,
                                   inputpath_mols=molecule_output_path,
                                   inputpath_similars=similar_output_path)
    
    except Exception as e:
        logger.error(f'Error in load_chembl for {target_name}: {str(e)}', exc_info=True)
        raise


def is_valid(value):
    return value is not None and (not isinstance(value, str) or value.strip() != '')


def load_pdb(target:str, base_output_path:str, pdb_ec:Optional[str]=None, organism:Optional[List[str]]=None,
             PolymerEntityTypeID:Optional[List[PolymerEntityType]]=None,
             ExperimentalMethodID:Optional[List[ExperimentalMethod]]=None,
             max_resolution:Optional[float]=None, must_have_ligand:Optional[bool]=True):
    try:
        base_path = base_output_path.lstrip('/')
        pdb_output_path = f'/{os.path.join(base_path, "PDB", target.replace(" ", ""))}/'
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
    
    except Exception as e:
        logger.error(f'Error in load_pdb for {target}: {str(e)}', exc_info=True)
        raise


def load_zinc(base_output_path:str, filename:str, verbose=False):
    try:
        base_path = base_output_path.lstrip('/')
        zinc = ZincMols()
        output = filename.split('.')[0]

        zinc_output_path = f'/{base_path}/'
        zinc.set_uri_inputpath(f'/{os.path.join(base_path, filename)}')
        zinc.set_outputpath(zinc_output_path)
        zinc.search(output_filename=output, verbose=verbose)
            
    except Exception as e:
        logger.error(f'Error in load_zinc: {str(e)}', exc_info=True)
        raise