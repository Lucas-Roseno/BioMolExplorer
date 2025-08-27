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

from pandas import DataFrame
from pathlib import Path
from concurrent import futures
from typing import Optional
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from crawlers.settings import CrawlerSettings
from kernel.utilities import fileHandling
from kernel.loggers import LoggerManager
#----------------------------------------------------------------------------------------------



class Bioactivity(CrawlerSettings):


    def __init__(self, target_path=None, path=None, extension='csv') -> None:
        super().__init__()
        self.__bioactivity = super().get_client_connection().activity
        self.__path = str(Path.cwd())
        self.__extension   = extension
        self.set_outputpath(path) if path != None else None
        self.set_targetpath(target_path) if target_path != None else None
        self.logger = LoggerManager.get_logger(self.__class__.__name__, log_file='logs/bioactivities.log')
        
        
        
    def set_targetpath(self, path:str):
        self.__targetpath = path
        if not os.path.exists(self.__path + self.__targetpath):
            print('[ERROR]: The target path needs to be informed before!')
            exit(1)
        
    
        
    def set_outputpath(self, path:str):
        self.__outputpath = path 
        if not os.path.exists(self.__path + self.__outputpath):
            os.makedirs(self.__path + self.__outputpath, exist_ok=True)
        
    
    
            
    def __search_bioactivity(self, target_id:str, filter_params:dict) -> None:
        
        try:
            files   = fileHandling(input_path=self.__outputpath, ext=self.__extension)
            infile  =  files.isFile(target_id)[0]

            max_value_ref = filter_params.pop('max_value_ref') if 'max_value_ref' in filter_params else 10000
            filter_params['target_chembl_id'] = target_id
            
            columns = ['activity_id', 'activity_properties', 'canonical_smiles', 'molecule_chembl_id', 'molecule_pref_name', 
                    'parent_molecule_chembl_id', 'pchembl_value', 'qudt_units', 'target_organism', 'target_pref_name', 'type', 'units', 'value']
            
            bioact = files.csv_to_dataframe(target_id) if infile else self.__bioactivity.filter(**filter_params).only(columns)
            
            if len(bioact) > 0:
                bioact = DataFrame.from_records(bioact)
                bioact.dropna(subset=['value', 'canonical_smiles'], inplace=True)
                bioact = bioact.astype({'value':float})
                bioact = bioact[columns] if infile and len(columns) > 0 else bioact
            else:
                bioact = DataFrame()

            bioact = bioact[bioact['value'] <= max_value_ref]
            self.save_bioactivity(bioact, target_id)
        
        except Exception as e:
            self.logger.error(f'Error during to perform {target_id} in __search_bioactivity function', exc_info=True)
            
        
    
    
    def search(self, target:str, filter_params:dict) -> None:
        
        files       = fileHandling(input_path=self.__targetpath, ext=self.__extension)
        target_ids  = files.csv_to_dataframe(target.upper())
        target_ids  = target_ids['target_chembl_id'].tolist()
        
        
        with futures.ThreadPoolExecutor(max_workers=10) as executor:
            pool = {executor.submit(self.__search_bioactivity, target, filter_params) : target for target in target_ids}

        [future.result() for future in pool]
             
        
        
    def save_bioactivity(self, bioactivity:DataFrame, file_name:str) -> None:
        files   = fileHandling(output_path=self.__outputpath, ext=self.__extension)
        infile  =  files.isFile(file_name)[1]
        if bioactivity.shape[0] > 0 and not infile:
            files.dataframe_to_csv(file_name, bioactivity)
            
            
    
            
            
    
