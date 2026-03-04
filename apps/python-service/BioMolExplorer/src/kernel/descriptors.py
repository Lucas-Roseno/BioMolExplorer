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
# Desabilitar todos os avisos (warnings)
warnings.filterwarnings("ignore")

import matplotlib
matplotlib.use('agg')
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
import os
import numpy as np

from pandas import DataFrame, concat
from typing import Optional, Dict
from pathlib import Path
from multiprocessing import Pool
from enum import Enum
import multiprocessing as mp
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from datasketch import MinHash, MinHashLSH
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from rdkit.Chem import AllChem, MACCSkeys
from rdkit import Chem
from rdkit import DataStructs
from rdkit.Chem import rdFMCS, Draw
from rdkit.Chem.Pharm2D import Generate
from rdkit.Chem.Pharm2D import Gobbi_Pharm2D
from rdkit.DataStructs.cDataStructs import SparseBitVect
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from kernel.utilities import fileHandling
from kernel.loggers import LoggerManager
#----------------------------------------------------------------------------------------------


class similarityFunctions(Enum):
  TanimotoSimilarity      = 'Tanimoto' 
  DiceSimilarity          = 'Dice' 
  CosineSimilarity        = 'Cosine' 
  SokalSimilarity         = 'Sokal' 
  RusselSimilarity        = 'Russel' 
  RogotGoldbergSimilarity = 'RogotGoldberg' 
  AllBitSimilarity        = 'AllBit' 
  KulczynskiSimilarity    = 'Kulczynski' 
  McConnaugheySimilarity  = 'McConnaughey' 
  AsymmetricSimilarity    = 'Asymmetric' 
  BraunBlanquetSimilarity = 'BraunBlanquet' 


class fingerprints(Enum):
  Morgan        = 'morgan' 
  MACCs         = 'maccs' 
  Pharmacophore = 'pharmacophore' 
  


class Descriptors():
    
    def __init__(self, inputpath:Optional[str]=None, outputpath:Optional[str]=None):
        self.__path = str(Path.cwd())
        self.set_inputpath(inputpath) if inputpath != None else None
        self.set_outputpath(outputpath) if outputpath != None else None
        self.logger = LoggerManager.get_logger(self.__class__.__name__, log_file='logs/descriptors.log')

    
    def set_inputpath(self, inputpath:str):
        self.__inputpath = inputpath 
        
    
        
    def set_outputpath(self, outputpath:str) -> None:
        self.__outputpath = outputpath 
        if not os.path.exists(self.__path + self.__outputpath):
           os.makedirs(self.__path + self.__outputpath, exist_ok=True)
           
    
     
    def get_fingerprints(self, smiles_df:DataFrame, morgan_n_bits: Optional[int] = 2048, radius: Optional[int] = 2,
                         morgan: Optional[bool] = True, maccs: Optional[bool] = True, pharmacophore: Optional[bool] = True) -> None:
        
        try:
            
            if morgan:
                return self.compute_morgan_fingerprints(smiles_df, radius, morgan_n_bits)

            if maccs:
                return self.compute_maccs_fingerprints(smiles_df)

            if pharmacophore:
                return self.compute_pharmacophore_fingerprints(smiles_df)


        except Exception as e:
            self.logger.error(f'Error processing smiles in get_fingerprints function', exc_info=True)

    

    @staticmethod
    def compute_morgan_fingerprints(smiles_df: DataFrame, radius: int, n_bits: int) -> DataFrame:
        with mp.Pool(mp.cpu_count()) as pool:
            results = pool.starmap(Descriptors.morgan_worker, [(row.smiles, row.molecule_chembl_id, radius, n_bits) for row in smiles_df.itertuples(index=False)])
        return DataFrame(results)

    
    @staticmethod
    def morgan_worker(smiles: str, molecule_chembl_id: str, radius: int, n_bits: int) -> Dict[str, str]:
        mol = Chem.MolFromSmiles(smiles)
        if mol:
            return {"molecule_chembl_id": molecule_chembl_id,
                    "fingerprint": list(AllChem.GetMorganFingerprintAsBitVect(mol, radius, nBits=n_bits, useChirality=True, useBondTypes=False, useFeatures=True))}
        return {"molecule_chembl_id": molecule_chembl_id, "fingerprint": None}

    
    @staticmethod
    def compute_maccs_fingerprints(smiles_df: DataFrame) -> DataFrame:
        with mp.Pool(mp.cpu_count()) as pool:
            results = pool.starmap(Descriptors.maccs_worker, [(row.smiles, row.molecule_chembl_id) for row in smiles_df.itertuples(index=False)])
        return DataFrame(results)

    
    @staticmethod
    def maccs_worker(smiles: str, molecule_chembl_id: str) -> Dict[str, str]:
        mol = Chem.MolFromSmiles(smiles)
        if mol:
            return {"molecule_chembl_id": molecule_chembl_id, "fingerprint": list(MACCSkeys.GenMACCSKeys(mol))}
        return {"molecule_chembl_id": molecule_chembl_id, "fingerprint": None}

    
    @staticmethod
    def compute_pharmacophore_fingerprints(smiles_df: DataFrame) -> DataFrame:
        with mp.Pool(mp.cpu_count()) as pool:
            results = pool.starmap(Descriptors.pharmacophore_worker, [(row.smiles, row.molecule_chembl_id) for row in smiles_df.itertuples(index=False)])
        return DataFrame(results)

    
    @staticmethod
    def pharmacophore_worker(smiles: str, molecule_chembl_id: str) -> Dict[str, str]:
        mol = Chem.MolFromSmiles(smiles)
        factory = Gobbi_Pharm2D.factory
        if mol:
            return {"molecule_chembl_id": molecule_chembl_id, "fingerprint": list(Generate.Gen2DFingerprint(mol, factory))}
        return {"molecule_chembl_id": molecule_chembl_id, "fingerprint": None}
        
        
    
    def max_common_substructure(self, smiles:list) -> tuple:
        
        try:

            if len(smiles) < 2:
                mol   = Chem.MolFromSmiles(smiles[0])
                smile = Chem.MolToSmiles(mol, isomericSmiles=True, canonical=True)
                img   = Draw.MolToImage(mol) 
                
            else: 
                mols  = [Chem.MolFromSmiles(s) for s in smiles]
                mcs   = rdFMCS.FindMCS(mols)
                mol   = Chem.MolFromSmarts(mcs.smartsString)
                smile = Chem.MolToSmiles(mol, isomericSmiles=True, canonical=True)
                img   = Draw.MolToImage(mol)
            
            return smile, img
        
        except Exception as e:
            self.logger.error(f'Error during to perform the max_common_substructure function', exc_info=True)   
        
        

                    
