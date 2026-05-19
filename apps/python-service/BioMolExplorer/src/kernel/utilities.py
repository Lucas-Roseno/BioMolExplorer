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
import warnings
warnings.filterwarnings('ignore')

import matplotlib
matplotlib.use('agg')
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
import os
import ast

from pathlib import Path
from pandas import read_csv, DataFrame, concat, notna
from typing import Optional
from PIL.PngImagePlugin import PngImageFile


from rdkit import Chem
from rdkit.Chem import rdmolfiles
from rdkit.Chem import Draw
from rdkit.Chem import rdDepictor
rdDepictor.SetPreferCoordGen(True)
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from kernel.loggers import LoggerManager
#----------------------------------------------------------------------------------------------

class MyUtilities():
    
    def __init__(self, input_path:Optional[str]=None, output_path:Optional[str]=None):
        self.path   = str(Path.cwd())
        self.logger = LoggerManager.get_logger(self.__class__.__name__, log_file='logs/utilities.log')

        self.set_inputpath(input_path)
        self.set_outputpath(output_path)
  
            
    def set_inputpath(self, input_path=None):
        self.inputpath = input_path if input_path != None else None
    
        
    def set_outputpath(self, output_path=None):
        self.outputpath = output_path if output_path != None else None
        if self.outputpath and not os.path.exists(self.path + self.outputpath):
            os.makedirs(self.path + self.outputpath, exist_ok=True)
        



class fileReading(MyUtilities):

    def __init__(self, inputpath, file) -> None:
        super().__init__(inputpath)
        self.__file   = file
        self.__linhas = None
        self.__size   = self.get_size()
        
    def __iter__(self):
        
        try:
            self.__linhas = open(self.path + self.inputpath + self.__file, 'r').readlines()
            self.__indice = 0
            return self
        
        except Exception as e:
            self.logger.error(f'Error during to perform the __iter__ function', exc_info=True)
    


    def __next__(self):
        
        try:
            if self.__linhas is None or self.__indice >= len(self.__linhas):
                raise StopIteration
            
            linha = self.__linhas[self.__indice]
            self.__indice += 1
            return linha.strip()
        
        except Exception as e:
            self.logger.error(f'Error during to perform the __next__ function', exc_info=True)

    
    
    def get_size(self):
        
        try:

            with open(self.path + self.inputpath + self.__file, 'r') as file:
                size = sum(1 for _ in file)
            return size
        
        except Exception as e:
            self.logger.error('Error during to perform the get_size function', exc_info=True)
            return None
        
    
    def get_chunk(self, chunk_number, chunk_size):
        
        try:

            start_index = chunk_number * chunk_size
            end_index = start_index + chunk_size
            end_index = min(end_index, self.__size)
            with open(self.path + self.inputpath + self.__file, 'r') as file:
                lines = file.readlines()[start_index:end_index]
            return [line.strip() for line in lines]
        
        except Exception as e:
            self.logger.error('Error during to perform the get_chunk function', exc_info=True)
            return None
    



