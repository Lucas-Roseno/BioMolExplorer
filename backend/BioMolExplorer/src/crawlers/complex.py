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
import os

from enum import Enum
from pathlib import Path
from Bio.PDB import PDBList
from Bio.PDB import PDBParser, Polypeptide
from rcsbsearchapi.const import STRUCTURE_ATTRIBUTE_SEARCH_SERVICE
from rcsbsearchapi.search import AttributeQuery
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from kernel.loggers import LoggerManager
#----------------------------------------------------------------------------------------------


class PolymerEntityType(Enum):
    DNA = "DNA"
    NA_HYBRID = "NA-hybrid"
    OTHER = "Other"
    RNA = "RNA"
    PROTEIN = "Protein"


class ExperimentalMethod(Enum):
    ELECTRON_CRYSTALLOGRAPHY = "ELECTRON CRYSTALLOGRAPHY"
    ELECTRON_MICROSCOPY = "ELECTRON MICROSCOPY"
    EPR = "EPR"
    FIBER_DIFFRACTION = "FIBER DIFFRACTION"
    FLUORESCENCE_TRANSFER = "FLUORESCENCE TRANSFER"
    INFRARED_SPECTROSCOPY = "INFRARED SPECTROSCOPY"
    NEUTRON_DIFFRACTION = "NEUTRON DIFFRACTION"
    POWDER_DIFFRACTION = "POWDER DIFFRACTION"
    SOLID_STATE_NMR = "SOLID-STATE NMR"
    SOLUTION_NMR = "SOLUTION NMR"
    SOLUTION_SCATTERING = "SOLUTION SCATTERING"
    THEORETICAL_MODEL = "THEORETICAL MODEL"
    X_RAY_DIFFRACTION = "X-RAY DIFFRACTION"
        


class PDBComplex():

    def __init__(self, output_path=None):
        self.__path = str(Path.cwd()) 
        self.set_outputpath(output_path) if output_path != None else None
        self.logger = LoggerManager.get_logger(self.__class__.__name__, log_file='logs/complex.log')



    def set_outputpath(self, output_path:str):
        self.__outputpath = output_path
        if not os.path.exists(self.__path + self.__outputpath):
            os.makedirs(self.__path + self.__outputpath, exist_ok=True)
            


    def get_pdb_ids_with_filters(self, filter_params:dict) -> list:
        
        try:

            queries = []
            if 'ec_target' in filter_params and filter_params['ec_target']:
                queries.append(AttributeQuery("rcsb_polymer_entity.rcsb_ec_lineage.id", "exact_match", filter_params['ec_target'], STRUCTURE_ATTRIBUTE_SEARCH_SERVICE))
            if 'PolymerEntityTypeID' in filter_params and filter_params['PolymerEntityTypeID']:
                polymer = AttributeQuery("entity_poly.rcsb_entity_polymer_type", "exact_match", filter_params['PolymerEntityTypeID'][0].value, STRUCTURE_ATTRIBUTE_SEARCH_SERVICE)
                for polymer_type in filter_params['PolymerEntityTypeID'][1:]:
                    polymer |= AttributeQuery("entity_poly.rcsb_entity_polymer_type", "exact_match", polymer_type.value, STRUCTURE_ATTRIBUTE_SEARCH_SERVICE)
                queries.append(polymer)
            if 'organism' in filter_params and filter_params['organism']:
                organism = AttributeQuery("rcsb_entity_source_organism.taxonomy_lineage.name", "exact_match", filter_params['organism'][0], STRUCTURE_ATTRIBUTE_SEARCH_SERVICE)
                for org in filter_params['organism'][1:]:
                    organism |= AttributeQuery("rcsb_entity_source_organism.taxonomy_lineage.name", "exact_match", org, STRUCTURE_ATTRIBUTE_SEARCH_SERVICE)
                queries.append(organism)
            if 'ExperimentalMethodID' in filter_params and filter_params['ExperimentalMethodID']:
                ExpMethod = AttributeQuery("exptl.method", "exact_match", filter_params['ExperimentalMethodID'][0].value, STRUCTURE_ATTRIBUTE_SEARCH_SERVICE)
                for method in filter_params['ExperimentalMethodID'][1:]:
                    ExpMethod |= AttributeQuery("exptl.method", "exact_match", method.value, STRUCTURE_ATTRIBUTE_SEARCH_SERVICE)
                queries.append(ExpMethod)
            if 'max_resolution' in filter_params and filter_params['max_resolution'] != None:
                queries.append(AttributeQuery("rcsb_entry_info.resolution_combined", "less_or_equal", filter_params['max_resolution'], STRUCTURE_ATTRIBUTE_SEARCH_SERVICE))
            if 'must_have_ligand' in filter_params and filter_params['must_have_ligand']:
                queries.append(AttributeQuery("rcsb_entry_info.nonpolymer_entity_count", "greater", 0, STRUCTURE_ATTRIBUTE_SEARCH_SERVICE))
                
            if queries:
                combined_query = queries[0]
                for query in queries[1:]:
                    combined_query &= query  
                
                results = list(combined_query())
                
                return results
            else:
                return None
        
        except Exception as e:
            self.logger.error(f'Error during to perform {filter_params['ec_target']} in get_pdb_ids_with_filters function', exc_info=True)
    

    def __identify_ligands(self, pdb_file):
        
        try:
            parser = PDBParser(QUIET=True)
            structure = parser.get_structure('structure', pdb_file)
            
            resolution = structure.header.get('resolution', None)

            ligands = []
            for model in structure:
                for chain in model:
                    for residue in chain:
                        if Polypeptide.is_aa(residue, standard=True):
                            continue
                        if residue.id[0] != ' ' and residue.resname != 'HOH':
                            ligands.append((residue.resname, residue.id[1], chain.id))
            
            return set(ligands), resolution
        
        except Exception as e:
            return None

    def get_pdb_files(self, filters:dict):
        
        try:

            pdb_crawler = PDBList()
            pdb_codes = self.get_pdb_ids_with_filters(filters)

            if pdb_codes:
                pdb_crawler.download_pdb_files(pdb_codes, pdir=self.__outputpath, file_format='pdb', overwrite=True, max_num_threads=os.cpu_count()-1)
                
                datain  = [os.path.join(self.__outputpath, 'pdb' + code.lower() + '.ent') for code in pdb_codes]
                dataout = [os.path.join(self.__outputpath, code + '.pdb') for code in pdb_codes]
                codes   = {}

                for input, output, idx in zip(datain, dataout, pdb_codes): 

                    with open(input, 'r') as entrada, open(output, 'w') as saida:
                        for linha in entrada:
                            if not linha.startswith(('LINK', 'SSBOND')):
                                saida.write(linha)
                    
                    os.remove(input)
                    tmp = self.__identify_ligands(output) 
                    if tmp != None:
                        codes[idx] = tmp
                     
                with open(os.path.join(self.__outputpath, 'pdb_codes.csv'), 'w') as fp:
                    fp.write('PDB_CODE,LIGAND,RESNUM,CHAIN,RESOLUTION\n')
                    for code in codes.keys():
                        resolution = codes[code][1]
                        for lig in codes[code][0]:
                            fp.write(f'{code},{lig[0]},{lig[1]},{lig[2]},{resolution}\n')
                        
                    
                    
                print('[INFO]: ATTENTION: If you need to use DOCK6 functions, you must resolve the non-existent loops in the complexes before!')

            else:
                print('[INFO]: ATTENTION: Filter combination is not valid, refactore and execute again!')
         
            
        except Exception as e:
            self.logger.error(f'Error during to perform the get_pdb_files function', exc_info=True)