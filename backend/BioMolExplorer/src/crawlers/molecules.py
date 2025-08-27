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
import requests

from pandas import DataFrame, concat
from concurrent import futures
from threading import Lock
from pathlib import Path
from typing import Optional
import ast
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from kernel.utilities import fileHandling, fileReading
from kernel.loggers import LoggerManager
from crawlers.settings import CrawlerSettings
#----------------------------------------------------------------------------------------------


class MyMolecules():
    
    def __init__(self) -> None:
        self.path   = str(Path.cwd())
        self.logger = LoggerManager.get_logger(self.__class__.__name__, log_file='logs/molecules.log')
        
    def get_path(self):
        return self.path
        


class Molecule(CrawlerSettings, MyMolecules):
    
    def __init__(self, path=None, bioactivity_path=None, extension='csv') -> None:
        CrawlerSettings.__init__(self)
        MyMolecules.__init__(self)
        self.__molecule    = self.get_client_connection().molecule
        self.__extension   = extension
        self.set_outputpath(path) if path != None else None
        self.set_bioactivitypath(bioactivity_path) if bioactivity_path != None else None
    
    
    
    def set_bioactivitypath(self, path:str):
        self.__bioactivitypath = path
        if not os.path.exists(self.get_path() + self.__bioactivitypath):
            print('[ERROR]: The bioactivity path needs to be informed before!')
            exit(1)
    
    
    def set_outputpath(self, path:str):
        self.__outputpath = path 
        if not os.path.exists(self.get_path() + self.__outputpath):
            os.makedirs(self.get_path() + self.__outputpath, exist_ok=True)
            
     
    def str_to_dict(self, value):
        if isinstance(value, dict):  
            converted = value  
        elif isinstance(value, str):  
            try:
                converted = ast.literal_eval(value)  
            except (SyntaxError, ValueError):
                return {}  
        else:
            return {}  

        if 'full_mwt' in converted:
            try:
                converted['full_mwt'] = float(converted['full_mwt'])
            except (ValueError, TypeError):
                converted['full_mwt'] = float('inf')

        return converted 



    def __search_mol(self, molecule_id:str, filter_params:dict, np_filter:int, mol_filter:str, mwt_filter:float) -> None:
        
        try:
            files   = fileHandling(input_path=self.__outputpath, ext=self.__extension)
            infile  =  files.isFile(molecule_id)[0]

            filter_params['molecule_chembl_id'] = molecule_id
            
            molecule = files.csv_to_dataframe(molecule_id) if infile else self.__molecule.filter(**filter_params)
            
            try:
                molecule = DataFrame.from_records(molecule)
                molecule.drop_duplicates(subset='molecule_chembl_id', inplace=True, ignore_index=True)
                
                molecule['molecule_type']   = molecule['molecule_type'].astype(str).str.lower()
                molecule['natural_product'] = molecule['natural_product'].fillna(-1).astype(int)
                molecule['natural_product'] = molecule['natural_product'].astype(int)
                molecule['molecule_properties'] = molecule['molecule_properties'].apply(self.str_to_dict)
                

                if np_filter == 0:
                    molecule = molecule[molecule['natural_product'] == np_filter]
                if mol_filter:
                    molecule = molecule[molecule['molecule_type'] == mol_filter]
                if mwt_filter:
                    molecule = molecule[molecule['molecule_properties'].apply(lambda x: x.get('full_mwt', float('inf')) <= mwt_filter)]
                
                    

            except Exception as e:
                self.logger.error(f'Error during to perform {molecule_id} molecule in __search_mol function', exc_info=True)
                molecule = DataFrame()
            
            self.save_molecule(molecule, molecule_id) if molecule.shape[0] > 0 else None
        
        except Exception as e:
            self.logger.error(f'Error during to perform {molecule_id} molecule in __search_mol function', exc_info=True)

       
    
    
    def save_molecule(self, molecule:DataFrame, file_name:str) -> None:
        files   = fileHandling(output_path=self.__outputpath, ext=self.__extension)
        infile  =  files.isFile(file_name)[1]
        if molecule.shape[0] > 0 and not infile:
            files.dataframe_to_csv(file_name, molecule)
            
    
    
            
    def search(self, filter_params:dict):
        
        f1    = fileHandling(input_path=self.__bioactivitypath, ext=self.__extension)
        files = [f.rsplit('.')[0] for f in os.listdir(self.__bioactivitypath[1:]) if f.endswith('.csv')]
        
        mols = []
        for file in files:
            tmp  = f1.csv_to_dataframe(file)
            mols  = mols + tmp['molecule_chembl_id'].tolist()
        
        np_filter  = filter_params.pop('natural_product', None)
        np_filter  = int(np_filter) if np_filter != None else None

        mol_filter = filter_params.pop('molecule_type', None)
        mol_filter = mol_filter.lower() if mol_filter != None else None

        mwt_filter = filter_params.pop('molecule_weight', None)
        mwt_filter = float(mwt_filter) if mwt_filter != None else None
        
        
        with futures.ThreadPoolExecutor(max_workers=10) as executor:
            pool = {executor.submit(self.__search_mol, mol, filter_params, np_filter, mol_filter, mwt_filter) : mol for mol in mols}

        [future.result() for future in pool]
        
        
    
    