class fileHandling(MyUtilities):
    
    def __init__(self, input_path:Optional[str]=None, output_path:Optional[str]=None, ext:Optional[str]='csv') -> None:
        super().__init__(input_path, output_path)
        self.__extension = '.'+ext if ext != None else None
        
            
    def set_extension(self, ext:str) -> None:
        self.__extension = '.'+ext if ext != None else None
        
        
    def isFile(self, file) -> tuple:
        pin  = os.path.isfile(self.path + self.inputpath + file + self.__extension) if self.inputpath else None
        pout = os.path.isfile(self.path + self.outputpath + file + self.__extension) if self.outputpath else None
        return (pin, pout)
     

    def save_input_data(self, filename:str, data:str):
        path = self.path + self.outputpath
        with open(path + filename, 'w') as f:
            f.write(data)  


    def csv_to_dataframe(self, file:str, chunksize=0, delimiter=',')  -> DataFrame:
        path = self.path + self.inputpath + file + self.__extension
        df   = DataFrame()
        
        try:
            
            if os.path.exists(path):
                if (chunksize > 0):
                    df = read_csv(path, chunksize=chunksize, delimiter=delimiter)
                else:
                    df = read_csv(path, delimiter=delimiter)
            
            return df 
        
        except Exception as e:
            self.logger.error(f'Error during to perform {file} file in csv_to_dataframe function', exc_info=True)
               


    
    def dataframe_to_csv(self, file:str, df:DataFrame, mode='w')  -> None:
        path = self.path + self.outputpath + file + self.__extension
        
        try:

            if mode != 'a':
                df.to_csv(path, mode=mode, index=False)
            else:
                df.to_csv(path, mode=mode, header=False, index=False)
            
        except Exception as e:
            self.logger.error(f'Error during to perform {file} file in dataframe_to_csv function', exc_info=True)
        


    def dict_to_dataframe(self, data:list) -> DataFrame:
        
        try:

            result = DataFrame([ast.literal_eval(d) for d in data])
            return result
        
        except Exception as e:
            self.logger.error(f'Error during to perform the dict_to_dataframe function', exc_info=True)
        
    
    
    def convert_str_to_dict(self, input:DataFrame, column:str, selected_key:str) -> dict:
        
        try:

            result = input[column].apply(lambda x: ast.literal_eval(x)[selected_key] if notna(x) else None)
            return result
        
        except Exception as e:
            self.logger.error(f'Error during to perform the convert_str_to_dict function', exc_info=True)
            
    
            
    def save_img_as_png(self, img:PngImageFile, file:str):
        
        try:

            if not os.path.exists(self.path + self.outputpath):
                os.makedirs(self.path + self.outputpath, exist_ok=True)
                
            path = self.path + self.outputpath + file + '.png'
            img.save(path)
            
        except Exception as e:
            self.logger.error(f'Error during to perform {file} file in save_img_as_png function', exc_info=True)
    
    
        
    def __get_datamols(self) -> dict:
        
        try:

            df = DataFrame(columns=['molecule_chembl_id', 'canonical_smiles', 'molecule_properties'])
            explorer = MolExplorer()

            molecules = [mol.rsplit('.')[0] for mol in os.listdir(self.inputpath[1:]) if mol.endswith('.csv')]
            for mol in molecules:
                tmp = self.csv_to_dataframe(mol)
                tmp['canonical_smiles'] = self.convert_str_to_dict(tmp, 'molecule_structures', 'canonical_smiles')
                tmp = tmp[['molecule_chembl_id', 'canonical_smiles', 'molecule_properties']]
                df = concat([df, tmp], ignore_index=True)
                
            mols = explorer.remove_duplicates_and_clean(df)
                
            return mols
        
        except Exception as e:
            self.logger.error(f'Error during to perform the __get_datamols function', exc_info=True)
    
    
    
    def prepare_datamols(self, target:str, inputpath_mols:Optional[str]=None, inputpath_similars:Optional[str]=None):
        
        try:
            
            self.set_inputpath(inputpath_mols)
            mols = self.__get_datamols() if inputpath_mols != None else None
            
            self.set_inputpath(inputpath_similars)
            sims = self.__get_datamols() if inputpath_similars != None else None
            
            if isinstance(sims, DataFrame) and isinstance(mols, DataFrame):
                ids_mols = set(mols['molecule_chembl_id'])
                ids_sims = set(sims['molecule_chembl_id'])
                ids_sims = ids_sims - ids_mols
                sims = sims[sims['molecule_chembl_id'].isin(ids_sims)]
                self.dataframe_to_csv(target+'_MOLS', mols)
                self.dataframe_to_csv(target+'_SIMS', sims)
                merged = concat([mols, sims], ignore_index=True)
                self.dataframe_to_csv(target+'_FULL', merged)
                
            
            elif isinstance(mols, DataFrame):
                self.dataframe_to_csv(target+'_MOLS', mols)
            
            elif isinstance(sims, DataFrame):
                self.dataframe_to_csv(target+'_SIMS', sims)
    
                
        except Exception as e:
            self.logger.error(f'during to perform {target} target in prepare_datamols function', exc_info=True)
    
    
            
    def merge_datamols(self, mols1:DataFrame, mols2:DataFrame) -> DataFrame:
        
        try:

            explorer = MolExplorer()

            merged = concat([mols1, mols2], ignore_index=True)
            merged = explorer.remove_duplicates_and_clean(merged)
            
            return merged
        
        except Exception as e:
            self.logger.error(f'Error during to perform the merge_datamols function', exc_info=True)            
        
  
        
       

class MolConverter(MyUtilities):
    
    def __init__(self, input_path=None, output_path=None) -> None:
        super().__init__(input_path, output_path)
    

        
    def convert_mol_to_smiles(self, file_path:str):
        
        try:

            with open(file_path, 'r') as file:
                molblock = file.read()
                
            mol = Chem.MolFromMolBlock(molblock)
            if mol is not None:
                smiles = Chem.MolToSmiles(mol)
                return smiles
            else:
                return None
        
        except Exception as e:
            self.logger.error(f'Error during to perform {file_path} path in convert_mol_to_smiles function', exc_info=True)



    def convert_smiles_to_mol(self, smiles:str, output_path:str):
        
        try:

            mol = Chem.MolFromSmiles(smiles)

            if mol is not None:
                molblock = Chem.MolToMolBlock(mol)

                with open(output_path, 'w') as output_file:
                    output_file.write(molblock)
        
        except Exception as e:
            self.logger.error(f'Error during to perform {smiles} smiles in convert_smiles_to_mol function', exc_info=True)
    


    def save_smiles_to_png(self, smiles:str, output_file_name:str) -> None:
        
        try:

            mol = Chem.MolFromSmiles(smiles)
            img = Draw.MolToImage(mol, size=(300, 300))
            
            path = self.path + self.outputpath + output_file_name.split('.')[0] + '.png'
            img.save(path)
            img.close()
            
        except Exception as e:
            self.logger.error(f'Error during to perform {smiles} smiles in save_smiles_to_png function', exc_info=True)




class MolExplorer(MyUtilities):

    def __init__(self, input_path:Optional[str]=None, output_path:Optional[str]=None) -> None:
        super().__init__(input_path, output_path)
        

    def is_fragmented(self, pdb_content_str:str):
        
        try:

            mol = rdmolfiles.MolFromPDBBlock(pdb_content_str)
            fragments = Chem.GetMolFrags(mol, asMols=True)
            fragments = len(fragments) > 1

            return fragments
        
        except Exception as e:
            return True
    
    

    def remove_duplicates_and_clean(self, mols:DataFrame) -> DataFrame:
        
        try:

            mols.dropna(subset='canonical_smiles', inplace=True) if mols.shape[0] > 0 else None
            mols.drop_duplicates(subset='molecule_chembl_id', inplace=True) if mols.shape[0] > 0 else None
            mols.drop_duplicates(subset='canonical_smiles', inplace=True) if mols.shape[0] > 0 else None
            mols = mols[~mols['canonical_smiles'].str.contains(r"\.")] if mols.shape[0] > 0 else None
            
            return mols
        
        except Exception as e:
            self.logger.error(f'Error during to perform the remove_duplicates_and_clean function', exc_info=True)


                
        
            
