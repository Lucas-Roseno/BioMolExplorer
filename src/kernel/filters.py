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
from pandas import DataFrame
from pathlib import Path

from rdkit import Chem
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from kernel.loggers import LoggerManager
#----------------------------------------------------------------------------------------------


class MyFilters():
    
    def __init__(self) -> None:
        self.path   = str(Path.cwd())
        self.logger = LoggerManager.get_logger(self.__class__.__name__, log_file='logs/filters.log')
        
    def get_path(self):
        return self.path
        


class LookupWizard(MyFilters):
    
    def __init__(self) -> None:
        super(MyFilters, self).__init__()
    
        
    def filter(self, input:DataFrame, query:str) -> DataFrame:
        
        try:

            result = input.query(query)
            return result
        
        except Exception as e:
            self.logger.error(f'Error during to perform {query} in filter function', exc_info=True)
        



class Molecule(MyFilters):
    
    def __init__(self) -> None:
        super(MyFilters, self).__init__()
    
    
    def clean_fragments(self, smiles:list) -> list:
        
        try:

            molecules  = [Chem.MolFromSmiles(s) for s in smiles]
            molecules = [smi for smi, mol in zip(smiles, molecules) if Chem.GetMolFrags(mol) == 1]
            return molecules
        
        except Exception as e:
            self.logger.error(f'Error during to perform the clean_fragments function', exc_info=True)
    
    
    
    def remove_duplicates(self, smiles:list) -> list:
        
        try:
            
            molecules = set([Chem.CanonSmiles(smi) for smi in smiles])
            return list(molecules)
        
        except Exception as e:
            self.logger.error(f'Error during to perform the remove_duplicates function', exc_info=True)
        
            
        