class SimilarMols(CrawlerSettings, MyMolecules):

    def __init__(self, path:Optional[str]=None,  bioactivity_path:Optional[str]=None, extension:Optional[str]='csv') -> None:
        CrawlerSettings.__init__(self)
        MyMolecules.__init__(self)
        self.__similarity  = self.get_client_connection().similarity
        self.__extension   = extension
        self.set_outputpath(path) if path != None else None
        self.set_bioactivitypath(bioactivity_path) if bioactivity_path != None else None
        
        
    
    def set_bioactivitypath(self, path:str):
        self.__bioactivitypath = path
        if not os.path.exists(self.get_path() + self.__bioactivitypath):
            print('[ERROR]: The bioactivity path needs to be informed before!')
            exit(1)
    

    def set_outputpath(self, path:str):
        self.__outputpath = path 
        if not os.path.exists(self.get_path() + self.__outputpath):
            os.makedirs(self.get_path() + self.__outputpath, exist_ok=True)
            
      
    def str_to_dict(self, value):
        if isinstance(value, dict):  
            converted = value  
        elif isinstance(value, str):  
            try:
                converted = ast.literal_eval(value)  
            except (SyntaxError, ValueError):
                return {}  
        else:
            return {}  

        if 'full_mwt' in converted:
            try:
                converted['full_mwt'] = float(converted['full_mwt'])
            except (ValueError, TypeError):
                converted['full_mwt'] = float('inf')

        return converted 


    def __search_similar_mols(self, molecule_id:str, filter_params:dict, np_filter:int, mol_filter:str, mwt_filter:float) -> None:
        
        try:
            files   = fileHandling(input_path=self.__outputpath, ext=self.__extension)
            infile  =  files.isFile(molecule_id)[0]

            filter_params['chembl_id'] = molecule_id
            
            molecules = files.csv_to_dataframe(molecule_id) if infile else self.__similarity.filter(**filter_params)
            
            try:
                
                molecules = DataFrame.from_records(molecules)
                molecules['molecule_type'] = molecules['molecule_type'].astype(str).str.lower()
                molecules['natural_product'] = molecules['natural_product'].fillna(-1).astype(int)
                molecules['natural_product'] = molecules['natural_product'].astype(int)
                molecules['molecule_properties'] = molecules['molecule_properties'].apply(self.str_to_dict)
                

                if np_filter == 0:
                    molecules = molecules[molecules['natural_product'] == np_filter]
                if mol_filter:
                    molecules = molecules[molecules['molecule_type'] == mol_filter]
                if mwt_filter:
                    molecules = molecules[molecules['molecule_properties'].apply(lambda x: x.get('full_mwt', float('inf')) <= mwt_filter)]

            except:
                molecules = DataFrame()

            self.save_molecule(molecules, molecule_id) if molecules.shape[0] > 0 else None
            
        except Exception as e:
            self.logger.error(f'Error during to perform {molecule_id} molecule in __search_similar_mols function', exc_info=True)
            
        
     
    
    def save_molecule(self, molecule:DataFrame, file_name:str) -> None:
        files   = fileHandling(output_path=self.__outputpath, ext=self.__extension)
        infile  =  files.isFile(file_name)[1]
        if molecule.shape[0] > 0 and not infile:
            files.dataframe_to_csv(file_name, molecule)



    def search(self, filter_params:dict) -> None:
        
        f1    = fileHandling(input_path=self.__bioactivitypath, ext=self.__extension)
        files = [f.rsplit('.')[0] for f in os.listdir(self.__bioactivitypath[1:]) if f.endswith('.csv')]
        
        mols = []
        for file in files:
            tmp  = f1.csv_to_dataframe(file)
            mols  = mols + tmp['molecule_chembl_id'].tolist()
        
        np_filter  = filter_params.pop('natural_product', None)
        np_filter  = int(np_filter) if np_filter != None else None

        mol_filter = filter_params.pop('molecule_type', None)
        mol_filter = mol_filter.lower() if mol_filter != None else None

        mwt_filter = filter_params.pop('molecule_weight', None)
        mwt_filter = float(mwt_filter) if mwt_filter != None else None

        with futures.ThreadPoolExecutor(max_workers=10) as executor:
            pool = {executor.submit(self.__search_similar_mols, mol, filter_params, np_filter, mol_filter, mwt_filter) : mol for mol in mols}

        [future.result() for future in pool]
        
        



