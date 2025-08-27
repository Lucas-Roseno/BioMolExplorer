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
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from crawlers.settings import CrawlerSettings
from kernel.utilities import fileHandling
from kernel.loggers import LoggerManager
#----------------------------------------------------------------------------------------------


class Targets(CrawlerSettings):

    def __init__(self, path=None, extension='csv') -> None:
        super().__init__()
        self.__target    = super().get_client_connection().target
        self.__path      = str(Path.cwd())
        self.__extension = extension
        self.logger      = LoggerManager.get_logger(self.__class__.__name__, log_file='logs/targets.log')
        self.set_outputpath(path) if path != None else None
        
    
    def set_outputpath(self, path:str):
        self.__outputpath = path 
        if not os.path.exists(self.__path + self.__outputpath):
            os.makedirs(self.__path + self.__outputpath, exist_ok=True)
      
     
       
    def search(self, target_name:str, filter_params:dict) -> None:
        
        try:
            files   = fileHandling(input_path=self.__outputpath, ext=self.__extension)
            target_name = target_name.upper()
            infile  =  files.isFile(target_name)[0]
            columns = ['pref_name', 'target_chembl_id', 'target_components', 'target_type']

            filter_params["pref_name__iexact"] =  target_name
            
            target = files.csv_to_dataframe(target_name) if infile else self.__target.filter(**filter_params).only(columns)
            

            if len(target) > 0:
                target = DataFrame.from_records(target)
                target.drop_duplicates(subset='target_chembl_id', inplace=True, ignore_index=True)
                target = target[columns] if infile and len(columns) > 0 else target
            else:
                target = DataFrame()
            
            self.save_target(target, target_name) if self.__outputpath != None else None
            
        except Exception as e:
            self.logger.error(f'Error during to perform {target_name} target in search function', exc_info=True)
            
    
     

    def save_target(self, targets:DataFrame, file_name:str) -> None:
        files   = fileHandling(output_path=self.__outputpath, ext=self.__extension)
        infile  =  files.isFile(file_name)[1]
        if targets.shape[0] > 0 and not infile:
            files.dataframe_to_csv(file_name.upper(), targets)
            
            
            
        
    
