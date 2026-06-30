"""!

PhD research 2023~2026

@title 
    Drug Hunter: a general framework based on a target-ligand strategy to investigate the 
    physicochemical potential of compounds

@info
    A general crawler to look at targets and bioactivities molecules on the ChEMBL database.

@authors 
   - Michel Pires da Silva (michel@cefetmg.br / Academic student)
   - Alisson Marques da Silva (alisson@cefetmg.br / Co Advisor)
   - Alex Gutterres Taranto   (taranto@ufsj.edu.br / Advisor)

@date 2023-2026

@copyright GNU Public License

@cond GNU_PUBLIC_LICENSE
    Drug Hunter is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Drug Hunter is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    
    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
@endcond

"""
#----------------------------------------------------------------------------------------------
#Configure PYTHONPATH to perform execution using the project classes
import sys 
sys.path.append("src")
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
import warnings
# Desabilita todos os avisos
warnings.filterwarnings("ignore")

import matplotlib
matplotlib.use('agg')
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
import subprocess
import os
import math
import time
import matplotlib.pyplot as plt
import numpy as np

from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from typing import Optional, List, Tuple, Literal
from pathlib import Path
from pandas import DataFrame
from matplotlib.ticker import MultipleLocator, FormatStrFormatter
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from pymol import cmd
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from kernel.utilities import fileHandling, MolConverter, MolExplorer
from kernel.loggers import LoggerManager
from kernel.config import BIOMOL_ROOT
from kernel.descriptors import Descriptors
#----------------------------------------------------------------------------------------------

    
class Docking():
     
    def __init__(self, ligand_input_path:Optional[str]=None, receptor_input_path:Optional[str]=None,
                 complex_input_path:Optional[str]=None, output_path:Optional[str]=None,
                 mol_filename:Optional[str]='molecules') -> None:
        
        self.path           = BIOMOL_ROOT if BIOMOL_ROOT.endswith('/') else BIOMOL_ROOT + '/'       # Calculate project root relative to this file to find templates
        self.project_root   = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        self.ligandpath = None
        if ligand_input_path: self.set_ligandpath(ligand_input_path)
        self.receptorpath = None
        if receptor_input_path: self.set_receptorpath(receptor_input_path)
        self.complexpath = None
        if complex_input_path: self.set_complexpath(complex_input_path)
        self.nprocess       = os.cpu_count() - 2
        self.centers        = None
        self.logpath        = self.path + '/logs/'
        self.logger         = LoggerManager.get_logger(self.__class__.__name__, log_file='logs/docking.log')
        self.mol_filename   = mol_filename
        

        self.set_outputpath(output_path) if output_path != None else None
        
        


    def set_ligandpath(self, path) -> None:
       if path:
           import os
           path = path if os.path.isabs(path) else os.path.join(self.path, path)

       if not os.path.exists(path):
           print(f'[ERROR]: The ligand path {path} does not exist!')
           exit(1)

       self.ligandpath = path
    
    
    def set_receptorpath(self, path) -> None:
       if path:
           import os
           path = path if os.path.isabs(path) else os.path.join(self.path, path)

       if not os.path.exists(path):
           print(f'[ERROR]: The receptor path {path} does not exist!')
           exit(1)
       
       self.receptorpath = path
       
       
    def set_complexpath(self, path) -> None:
       if path:
           import os
           path = path if os.path.isabs(path) else os.path.join(self.path, path)

       if not os.path.exists(path):
           print(f'[ERROR]: The complex path {path} does not exist!')
           exit(1)
       
       self.complexpath = path
       
       
    def set_outputpath(self, path) -> None:
        if path:
            import os
            path = path if os.path.isabs(path) else os.path.join(self.path, path)

        if not os.path.exists(path):
            os.makedirs(path, exist_ok=True)
        
        if not os.path.exists(path):
            print(f'[ERROR]: The output path {path} can not be created!')
            exit(1)

        self.outputpath = path 
       
    

    def generate_docking_script(self, input_template:str, output_script:str, **kwargs):
        """
        A generic function to generate docking scripts by replacing placeholders in the 
        input template with provided keyword arguments. Such a function is useful to prepare
        different types of docking scripts for different docking softwares.

        Args:
            input_template (str): The path to the input template file.
            output_script (str): The path to the output script file.
            **kwargs: Keyword arguments used to replace placeholders in the input template.

        Raises:
            Exception: If any error occurs during the generation of the docking script, a log file will 
            be created and posted in the log folder.

        """
        try:
            # input_template may be an absolute path (from callers using os.path.join(self.project_root, ...))
            # or a relative path - use os.path.isabs to handle both cases safely
            template_path = input_template if os.path.isabs(input_template) else os.path.join(self.path, input_template.lstrip('/'))
            with open(template_path, 'r') as template_file:
                template_content = template_file.read()

            config_content = template_content.format(**kwargs)

            with open(output_script, 'w') as output_file:
                output_file.write(config_content)

        except Exception as e:
            self.logger.error(f'during to perform {input_template} -> {output_script} in generate_docking_script function', exc_info=True)
        
        finally:
            time.sleep(1)
            dir_fd = os.open((self.outputpath), os.O_DIRECTORY)
            os.fsync(dir_fd)
           



    def perform_subprocess(self, command:str, local_path=None, shell=True, check=True) -> bool:
        """
        This function performs a subprocess execution of a given command. 
        """
        
        try:
            if local_path is not None:
                cwd = local_path if os.path.isabs(local_path) else os.path.join(self.path, local_path.lstrip('/'))
            else:
                cwd = None
            
            # Use capture_output to ensure we can relay the output to our captured sys.stdout
            # This is necessary because sys.stdout might be a Tee object (no real fileno for subprocess)
            result = subprocess.run(
                command, 
                cwd=cwd,
                shell=shell, 
                check=False, # We handle checking manually after relaying output
                start_new_session=True,
                capture_output=True,
                text=True
            )
            
            # Relay captured output to our current sys.stdout/stderr
            # This allows Tee objects (from app.py) to capture the output for the frontend
            if result.stdout:
                sys.stdout.write(result.stdout)
                sys.stdout.flush()
            if result.stderr:
                sys.stderr.write(result.stderr)
                sys.stderr.flush()

            if check and result.returncode != 0:
                raise subprocess.CalledProcessError(result.returncode, command, result.stdout, result.stderr)

            return True

        except subprocess.CalledProcessError as e:
            self.logger.error(f'Subprocess failed with exit code {e.returncode}: {command}')
            if e.stdout: self.logger.error(f'STDOUT: {e.stdout}')
            if e.stderr: self.logger.error(f'STDERR: {e.stderr}')
            raise
        except Exception as e:
            self.logger.error(f'Error during subprocess execution: {str(e)}', exc_info=True)
            return False
        
        finally:
            if local_path != None:
                dir_fd_path = local_path if os.path.isabs(local_path) else os.path.join(self.path, local_path.lstrip('/'))
                dir_fd = os.open(dir_fd_path, os.O_DIRECTORY)
                os.fsync(dir_fd)
            else:
                dir_fd = os.open((self.outputpath), os.O_DIRECTORY)
                os.fsync(dir_fd)
            time.sleep(1)
        
        
        

    
    def prepare_on_chimera(self, filename:str) -> bool:
        """
        Some docking steps need to perform a specific input data file extension, and some features are 
        required to report that. So, this function prepares such input data files when necessary, 
        using the chimera shell execution to perform ones. 

        Args:
            filename (str): The input file to be prepared for docking.

        Raises:
            Exception: If any error occurs during the preparation of the input file, a log file will 
            be created and posted in the log folder.

        """
        try:     
            command = f'chimera --nogui --silent {filename}'
            self.perform_subprocess(command, self.outputpath)
 
        except Exception as e:
            self.logger.error(f'during to perform {filename} in prepare_on_chimera function', exc_info=True)
        
        finally:
            time.sleep(1)
            os.remove((self.outputpath) + filename) if os.path.isfile((self.outputpath) + filename) else None
            dir_fd = os.open((self.outputpath), os.O_DIRECTORY)
            os.fsync(dir_fd)
                



    
    def prepare_on_obabel(self, inputfile:str, outputfile:str, params:Optional[List[Tuple[str, str]]]=[], input_format:Optional[str]='mol2', output_format:Optional[str]='pdb') -> bool:
        """
        Some docking steps need to perform a specific input data file extension, and some features are 
        required to report that. So, this function prepares such input data files when necessary, 
        using the obabel shell execution to perform ones. 

        Args:
            inputfile (str): The input file to be prepared for docking.
            outputfile (str): The output file to be prepared for docking.
            params (List[Tuple[str, str]]): The list of parameters to be used in the obabel command.
            input_format (str): The input file format.
            output_format (str): The output file format.

        Raises:
            Exception: If any error occurs during the preparation of the input file, a log file will 
            be created and posted in the log folder.

        """
        try:
            
            input_file = self.outputpath + inputfile 
            
            if input_format != 'smi':
                command = f'obabel -i {input_format} "{input_file}" -o {output_format} -O "{outputfile}" '
            else:
                command = f'obabel -:"{inputfile}" -o {output_format} -O "{outputfile}" --gen3D '
            
            
            for param, value in params: 
                command += f'-{param} {value} ' if value else f'-{param} '
            
            self.perform_subprocess(command, self.outputpath)
   
        except Exception as e:
            self.logger.error(f'during to perform {inputfile} to {outputfile} converter in prepare_on_obabel function', exc_info=True)

        finally:
            time.sleep(1)
            dir_fd = os.open((self.outputpath), os.O_DIRECTORY)
            os.fsync(dir_fd)
            
            
            


    def calculate_ligand_centerofmass(self, inputfile:str, ligand:str):
        """
        This function calculates the center of mass of a given ligand using the PyMOL software.

        Args:
            inputfile (str): The input file containing the ligand.
            ligand (str): The name of the ligand in the input file.

        Returns:
            List: The center of mass of the ligand.

        Raises:
            Exception: If any error occurs during the calculation of the ligand center of mass, a log file
            will be created and posted in the log folder.
        """
        try:

            file = self.outputpath + inputfile
            cmd.reinitialize()
            cmd.load(file, 'ligand')
            cmd.select('ligante', 'resn ' + ligand)
            return cmd.centerofmass('ligante')
        
        except Exception as e:
            self.logger.error(f'during to perform {inputfile} -> {ligand} ligand in calculate_ligand_centerofmass function', exc_info=True)
            return None



    def retrieve_centerofmass_dataset(self, pathname:str, receptor:str, ligand:str, resnum:str, chain:str) -> List:
        """
        This function retrieves the center of mass of a given ligand from a dataset.

        Args:
            pathname (str): The path to the dataset file.
            receptor (str): The receptor name.
            ligand (str): The ligand name.
            resnum(str): The residue number.
            chain(str): The chain identifier.

        Returns:
            List: The center of mass of the ligand.

        Raises:
            Exception: If any error occurs during the retrieval of the ligand center of mass, a log file
        """
        try:
            if self.centers is None:
                f1   = fileHandling(input_path=pathname, output_path=self.outputpath)
                self.centers = f1.csv_to_dataframe('centers')
               
            center_idx = f'{receptor}_{ligand}_{resnum}{chain}'
            return self.centers[center_idx].values.tolist() if center_idx in self.centers else None
            
        except Exception as e:
            self.logger.error(f'during to perform {receptor} -> {ligand }in retrieve_centerofmass_dataset function', exc_info=True)



    def process_in_parallel(self, method_name:str, args_list:list, process_by_threads:Optional[bool]=False):
        """
        A broad function to perform a parallel processing of a given method with a list of arguments. In this function, it is possible
        to choose between processing by threads (True) or by processes (False), modifying the process_by_threads input variable before execution.

        Args:
            method_name (str): The method name to be processed in parallel.
            args_list (list): The list of arguments to be processed in parallel.
            nprocess (int): The number of processes to be used in parallel.
            process_by_threads (bool): If True, the processing will be done using threads.

        Returns:
            List: The results of the parallel processing.

        Raises:
            Exception: If any error occurs during the parallel processing, a log file will be created
            and posted in the log folder.
        """
        
        
        method   = getattr(self, method_name)
        
        if process_by_threads:
            with ThreadPoolExecutor(max_workers=self.nprocess) as executor:
                futures = [executor.submit(method, *args) for args in args_list]
                results = [future.result() for future in futures]
        
        else:
            with ProcessPoolExecutor(max_workers=self.nprocess) as executor:
                futures = [executor.submit(method, *args) for args in args_list]
                results = [future.result() for future in futures]

        return results
               
            
    
    def prepare_for_docking(self, pdb_codes:list, charge_type:str, pH:float, redefine_centerofmass:bool) -> bool:
        """
        This function prepares the input files for docking using Chimera and Open Babel software. The input files are prepared in a specific
        format required to perform docking with different docking software. Templates for the input files are available in the src/scripts folder.
        Some limitations are present in the preparation of the input files, such as the need to preserve declared variables because they are used 
        to replace placeholders in the output scripts prepared.

        Args:
            pdb_codes (List[Tuple[str, str]]): The list of PDB codes to be used in the docking preparation. If None is provided, such codes are 
            extracted utilizing the default PDB pathway provided in the complexpath variable to retrieve the PDB codes.
            pH (float): The pH value to be used for protonation. If It is not explicitly described, the default value used is 7.4.
            redefine_centerofmass (bool): If True, the function will calculate the center of mass of the ligand.
            
        Raises:
            Exception: If any error occurs during the preparation of the input files for docking, a log file will be created and posted in the log folder.

        """
        try:
            
            centers   = {} 
            complexes = []
            receptors = []
            ligands   = []


            for pdb in pdb_codes:
                receptor = pdb[0]
                ligand   = pdb[1]
                resnum   = pdb[2] 
                chain    = pdb[3]
                chain_id = ',.'.join(chain) if len(chain) > 1 else chain
                
                if f'prepare_complex_{receptor}_{chain}.com' not in complexes:
                    self.generate_docking_script(input_template=os.path.join(self.project_root, 'src', 'scripts', 'chimera', 'prepare_complex.template'),
                                                output_script=(self.outputpath) + f'prepare_complex_{receptor}_{chain}.com',
                                                pdb_code=self.complexpath + receptor,
                                                input_complex=self.complexpath + receptor,
                                                chain=chain_id,
                                                output_complex=f'{receptor}_{chain}')
                    complexes.append(f'prepare_complex_{receptor}_{chain}.com')
                
                
                if f'prepare_receptor_{receptor}_{chain}.com' not in receptors:
                    self.generate_docking_script(input_template=os.path.join(self.project_root, 'src', 'scripts', 'chimera', 'prepare_receptor.template'),
                                                output_script=(self.outputpath) + f'prepare_receptor_{receptor}_{chain}.com',
                                                input_complex=self.outputpath + f'{receptor}_{chain}' + '.complex',
                                                receptor=self.outputpath + f'{receptor}_{chain}')
                    receptors.append(f'prepare_receptor_{receptor}_{chain}.com')
            
                
                extention = f'{receptor}_{ligand}_{resnum}{chain}'
                self.generate_docking_script(input_template=os.path.join(self.project_root, 'src', 'scripts', 'chimera', 'prepare_ligand.template'),
                                             output_script=(self.outputpath) + f'prepare_ligand_{extention}.com',
                                             input_complex=self.outputpath + f'{receptor}_{chain}' + '.complex',
                                             resnum=resnum,
                                             chain=chain[0],
                                             charge_type=charge_type,
                                             input_ligand=self.outputpath + f'{extention}',
                                             output_ligand=self.outputpath + f'{extention}')
                ligands.append(f'prepare_ligand_{extention}.com')
               
            

            args = [(file,) for file in complexes]
            self.process_in_parallel(method_name='prepare_on_chimera', args_list=args)

            args = [(file,) for file in receptors]
            self.process_in_parallel(method_name='prepare_on_chimera', args_list=args)
            
            for pdb in pdb_codes:
                receptor_chain = pdb[3]
                self.prepare_on_obabel(f'{pdb[0]}_{receptor_chain}.dockprep.mol2', f'{pdb[0]}_{receptor_chain}.dockprep.pdbqt', [('p',str(pH)), ('xr','')], input_format='mol2', output_format='pdbqt')
            
            args = [(file,) for file in ligands]
            self.process_in_parallel(method_name='prepare_on_chimera', args_list=args)  
            
            tmp_codes = []
            for pdb in pdb_codes:
                receptor_chain = pdb[3]
                key = f'{pdb[0]}_{pdb[1]}_{pdb[2]}{receptor_chain}'
                self.prepare_on_obabel(f'{key}.lig.mol2', f'{key}.lig.pdbqt', [('p',str(pH))], input_format='mol2', output_format='pdbqt')
                if redefine_centerofmass:
                    center = self.calculate_ligand_centerofmass(f'{key}.lig.pdb', pdb[1])
                    if center != None:
                        centers[key] = center
                        tmp_codes.append(tuple(pdb)) 

            
            if redefine_centerofmass:
                f1 = fileHandling(input_path=self.outputpath, output_path=self.outputpath)
                tmp = f1.csv_to_dataframe('centers')
                tmp = tmp.to_dict(orient='list')
                tmp.update(centers)
                df = DataFrame(tmp)
                f1.dataframe_to_csv('centers', df)

            return tmp_codes
            

        except Exception as e:
             return None
        
        finally:
            dir_fd = os.open((self.outputpath), os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(1)
                
            
        

class DockVina(Docking):

    
    def __init__(self, ligand_input_path:Optional[str]=None, receptor_input_path:Optional[str]=None, 
                 complex_input_path:Optional[str]=None, output_path:Optional[str]=None, mol_filename:Optional[str]='molecules',
                 pdb_codes:Optional[Tuple[str, str, str, str]]=None, centerofmasspath:Optional[str]=None, 
                 sizeof_box:Optional[List]=[24,24,24], exhaustiveness:Optional[int]=20, num_modes:Optional[int]=10) -> None:
        

        super().__init__(ligand_input_path, receptor_input_path, complex_input_path, output_path, mol_filename=mol_filename)
        
        self.__pdb_codes        = pdb_codes
        self.__centerofmasspath = centerofmasspath
        self.__sizeof_box       = sizeof_box 
        self.__exhaustiveness   = exhaustiveness
        self.__num_modes        = num_modes
        

    def prepare_compounds_for_vina(self, pH:Optional[float]=7.4):
        """
        This function prepares the input files for docking using the AutoDock Vina. The input files are prepared in a specific format (i.e. PDBQT) required
        to perform docking. For that, the molecules.csv file, available in the graph/data path, retrieves the molecules in SMILES format to be prepared for 
        docking. If necessary, the molecules file can be updated to introduce new molecules to be prepared for docking. For that, include the new lines in 
        the molecules.csv file according to the following format: molecule_chembl_id, canonical_smiles. In moleculle_chmbl_id, the molecule identifier is 
        defined as an investigated molecule, so you may want to use a specific/particular code to represent the newly introduced lines in the file.

        Args:
            pH (float): The pH value to be used for protonation. If It is not explicitly described, the default value used is 7.4.

        Raises:
            Exception: If any error occurs during the preparation of the input files for docking, a log file will be created and posted in the log folder.

        """
        try:

            f1 = fileHandling(input_path=self.ligandpath, output_path=self.ligandpath)
            df = f1.csv_to_dataframe(self.mol_filename)
            
            if 'canonical_smiles' not in df.columns and 'molecule_structures' in df.columns:
                df['canonical_smiles'] = f1.convert_str_to_dict(df, 'molecule_structures', 'canonical_smiles')
                
            df.dropna(subset=['canonical_smiles'], inplace=True)
            df['molecule_chembl_id'] = df['molecule_chembl_id'].astype(str)
            data = df[['molecule_chembl_id', 'canonical_smiles']].to_records(index=False)
            
            for chemblid, smiles in data:
                self.prepare_on_obabel(inputfile=smiles, outputfile=chemblid + '.lig.pdbqt', input_format="smi", output_format='pdbqt', params=[('p',str(pH))])
    

        except Exception as e:
            chemblid = chemblid if 'chemblid' in locals() else 'unknown_id'
            smiles = smiles if 'smiles' in locals() else 'unknown_smiles'
            self.logger.error(f'during to perform {chemblid} -> {smiles} in prepare_compounds function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)

        finally:
            dir_fd = os.open((self.outputpath), os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(1)

            mols = [f.split('.lig.pdbqt')[0] for f in os.listdir((self.outputpath)) if f.endswith('.lig.pdbqt')]
            df = df[df['molecule_chembl_id'].isin(mols)]
            f1.dataframe_to_csv(self.mol_filename, df)

            dir_fd = os.open((self.outputpath), os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(1)



    def perform_vina_evaluation(self):
        """
        This function performs the AutoDock Vina evaluation for each prepared ligand in the ligand path folder. The assessment
        is performed sequentially. The results are stored in the output path folder in PDBQT files named according to the
        identifications reported in molecules.csv.

        Raises:
            Exception: If any error occurs during the evaluation of the prepared ligands for docking, a log file will
            be created and posted in the log folder.

        """
        
        files_to_perform = [f for f in os.listdir((self.outputpath)) if f.endswith('.vina')] 
            
        for file in files_to_perform:
            command = f'vina --config {file}'
            self.perform_subprocess(command, self.outputpath)
            
       
    
    def redocking(self, pH:float):
        """
        The redocking analysis is conducted using the AutoDock Vina software with default parameters. The search box size is set to [24,24,24], the exhaustiveness
        is set to 20, and the number of result modes is set to 10. The parameters can be modified based on user conditions, and results are stored in a series of PDBQT files,
        named according to the identifiers reported in molecules.csv and stored in the output pathway. During this stage, the Root Mean Square Deviation (RMSD) is calculated 
        to evaluate the quality of the docking analysis. For RMSD calculation, a CSV file is generated in the output path folder, containing the RMSD values for each docking analysis.

        Raises:
            Exception: If any error occurs during the redocking analysis, a log file will be created and posted in the log folder.

        """        
        try:
            
            desc = Descriptors()
            results = []
            pdb_codes = DataFrame(self.__pdb_codes, columns=['PDB_CODE', 'LIGAND', 'RESNUM', 'CHAIN'])
            pdb_codes['RESNUM'] = pdb_codes['RESNUM'].astype(str)
            pdb_codes = pdb_codes.to_records(index=False)
            idx_to_remove = []

            for idx, (receptor, ligand, resnum, chain) in enumerate(pdb_codes):
                composite = f'{receptor}_{ligand}_{resnum}{chain}'
                
                center = self.retrieve_centerofmass_dataset(self.ligandpath, receptor, ligand, resnum, chain)
                if center == None:
                    idx_to_remove.append(idx)
                    continue

                self.generate_docking_script(input_template=os.path.join(self.project_root, 'src', 'scripts', 'vina', 'config.template'),
                                            output_script=(self.outputpath) + f'{composite}.vina',
                                            receptor=self.receptorpath + f'{receptor}_{chain}.dockprep.pdbqt',
                                            ligand=self.ligandpath + f'{composite}' + '.lig.pdbqt',
                                            center_x=center[0],
                                            center_y=center[1],
                                            center_z=center[2],
                                            size_x=self.__sizeof_box[0],
                                            size_y=self.__sizeof_box[1],
                                            size_z=self.__sizeof_box[2],
                                            out=f'{composite}.lig.pdbqt',
                                            exhaustiveness=self.__exhaustiveness,
                                            num_modes=self.__num_modes)        
                        
            
            
            self.perform_vina_evaluation()
            
            pdb_codes = np.delete(pdb_codes, idx_to_remove)
            for receptor, ligand, resnum, chain in pdb_codes:
                composite = f'{receptor}_{ligand}_{resnum}{chain}'
                iligand  = self.ligandpath + f'{composite}' + '.lig.pdbqt'
                vina_model = self.outputpath + f'{composite}' + '.lig.pdbqt'
                if os.path.isfile(iligand) and os.path.isfile(vina_model):
                    results.append((f'{receptor}', f'{ligand}', f'{resnum}', f'{chain}', desc.calcRMSD(iligand, vina_model)))

            
            rmsd = DataFrame(results, columns=['PDB_CODE', 'LIGAND', 'RESNUM', 'CHAIN', 'RMSD'])
            pdb_codes = DataFrame(self.__pdb_codes, columns=['PDB_CODE', 'LIGAND', 'RESNUM', 'CHAIN', 'RESOLUTION'])
            pdb_codes['RESNUM'] = pdb_codes['RESNUM'].astype(str)
            pdb_codes = pdb_codes.merge(rmsd, on=['PDB_CODE', 'LIGAND', 'RESNUM', 'CHAIN'], how='left')
            
            f1   = fileHandling(output_path=self.complexpath)
            f1.dataframe_to_csv('pdb_codes', pdb_codes)
                    
               
        except Exception as e:
            self.logger.error('during to perform the docking function', exc_info=True)



    def docking(self, base_selected_mols:str):

        """
        This function performs the docking analysis using the AutoDock Vina software. The analysis is conducted sequentially, considering the number of processes
        available in the molecules.csv. The search box size is set to [24,24,24], the exhaustiveness is set to 20, and the number of result modes is set to 10. The parameters
        can be modified based on user conditions, and results are stored in a series of PDBQT files, named according to the identifiers reported in molecules.csv.

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.

        """

        try:
            
            molecules = [f.rsplit('.lig.pdbqt')[0] for f in os.listdir((self.ligandpath)) if f.endswith('.lig.pdbqt')]
            
            self.__pdb_codes   = [(pdb[0], pdb[1], pdb[2], pdb[3]) for pdb in self.__pdb_codes]
            
            for receptor, ligand, resnum, chain in self.__pdb_codes:
                center    = self.retrieve_centerofmass_dataset(self.__centerofmasspath, receptor, ligand, resnum, chain)
                tmp       = [f.replace('.lig.pdbqt','').replace(f'{receptor}_', '') for f in os.listdir((self.outputpath)) if f.endswith('.lig.pdbqt')]
                molecules = set(molecules) - set(tmp)
               
                for mol in molecules:
                     self.generate_docking_script(input_template=os.path.join(self.project_root, 'src', 'scripts', 'vina', 'config.template'),
                                            output_script=(self.outputpath) + f'{receptor}_{mol}.vina',
                                            receptor=self.receptorpath + f'{receptor}_{chain}' + '.dockprep.pdbqt',
                                            ligand=self.ligandpath + mol + '.lig.pdbqt',
                                            center_x=center[0],
                                            center_y=center[1],
                                            center_z=center[2],
                                            size_x=self.__sizeof_box[0],
                                            size_y=self.__sizeof_box[1],
                                            size_z=self.__sizeof_box[2],
                                            out=f'{receptor}_{mol}.lig.pdbqt',
                                            exhaustiveness=self.__exhaustiveness,
                                            num_modes=self.__num_modes)
                     
                     time.sleep(1)
                     dir_fd = os.open((self.outputpath), os.O_DIRECTORY)
                     os.fsync(dir_fd)
                     time.sleep(1)
                     
                     command  = f'vina --config {receptor}_{mol}.vina'
                     validate = self.perform_subprocess(command, self.outputpath)
                     
                     if not validate:
                         f1 = fileHandling(input_path=base_selected_mols, output_path=base_selected_mols)
                         df = f1.csv_to_dataframe(self.mol_filename)
                         df = df[df['molecule_chembl_id'] != mol]
                         f1.dataframe_to_csv(self.mol_filename, df)
                         os.remove(self.ligandpath + mol + '.lig.pdbqt') if os.path.isfile((self.ligandpath) + mol + '.lig.pdbqt') else None
                         

        except Exception as e:
            self.logger.error('during to perform the docking function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)

        finally:
            time.sleep(1)
            dir_fd = os.open((self.outputpath), os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(1)

            [os.remove((self.outputpath) + file) for file in os.listdir((self.outputpath)) if file.endswith('.vina')]
            [os.remove((self.outputpath) + file) for file in os.listdir((self.outputpath)) if file.endswith('(2).pdbqt')]
            self.centers = None
           
        
        
        