class ZincMols(MyMolecules):

    def __init__(self, uri_filename:Optional[str]=None, outputpath:Optional[str]=None) -> None:
        super().__init__()
        self.set_uri_inputpath(uri_filename) if uri_filename != None else None
        self.set_outputpath(outputpath) if outputpath != None else None
        self.lock = Lock()
        
        

    def set_uri_inputpath(self, path:str):
        self.__uri_inputpath = path
        if not os.path.exists(self.get_path() + self.__uri_inputpath):
            print('[ERROR]: The uri path needs to be informed before!')
            exit(1)
            

    def set_outputpath(self, path:str):
        self.__outputpath = path 
        if not os.path.exists(self.get_path() + self.__outputpath):
            os.makedirs(self.get_path() + self.__outputpath, exist_ok=True)
            
            

    def __search_in_zinc(self, idx, url, verbose) -> DataFrame:
        
        url = url.strip() 
        mol = DataFrame(columns=['smile', 'zinc_id'])
            
        try:
                
            response = requests.get(url, timeout=120)
                
            if response.status_code == 200:
                conteudo = response.text.splitlines()[1:]
                conteudo = [token.split(' ') for token in conteudo]
                mol = DataFrame(conteudo, columns=['smile', 'zinc_id'])
                print('File number:', idx, ' URL:', url) if verbose else None 
            
            return mol
                    
        except Exception as e:
            self.logger.error(f'Error during to perform {idx} molecule in {url} url in __search_in_zinc function', exc_info=True)
            
         


    def search(self, output_filename='zinc', verbose=False) -> None:
        
        try:
            
            files = fileHandling(output_path=self.__outputpath, ext='csv')
            uri   = self.__uri_inputpath[:self.__uri_inputpath.rfind('/')+1]
            urls  = fileReading(inputpath=uri, file=self.__uri_inputpath.rsplit('/')[-1])
            mols  = DataFrame(columns=['smile', 'zinc_id'])
            files.dataframe_to_csv(output_filename, mols)

            chunk_size   = 100
            chunk_number = 0
            max_itens    = urls.get_size()
            processed    = 0
            
            with futures.ThreadPoolExecutor(max_workers=os.cpu_count() - 1) as executor:
                while(processed < max_itens):
                    data = urls.get_chunk(chunk_number, chunk_size)
                    chunk_number += 1
                    idx = processed
                    processed += len(data)
                   
                    
                    pool = {executor.submit(self.__search_in_zinc, item[0]+idx, item[1], verbose) : item for item in enumerate(data)}
                    for future in pool:
                        tmp = future.result()
                        if isinstance(tmp, DataFrame):
                            with self.lock:
                                files.dataframe_to_csv(output_filename, tmp, mode='a') 
                    
            
        except Exception as e:
            self.logger.error(f'Error during to perform the search function', exc_info=True)
        