class MolSimilarity():

    def __init__(self, inputpath:Optional[str]=None, outputpath:Optional[str]=None, num_perm=256, threshold=0.5, radius=2, n_bits=2048):
        self.num_perm = num_perm
        self.threshold = threshold
        self.radius = radius
        self.n_bits = n_bits
        self.lsh = MinHashLSH(threshold=threshold, num_perm=num_perm)
        self.fingerprint_list = []
        self.__path = str(Path.cwd())
        self.set_inputpath(inputpath) if inputpath != None else None
        self.set_outputpath(outputpath) if outputpath != None else None
        self.logger = LoggerManager.get_logger(self.__class__.__name__, log_file='logs/molsimilarity.log')

    
    def set_inputpath(self, inputpath:str):
        self.__inputpath = inputpath 
        
    
        
    def set_outputpath(self, outputpath:str) -> None:
        self.__outputpath = outputpath 
        if not os.path.exists(self.__path + self.__outputpath):
           os.makedirs(self.__path + self.__outputpath, exist_ok=True)
        
    
    def clear_lsh(self):
        self.lsh = MinHashLSH(threshold=self.threshold, num_perm=self.num_perm)
        self.fingerprint_list = []
        

    def fingerprint_to_lsh(self, fp:str) -> MinHash:

        try:

            m = MinHash(num_perm=self.num_perm)
            for bit, value in enumerate(fp):
                if value == '1':
                    m.update(str(bit).encode('utf8'))

            return m
        
        except Exception as e:
            self.logger.error(f'Error during to perform fingerprint_to_lsh function', exc_info=True)



    def add_fingerprint(self, fp:str):

        try:

            self.fingerprint_list.append(fp)
            data = self.fingerprint_to_lsh(fp)
            self.lsh.insert(len(self.fingerprint_list) - 1, data)

        except Exception as e:
            self.logger.error(f'Error during to perform {fp} in add_fingerprint function', exc_info=True)   
    


    def string_to_sparsebitvect(self, fp_str: str) -> SparseBitVect:
        
        sbv = SparseBitVect(len(fp_str))
        
        for idx, bit in enumerate(fp_str):
            if bit == '1':  
                sbv.SetBit(idx)
        
        return sbv
    


    def get_similarity(self, fp1, fp2, metric:Optional[similarityFunctions]=similarityFunctions.TanimotoSimilarity):

        try:

            fp1 = self.string_to_sparsebitvect(fp1)
            fp2 = self.string_to_sparsebitvect(fp2)

            if similarityFunctions.TanimotoSimilarity == metric:
                return round(DataStructs.TanimotoSimilarity(fp1, fp2), 3)
                
            elif similarityFunctions.DiceSimilarity == metric:
                return round(DataStructs.DiceSimilarity(fp1, fp2), 3)
                
            elif similarityFunctions.CosineSimilarity == metric:
                return round(DataStructs.CosineSimilarity(fp1, fp2), 3)
                
            elif similarityFunctions.SokalSimilarity == metric:
                return round(DataStructs.SokalSimilarity(fp1, fp2), 3)
                
            elif similarityFunctions.RusselSimilarity == metric:
                return round(DataStructs.RusselSimilarity(fp1, fp2), 3) 
                
            elif similarityFunctions.RogotGoldbergSimilarity == metric:
                return round(DataStructs.RogotGoldbergSimilarity(fp1, fp2), 3) 
                
            elif similarityFunctions.AllBitSimilarity == metric:
                return round(DataStructs.AllBitSimilarity(fp1, fp2), 3) 
                
            elif similarityFunctions.KulczynskiSimilarity == metric:
                return round(DataStructs.KulczynskiSimilarity(fp1, fp2), 3)  
                
            elif similarityFunctions.McConnaugheySimilarity == metric:
                return round(DataStructs.McConnaugheySimilarity(fp1, fp2), 3)  
                
            elif similarityFunctions.AsymmetricSimilarity == metric:
                return round(DataStructs.AsymmetricSimilarity(fp1, fp2), 3)    
                
            else:
                return round(DataStructs.BraunBlanquetSimilarity(fp1, fp2), 3) 

        except Exception as e:
            self.logger.error(f'Error during to perform get_similarity function', exc_info=True) 
    


    def find_similar_molecules(self, query_fp:str, metric:similarityFunctions) -> list:

        try:

            query_lsh = self.fingerprint_to_lsh(query_fp)
            candidates = self.lsh.query(query_lsh)
            
            similar_molecules = []
            for idx in candidates:
                candidate_fp = self.fingerprint_list[idx]
                similarity = self.get_similarity(query_fp, candidate_fp, metric)
                if similarity >= self.threshold:
                    similar_molecules.append((self.fingerprint_list[idx], similarity))
            
            return similar_molecules
        
        except Exception as e:
            self.logger.error(f'Error during to perform find_similar_molecules function', exc_info=True) 

    


    def perform_similarity(self, filename=None, metric=similarityFunctions.TanimotoSimilarity, fp:Optional[str]='morgan') -> DataFrame:

        try:
            
            data = fileHandling(input_path=self.__inputpath, output_path=self.__outputpath)
            files = [f.rsplit('.')[0] for f in os.listdir(self.__inputpath[1:])
                     if f.endswith('.csv') and f.startswith(fp) and (f.endswith('MOLS.csv') or f.endswith('SIMS.csv'))] if filename == None else [filename.rsplit('.')[0]]
            
            for filename in files:

                df = data.csv_to_dataframe(filename)
                df[fp] = df['fingerprint'].apply(lambda x: ''.join(map(str, eval(x))))
                
                self.clear_lsh()
                for signature in df[fp].tolist():
                    self.add_fingerprint(signature)
                
                result = []
                for chemblid, signature in df[['molecule_chembl_id', fp]].itertuples(index=False, name=None):
                    similar_molecules = self.find_similar_molecules(signature, metric)
                    for sim in similar_molecules:
                        if sim[1] < 1:
                            target = df[df[fp] == sim[0]]
                            tmp = {'source':chemblid, 'target':target['molecule_chembl_id'].values[0], 'value': sim[1]}
                            result.append(tmp)
                
                if len(result) > 0:
                    filename = metric.value + '_' + filename
                    data.dataframe_to_csv(filename, DataFrame(result))


        except Exception as e:
            self.logger.error(f'Error during to perform the perform_similarity function', exc_info=True)