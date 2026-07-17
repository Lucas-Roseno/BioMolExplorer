#----------------------------------------------------------------------------------------------
from kernel.header_builder import HeaderBuilder

__doc__ = HeaderBuilder.build(

    module_title="ADMET analysis",

    module_description=(
    "Module for managing and integrating molecular " 
    "analysis by consensus docking strategy and redocking by AutoDock Vina"
),

    module_version="1.0.0"
)
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
import shutil
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


# ============================================================
# Portable binary resolution — works on any user / OS
# ============================================================

def resolve_binary(name: str, hint_paths: Optional[List[str]] = None) -> str:
    """
    Resolves the absolute path of an external binary in a portable way.

    Resolution order:
      1. System PATH  (shutil.which)
      2. Optional hint_paths list (checked in order, first existing wins)

    Args:
        name: Executable name, e.g. 'vina', 'dock6', 'sphgen'.
        hint_paths: Additional directories to search when not in PATH.

    Returns:
        Absolute path string to the binary.

    Raises:
        RuntimeError: If the binary cannot be found anywhere.
    """
    found = shutil.which(name)
    if found:
        return found

    import sys
    if hint_paths is None:
        hint_paths = []
    hint_paths.append(os.path.dirname(sys.executable))

    if hint_paths:
        for directory in hint_paths:
            candidate = os.path.join(directory, name)
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                return candidate

    raise RuntimeError(
        f"Required binary '{name}' was not found in your system PATH.\n"
        f"Please install it and ensure it is accessible via PATH, "
        f"or run the project's install.sh script."
    )


def resolve_dms_binary() -> str:
    """
    Resolves the 'dms' binary path in a portable, user-agnostic way.

    Resolution order:
      1. System PATH  (shutil.which 'dms')
      2. Pre-compiled binary inside the project's dms/ source directory
      3. Auto-compile from source (runs 'make' inside dms/ directory)

    Returns:
        Absolute path string to the dms binary.

    Raises:
        RuntimeError: If dms cannot be found or compiled.
    """
    # 1. Check system PATH
    found = shutil.which('dms')
    if found:
        return found

    # 2. Navigate up from this file to the project root (where dms/ lives)
    #    File structure: <project_root>/apps/python-service/BioMolExplorer/src/caad/docking.py
    #    So: parents[0]=caad, [1]=src, [2]=BioMolExplorer, [3]=python-service, [4]=apps, [5]=project_root
    try:
        current_file = Path(__file__).resolve()
        project_root = current_file.parents[5]
        dms_src_dir  = project_root / 'dms'
        dms_binary   = dms_src_dir / 'dms'

        if not dms_src_dir.is_dir():
            raise RuntimeError(
                f"DMS source directory not found at '{dms_src_dir}'.\n"
                "Expected the 'dms/' folder at the root of the project repository."
            )

        # 3. Compile from source if binary is not present
        if not dms_binary.exists():
            subprocess.run(
                ['make'],
                cwd=str(dms_src_dir),
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

        if dms_binary.exists() and os.access(str(dms_binary), os.X_OK):
            return str(dms_binary)

    except (subprocess.CalledProcessError, PermissionError, OSError) as compile_err:
        raise RuntimeError(
            f"Failed to compile DMS from source: {compile_err}\n"
            "Please run 'make && sudo make install' inside the 'dms/' directory, "
            "or ensure 'dms' is in your system PATH."
        ) from compile_err

    raise RuntimeError(
        "DMS binary not found and could not be compiled automatically.\n"
        "Please run 'make && sudo make install' inside the 'dms/' directory at the "
        "project root, or ensure 'dms' is accessible via your system PATH."
    )
# ============================================================

#----------------------------------------------------------------------------------------------
from kernel.utilities import fileHandling, MolConverter, MolExplorer
from kernel.loggers import LoggerManager
from kernel.config import BIOMOL_ROOT
from kernel.descriptors import Descriptors
from kernel.process_manager import ActiveSubprocesses
#----------------------------------------------------------------------------------------------

    
class Docking():
     
    def __init__(self, ligand_input_path:Optional[str]=None, receptor_input_path:Optional[str]=None,
                 complex_input_path:Optional[str]=None, output_path:Optional[str]=None,
                 mol_filename:Optional[str]='molecules') -> None:
        
        self.path           = BIOMOL_ROOT if BIOMOL_ROOT.endswith('/') else BIOMOL_ROOT + '/'
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
            template_abs_path = input_template if input_template.startswith(self.path) else os.path.join(self.path, input_template)
            with open(template_abs_path, 'r') as template_file:
                template_content = template_file.read()

            config_content = template_content.format(**kwargs)

            with open(output_script, 'w') as output_file:
                output_file.write(config_content)

        except Exception as e:
            self.logger.error(f'during to perform {input_template} -> {output_script} in generate_docking_script function', exc_info=True)
        
        finally:
            time.sleep(1)
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
           



    def perform_subprocess(self, command:str, local_path=None, shell=True, check=True) -> bool:
        """
        This function performs a subprocess execution of a given command. 
        """
        
        try:

            returncode, out, err = ActiveSubprocesses.run_subprocess(
                command,
                cwd=local_path,
                shell=shell,
                check=False
            )

            # O dock6 retorna exit code 0 mesmo quando falha. 
            # Então precisamos checar a saída explicitamente:
            if "ERROR:" in out or "ERROR:" in err:
                self.logger.error(f"Dock6 reported an ERROR but exited with 0. Command: {command}\nStdout: {out}\nStderr: {err}")
                with open("debug_dock6.txt", "a") as f:
                    f.write(f"Dock6 ERROR!\nCmd: {command}\nStdout:\n{out}\nStderr:\n{err}\n\n")
                return False

            if check and returncode != 0:
                raise subprocess.CalledProcessError(returncode, command, output=out, stderr=err)

            return True

        except subprocess.CalledProcessError as e:
            self.logger.error(f'STDERR: {e.stdout}', exc_info=True)
            self.logger.error(f'STDERR: {e.stderr}', exc_info=True)
            return False
        
        finally:
            if local_path != None:
                dir_fd = os.open(local_path, os.O_DIRECTORY)
                os.fsync(dir_fd)
            else:
                dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
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
            os.remove(self.outputpath + filename) if os.path.isfile(self.outputpath + filename) else None
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
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
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
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
        safe_workers = min(self.nprocess, 3) # Limita a no máximo 3 workers para evitar OOM (falta de RAM) no dock6

        if process_by_threads:
            with ThreadPoolExecutor(max_workers=safe_workers) as executor:
                futures = [executor.submit(method, *args) for args in args_list]
                results = [future.result() for future in futures]
        
        else:
            with ProcessPoolExecutor(max_workers=safe_workers) as executor:
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
                    self.generate_docking_script(input_template=self.path + 'src/scripts/chimera/prepare_complex.template',
                                                output_script=self.outputpath + f'prepare_complex_{receptor}_{chain}.com',
                                                pdb_code=self.complexpath + receptor,
                                                input_complex=self.complexpath + receptor,
                                                chain=chain_id,
                                                output_complex=f'{receptor}_{chain}')
                    complexes.append(f'prepare_complex_{receptor}_{chain}.com')
                
                
                if f'prepare_receptor_{receptor}_{chain}.com' not in receptors:
                    self.generate_docking_script(input_template=self.path + 'src/scripts/chimera/prepare_receptor.template',
                                                output_script=self.outputpath + f'prepare_receptor_{receptor}_{chain}.com',
                                                input_complex=self.outputpath + f'{receptor}_{chain}' + '.complex',
                                                receptor=self.outputpath + f'{receptor}_{chain}')
                    receptors.append(f'prepare_receptor_{receptor}_{chain}.com')
            
                
                extention = f'{receptor}_{ligand}_{resnum}{chain}'
                self.generate_docking_script(input_template=self.path + 'src/scripts/chimera/prepare_ligand.template',
                                             output_script=self.outputpath + f'prepare_ligand_{extention}.com',
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
                self.prepare_on_obabel(f'{pdb[0]}_{chain}.dockprep.mol2', f'{pdb[0]}_{chain}.dockprep.pdbqt', [('p',str(pH)), ('xr','')], input_format='mol2', output_format='pdbqt')
            
            args = [(file,) for file in ligands]
            self.process_in_parallel(method_name='prepare_on_chimera', args_list=args)  
            
            tmp_codes = []
            for pdb in pdb_codes:
                key = f'{pdb[0]}_{pdb[1]}_{pdb[2]}{chain}'
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
             self.logger.error(f'recover_better_conforms_of_vina failed: {e}', exc_info=True)
             return None
        
        finally:
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(1)
                


    def recover_better_conforms_of_vina(self, charge_type:str, filename:Optional[list]=None, molecules_dataset:Optional[str]=None):  
        """
        This function recover better conformations for each ligand performed by AutoDock Vina software. The input files are prepared in a specific
        format required to perform docking with different docking software. Templates for the input files are available in the src/scripts folder.
        Some limitations are present in the preparation of the input files, such as the need to preserve declared variables because they are used 
        to replace placeholders in the output scripts prepared.

        Args:
            filename (list): The list of files to be prepared for better conformation recovery. If None is provided, such files are extracted
            utilizing the default ligand pathway provided in the ligandpath variable to retrieve the ligand files.
            molecules_dataset (str): The path to the dataset file containing the molecules to be used in the docking analysis.

        Raises:
            Exception: If any error occurs during the recovery of better conformations, a log file will be created and posted in the log folder.

        """
        try:

            files = [f for f in os.listdir(self.ligandpath) if f.endswith('.pdbqt')] if filename == None else filename
            conv      = MolConverter(input_path=self.ligandpath, output_path=self.outputpath)
            explorer  = MolExplorer(input_path=self.ligandpath, output_path=self.outputpath)
            
            for input_file in files:

                pdb_str_content = conv.extract_pdb_to_pdbqt(input_file, start_index='MODEL 1', end_index='MODEL 2', pdb_filename=input_file.rsplit('.')[0]+'.pdb')
               
                
                if not explorer.is_fragmented(pdb_str_content):
                    
                    self.generate_docking_script(input_template=self.path + 'src/scripts/chimera/prepare_better_conform.template',
                                             output_script=self.outputpath + f'prepare_better_conform_{input_file}.com',
                                             ligand=input_file.rsplit(".")[0], charge_type=charge_type)

            
            args = [(f'prepare_better_conform_{input_file}.com',) for input_file in files]
            self.process_in_parallel(method_name='prepare_on_chimera', args_list=args)
            

            files = [f for f in os.listdir(self.outputpath) if f.endswith('.lig.mol2')]
            for file in files:
                with open(self.outputpath + file, 'r') as fp:
                    lines = ''.join(fp.readlines())
                    if lines.find('nan') >= 0:
                        os.remove(self.outputpath + file)


            if molecules_dataset:
                fx = fileHandling(input_path=molecules_dataset, output_path=molecules_dataset)
                files = [f.replace('.lig.mol2','').split('_')[1] for f in os.listdir(self.outputpath) if f.endswith('.lig.mol2')]
                df = fx.csv_to_dataframe(self.mol_filename)
                
                if df is not None and not df.empty and 'molecule_chembl_id' in df.columns:
                    data = df[df['molecule_chembl_id'].isin(files)]
                    fx.dataframe_to_csv(self.mol_filename, data)
                    valid_mols = set(data['molecule_chembl_id'].tolist())
                    to_remove = set(files) - valid_mols
                else:
                    to_remove = set()
                
                path = self.outputpath
                for f in os.listdir(path):
                    if f.endswith('.lig.mol2'):
                        mol_id = f.replace('.lig.mol2','').split('_')[1]
                        if mol_id in to_remove:
                            os.remove(path + f)

        except Exception as e:
            self.logger.error(f'during to perform {filename} in recover_better_conformation function', exc_info=True)

        finally:
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(1)
            
            pdbs = [f for f in os.listdir(self.outputpath) if f.endswith('.pdb')]
            [os.remove(self.outputpath + file) for file in pdbs]
            
            mols = [f for f in os.listdir(self.outputpath) if f.endswith('(2).lig.mol2')]
            [os.remove(self.outputpath + file) for file in mols]
            
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
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
            
            if df.empty:
                self.logger.error("The CSV file is empty or does not exist.")
                raise FileNotFoundError(f"The molecules file was not found or is empty at {self.ligandpath}")
            
            if 'canonical_smiles' not in df.columns and 'molecule_structures' in df.columns:
                df['canonical_smiles'] = f1.convert_str_to_dict(df, 'molecule_structures', 'canonical_smiles')
                
            df.dropna(subset=['canonical_smiles'], inplace=True)
            df['molecule_chembl_id'] = df['molecule_chembl_id'].astype(str)
            data = df[['molecule_chembl_id', 'canonical_smiles']].to_records(index=False)
            
            for chemblid, smiles in data:
                self.prepare_on_obabel(inputfile=smiles, outputfile=chemblid + '.lig.pdbqt', input_format="smi", output_format='pdbqt', params=[('p',str(pH))])
    

        except Exception as e:
            c_id = locals().get('chemblid', 'unknown_id')
            s_id = locals().get('smiles', 'unknown_smiles')
            self.logger.error(f'during to perform {c_id} -> {s_id} in prepare_compounds function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)
            raise # Re-raise to fail the pipeline

        finally:
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(1)

            mols = [f.split('.lig.pdbqt')[0] for f in os.listdir(self.outputpath) if f.endswith('.lig.pdbqt')]
            df = df[df['molecule_chembl_id'].isin(mols)]
            f1.dataframe_to_csv(self.mol_filename, df)

            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
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
        
        files_to_perform = [f for f in os.listdir(self.outputpath) if f.endswith('.vina')] 
        vina_bin = resolve_binary('vina')
            
        for file in files_to_perform:
            command = f'{vina_bin} --config {file}'
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

                self.generate_docking_script(input_template=self.path + 'src/scripts/vina/config.template',
                                            output_script=self.outputpath + f'{composite}.vina',
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



    def docking(self, base_selected_mols:str, cancel_check=None):

        """
        This function performs the docking analysis using the AutoDock Vina software. The analysis is conducted sequentially, considering the number of processes
        available in the molecules.csv. The search box size is set to [24,24,24], the exhaustiveness is set to 20, and the number of result modes is set to 10. The parameters
        can be modified based on user conditions, and results are stored in a series of PDBQT files, named according to the identifiers reported in molecules.csv.

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.

        """

        try:
            
            molecules = [f.rsplit('.lig.pdbqt')[0] for f in os.listdir(self.ligandpath) if f.endswith('.lig.pdbqt')]
            
            self.__pdb_codes   = [(pdb[0], pdb[1], pdb[2], pdb[3]) for pdb in self.__pdb_codes]
            
            for receptor, ligand, resnum, chain in self.__pdb_codes:
                if cancel_check and cancel_check():
                    break
                center    = self.retrieve_centerofmass_dataset(self.__centerofmasspath, receptor, ligand, resnum, chain)
                tmp       = [f.replace('.lig.pdbqt','').replace(f'{receptor}_', '') for f in os.listdir(self.outputpath) if f.endswith('.lig.pdbqt')]
                molecules = set(molecules) - set(tmp)
               
                for mol in molecules:
                     if cancel_check and cancel_check():
                         self.logger.info("DockVina docking cancelled by user.")
                         break
                     self.generate_docking_script(input_template=self.path + 'src/scripts/vina/config.template',
                                            output_script=self.outputpath + f'{receptor}_{mol}.vina',
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
                     dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
                     os.fsync(dir_fd)
                     time.sleep(1)

                     vina_bin = resolve_binary('vina')
                     command  = f'{vina_bin} --config {receptor}_{mol}.vina'
                     validate = self.perform_subprocess(command, self.outputpath)
                     
                     if not validate:
                         f1 = fileHandling(input_path=base_selected_mols, output_path=base_selected_mols)
                         df = f1.csv_to_dataframe(self.mol_filename)
                         df = df[df['molecule_chembl_id'] != mol]
                         f1.dataframe_to_csv(self.mol_filename, df)
                         os.remove(self.ligandpath + mol + '.lig.pdbqt') if os.path.isfile(self.ligandpath + mol + '.lig.pdbqt') else None
                         

        except Exception as e:
            self.logger.error('during to perform the docking function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)

        finally:
            time.sleep(1)
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(1)

            [os.remove(self.outputpath + file) for file in os.listdir(self.outputpath) if file.endswith('.vina')]
            [os.remove(self.outputpath + file) for file in os.listdir(self.outputpath) if file.endswith('(2).pdbqt')]
            self.centers = None
                    



class Dock6(Docking):
    
    
    def __init__(self, dock6_path:Optional[str]='', ligand_input_path:Optional[str]=None, receptor_input_path:Optional[str]=None,
                 base_output_path:Optional[str]=None, pdb_code:Optional[str]=None, density:Optional[float]=0.5, 
                 radius:Optional[float]=1.4, distance:Optional[float]=10.0, max_residues:Optional[int]=50,
                 conformer_search_type:Optional[Literal['flex', 'rigid']] = 'flex', mol_filename:Optional[str]='molecules',) -> None:
        
        super().__init__(ligand_input_path=ligand_input_path,
                         receptor_input_path=receptor_input_path,
                         output_path=f'{base_output_path}/',
                         mol_filename=mol_filename)
        
        self.__dock6_path            = dock6_path
        self.__base_output_path      = base_output_path  
        self.__pdb_code              = pdb_code
        self.__density               = density
        self.__radius                = radius
        self.__distance              = distance
        self.__max_residues          = max_residues
        self.__conformer_search_type = conformer_search_type


     
    def prepare_surface(self) -> None:
        
        """
        The following function outlines the steps to prepare the surface of a pdb_code using the DOCK 6 software. 
        As default, the density is set to 0.5 and the radius to 1.4, but, if necessary, these parameters can be modified.

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.

        """

        try:

            self.set_outputpath(f'{self.__base_output_path}/surface/' )

            os.remove(self.outputpath + self.__pdb_code + ".dms") if os.path.exists(self.outputpath + self.__pdb_code + ".dms") else None
            os.remove(self.outputpath + self.__pdb_code + ".sph") if os.path.exists(self.outputpath + self.__pdb_code + ".sph") else None

            receptor_pdb = self.receptorpath + self.__pdb_code
            output_prefix = self.outputpath + self.__pdb_code

            # ── Step 1: Generate molecular surface using DMS ──────────────────────
            # DMS requires the .noH.pdb (hydrogen-stripped PDB) and produces a .dms
            # surface file that sphgen uses to place docking spheres.
            dms_bin = resolve_dms_binary()
            command = (
                f'{dms_bin} "{receptor_pdb}.noH.pdb" '
                f'-d {self.__density} '
                f'-n '
                f'-w {self.__radius} '
                f'-v '
                f'-o {output_prefix}.dms'
            )
            self.perform_subprocess(command, self.outputpath)

            # ── Step 2: Generate spheres using sphgen ─────────────────────────────
            sphgen_bin = resolve_binary('sphgen', [self.__dock6_path + 'bin'])
            self.generate_docking_script(
                input_template=self.path + 'src/scripts/dock6/INSPH.template',
                output_script=self.outputpath + 'INSPH',
                receptor=self.__pdb_code
            )
            command = f'{sphgen_bin} -i INSPH -o OUTSPH'
            self.perform_subprocess(command, self.outputpath)

            # ── Step 3: Select spheres for each ligand via sphere_selector ────────
            self.set_outputpath(f'{self.__base_output_path}/surface/Molecules/')
            selector = f'{self.__base_output_path}/surface/' + self.__pdb_code + '.sph'

            sphere_selector_bin = resolve_binary('sphere_selector', [self.__dock6_path + 'bin'])
            files = [f for f in os.listdir(self.ligandpath) if f.endswith('.mol2')]
            for ligand in files:
                command = f'{sphere_selector_bin} {selector} {self.ligandpath + ligand} {self.__distance}'
                self.perform_subprocess(command, self.outputpath)
                sph_file = self.outputpath + 'selected_spheres.sph'
                if os.path.exists(sph_file):
                    os.rename(sph_file, self.outputpath + ligand.rsplit('.')[0] + '.sph')
                else:
                    self.logger.warning(f"Failed to generate spheres for {ligand}")

        except Exception as e:
            self.logger.error(f'during to perform into prepare_surface function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)

        finally:
            time.sleep(1)
            surface_dir = f'{self.__base_output_path}/surface/'

            os.remove(surface_dir + "temp1.ms")  if os.path.exists(surface_dir + "temp1.ms")  else None
            os.remove(surface_dir + "temp2.sph") if os.path.exists(surface_dir + "temp2.sph") else None
            os.remove(surface_dir + "temp3.atc") if os.path.exists(surface_dir + "temp3.atc") else None
            os.remove(surface_dir + "OUTSPH")    if os.path.exists(surface_dir + "OUTSPH")    else None
            os.remove(surface_dir + 'INSPH')     if os.path.exists(surface_dir + 'INSPH')     else None

            dir_fd = os.open(surface_dir, os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(1)
            


    def prepare_showbox(self):
        """
        This function details the steps to prepare the showbox of a receptor using the DOCK 6 software. The analysis is conducted 
        sequentially, taking into account the number of processes specified in molecules.csv. The search box size is set to [24, 24, 24],
        the exhaustiveness is set to 20, and the number of result modes is set to 10. These parameters can be modified based on user
        requirements. The results are stored in a series of PDBQT files, named according to the identifiers in molecules.csv.

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.
        """
        try:
            
            self.set_outputpath(f'{self.__base_output_path}/showbox/')
            surface_inputpath = f'{self.__base_output_path}/surface/Molecules/'
            
            files = [f for f in os.listdir(surface_inputpath) if f.endswith('.sph')]
            for ligand in files:
                
                self.generate_docking_script(input_template=self.path + 'src/scripts/dock6/showbox.template',
                                             output_script=self.outputpath + f'{ligand.split(".")[0]}.in',
                                             in_surface='../surface/Molecules/' + ligand,
                                             out_surface=ligand.rsplit('.')[0]+'.box.pdb')
    
            
            showbox_bin = resolve_binary('showbox', [self.__dock6_path + 'bin'])
            for ligand in files:
                command = f'{showbox_bin} < {ligand.split(".")[0]}.in'
                self.perform_subprocess(command, self.outputpath)

            
        except Exception as e:
            self.logger.error(f'during to perform the prepare_showbox function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)
        
        finally:
            time.sleep(1)
            files = [f for f in os.listdir(self.outputpath) if f.endswith('.in')]
            [os.remove(self.outputpath + ligand) for ligand in files if os.path.exists(self.outputpath + ligand)]
            time.sleep(1)
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd) 
            

            
            
            
    def perform_parallel_gridbox(self, showbox:str, tid:int):
        """
        This function outlines the steps to prepare the grid box of a receptor using the DOCK 6 software. The analysis is conducted 
        in a parallel execution, taking into account the number of CPU's specified in the computational architecture. 

        Args:
            receptor (str): The receptor file to perform the grid box.
            showbox (str): The showbox file to perform the grid box.
            tid (int): The identifier of the thread.
            show_log (bool): If True, the log file will be generated.
            logger (bool): If True, the log file will be generated.

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.
        """
        
        output = self.outputpath + showbox.rsplit('.')[0]
        grid_bin = resolve_binary('grid', [self.__dock6_path + 'bin'])
        command = f'{grid_bin} -i {str(tid)}_grid.in -o {showbox.rsplit(".")[0]}.out -t'
        self.perform_subprocess(command, local_path=self.outputpath)

        dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
        os.fsync(dir_fd)
        time.sleep(1)
               


    def prepare_gridbox(self):
        """
        This function outlines the steps to prepare a parallel execution of perform_parallel_gridbox method for the DOCK 6 software. 
        The analysis is conducted taking into account the number of CPU's specified in the computational architecture. 

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.
        """
        try:

            self.set_outputpath(f'{self.__base_output_path}/gridbox/')
            showbox_inputpath = f'{self.__base_output_path}/showbox/'
            
            files = [f for f in os.listdir(showbox_inputpath) if f.endswith('.box.pdb')]
            args = [(showbox[1], showbox[0]) for showbox in enumerate(files)]

            for tid, showbox in enumerate(files):
                self.generate_docking_script(input_template=self.path + 'src/scripts/dock6/grid.template',
                                            output_script=self.outputpath + str(tid) + '_grid.in',
                                            receptor_file=os.path.relpath(self.receptorpath + self.__pdb_code + '.dockprep.mol2', self.outputpath),
                                            box_file=os.path.relpath(f'{self.__base_output_path}/showbox/' + showbox, self.outputpath),
                                            dock6_path=self.__dock6_path,
                                            score_grid_prefix=showbox.rsplit('.')[0])


            self.process_in_parallel(method_name='perform_parallel_gridbox', args_list=args) if args else None


        except Exception as e:
            self.logger.error(f'during to perform into prepare_gridbox function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)
            
        finally:
            time.sleep(1)
            # [os.remove(self.outputpath + f) for f in os.listdir(self.outputpath) if f.endswith('_grid.in')]
            # [os.remove(self.outputpath + f) for f in os.listdir(self.outputpath) if f.endswith('.out')] 
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
            
            
            



    def perform_parallel_minimization(self, ligand:str, tid:int):
        """
        This function outlines the steps to perform the minimization of a ligand using the DOCK 6 software. The analysis is conducted 
        in a parallel execution, taking into account the number of CPU's specified in the computational architecture. 

        Args:
            ligand (str): The ligand file to perform the minimization.
            tid (int): The identifier of the thread.

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.
        """


        output = ligand.rsplit('.')[0]
        dock6_bin = resolve_binary('dock6', [self.__dock6_path + 'bin'])
        command = f'{dock6_bin} -i {str(tid)}_min.in -o {output}.out'
        self.perform_subprocess(command, local_path=self.outputpath)

        dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
        os.fsync(dir_fd)
        time.sleep(1)
                  
        
    
    
    def prepare_minimization(self):
        """
        This function outlines the steps to prepare a parallel execution of perform_parallel_minimization method for the DOCK 6 software. 
        The analysis is conducted taking into account the number of CPU's specified in the computational architecture. 

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.
        """ 
        
        try:
            self.set_outputpath(f'{self.__base_output_path}/energy_min/')

            # Bug fix: self.ligandpath is already an absolute path (set_ligandpath guarantees it).
            # Concatenating self.path (also absolute) created an invalid duplicated path.
            files = [f for f in os.listdir(self.ligandpath) if f.endswith('.mol2')]
            args = [(ligand[1], ligand[0]) for ligand in enumerate(files)]

            for tid, ligand in enumerate(files):
                self.generate_docking_script(input_template=self.path + 'src/scripts/dock6/min.template',
                                        output_script=self.outputpath + str(tid) +"_min.in",
                                        ligand_atom_file=os.path.relpath(f'{self.ligandpath}' + ligand, self.outputpath),
                                        rmsd_reference_filename=os.path.relpath(f'{self.ligandpath}' + ligand, self.outputpath),
                                        grid_score_grid_prefix=os.path.relpath(f'{self.__base_output_path}/gridbox/' + ligand.rsplit('.')[0], self.outputpath),
                                        dock6_path=self.__dock6_path,
                                        ligand_outfile_prefix=ligand.rsplit('.')[0]+'.lig.min')

            
            
            self.process_in_parallel(method_name='perform_parallel_minimization', args_list=args) if args else None    
            

        except Exception as e:
            self.logger.error(f'during to perform into prepare_minimization function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)

        finally:
            time.sleep(5)
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
            if os.path.isdir(self.outputpath):
                [os.remove(self.outputpath + f) for f in os.listdir(self.outputpath) if f.endswith('_min.in')]
                [os.remove(self.outputpath + f) for f in os.listdir(self.outputpath) if f.endswith('.out')] 
                dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
                os.fsync(dir_fd)
            
             



    
    def __identify_residues(self, filename, max_res):
        """
        This function identifies the residues based on the docking analysis. The function reads the output file generated by the DOCK 6 software
        and retrieves the residues with the highest scores. Once the residues are identified, the function returns the residues with the highest
        scores to plot the footprints.

        Args:
            filename (str): The filename to be analyzed.
            max_res (int): The maximum number of residues to be selected.

        Returns:
            resindex_selected (list): The list of residues with the highest scores.
            resindex_remainder (list): The list of residues with the lowest scores.
        """
        try:
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)

            filename = self.outputpath + filename
            fp_file = open(filename,'r')
            lines = fp_file.readlines()
            fp_file.close()

            num_res = 0
            for line in lines:
                linesplit = line.split()
                if (len(linesplit) == 8):
                    if (linesplit[0] != 'resname'):
                        num_res += 1
            
            fp_array = [[0 for i in range(2)] for j in range(num_res)]
            for i in range(num_res):
                fp_array[i][0] = i

            count = 0
            for line in lines:
                linesplit = line.split()
                if (len(linesplit) == 8 and linesplit[0] != 'resname'):
                    fp_array[count][1] = max(math.fabs(float(linesplit[2])), math.fabs(float(linesplit[3])), math.fabs(float(linesplit[5])), math.fabs(float(linesplit[6])))
                    count += 1

            fp_array.sort(key=lambda x: x[1])
            resindex_selected = []
            resindex_remainder = []

            actual_max_res = min(max_res, num_res)
            for i in range(actual_max_res):
                resindex_selected.append(fp_array[(num_res-1)-i][0])

            for i in range(num_res - actual_max_res):
                resindex_remainder.append(fp_array[i][0])

            resindex_selected.sort()
            resindex_remainder.sort()
            del fp_array[:][:]

            return resindex_selected, resindex_remainder
        
        except Exception as e:
            self.logger.error(f'during to perform the __identify_residues function', exc_info=True)
        



    def __plot_footprints(self, filename, resindex_selected, resindex_remainder):
        """
        This function plots the footprints based on the docking analysis. The function reads the output file generated by the DOCK 6 software
        and retrieves the residues with the highest scores. Once the residues are identified, the function plots the footprints based on the
        identified residues.

        Args:
            filename (str): The filename to be analyzed.
            resindex_selected (list): The list of residues with the highest scores.
            resindex_remainder (list): The list of residues with the lowest scores.
        """
        
        dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
        os.fsync(dir_fd)

        data = self.outputpath + filename + '_footprint_scored.txt'
        footprint = open(data,'r')
        lines = footprint.readlines()
        footprint.close()

        resname = []; resid = []; vdw_ref = []; es_ref = []; vdw_pose = []; es_pose = []
        vdw_score = ""; es_score = ""
        vdw_energy = ""; es_energy = ""
        for line in lines:
            linesplit = line.split()
            if (len(linesplit) == 3):
                if (linesplit[1] == 'vdw_fp:'):
                    vdw_score = 'd = '+linesplit[2]
                if (linesplit[1] ==  'es_fp:'):
                    es_score = 'd = '+linesplit[2]
                if (linesplit[1] == 'vdw:'):
                    vdw_energy = 'vdw = '+linesplit[2]+' kcal/mol'
                if (linesplit[1] == 'es:'):
                    es_energy = 'es = '+linesplit[2]+' kcal/mol'
            if (len(linesplit) == 8):
                if (linesplit[0] != 'resname'):
                    resname.append(linesplit[0])
                    resid.append(linesplit[1])
                    vdw_ref.append(float(linesplit[2]))
                    es_ref.append(float(linesplit[3]))
                    vdw_pose.append(float(linesplit[5]))
                    es_pose.append(float(linesplit[6]))

        
        resname_selected = []
        vdw_ref_selected = []; es_ref_selected = []; vdw_pose_selected = []; es_pose_selected = []
        for i in (resindex_selected):
            resname_selected.append(resname[i]+resid[i])
            vdw_ref_selected.append(vdw_ref[i])
            es_ref_selected.append(es_ref[i])
            vdw_pose_selected.append(vdw_pose[i])
            es_pose_selected.append(es_pose[i])

        
        vdw_ref_remainder = 0; es_ref_remainder = 0; vdw_pose_remainder = 0; es_pose_remainder = 0
        for i in (resindex_remainder):
            vdw_ref_remainder += vdw_ref[i]
            es_ref_remainder += es_ref[i]
            vdw_pose_remainder += vdw_pose[i]
            es_pose_remainder += es_pose[i]

        
        resname_selected.append('REMAIN')
        vdw_ref_selected.append(vdw_ref_remainder)
        es_ref_selected.append(es_ref_remainder)
        vdw_pose_selected.append(vdw_pose_remainder)
        es_pose_selected.append(es_pose_remainder)
        
        residue = []
        for i in range(len(resname_selected)):
            residue.append(i)

        fig = plt.figure(figsize=(20, 18))
        ax1 = fig.add_subplot(2,1,1)
        ax1.set_title(filename.strip())
        plt.plot(residue, vdw_ref_selected, 'b', linewidth=3)
        plt.plot(residue, vdw_pose_selected, 'r', linewidth=3)
        ax1.set_ylabel('VDW Energy')
        ax1.set_ylim(-10, 5)
        ax1.set_xlim(0, len(resname_selected))
        ax1.xaxis.set_major_locator(MultipleLocator(1))
        ax1.xaxis.set_major_formatter(FormatStrFormatter('%s'))
        ax1.set_xticks(residue)
        ax1.xaxis.grid(which='major', color='black', linestyle='solid')
        ax1.set_xticklabels(resname_selected, rotation=90)
        ax1.legend(['Reference', 'Pose'])
        ax1.annotate(vdw_score, xy=(37,-8), backgroundcolor='white', bbox={'facecolor':'white', 'alpha':1.0, 'pad':10})
        ax1.annotate(vdw_energy, xy=(37,-9), backgroundcolor='white', bbox={'facecolor':'white', 'alpha':1.0, 'pad':10})
        
        ax2 = fig.add_subplot(2,1,2)
        plt.plot(residue, es_ref_selected, 'b', linewidth=3)
        plt.plot(residue, es_pose_selected, 'r', linewidth=3)
        ax2.set_ylabel('ES Energy')
        ax2.set_ylim(-10, 5)
        ax2.set_xlim(0, len(resname_selected))
        ax2.xaxis.set_major_locator(MultipleLocator(1))
        ax2.xaxis.set_major_formatter(FormatStrFormatter('%s'))
        ax2.set_xticks(residue)
        ax2.xaxis.grid(which='major', color='black', linestyle='solid')
        ax2.set_xticklabels(resname_selected, rotation=90)
        ax2.legend(['Reference', 'Pose'])
        ax2.annotate(es_score, xy=(37,-8), backgroundcolor='white', bbox={'facecolor':'white', 'alpha':1.0, 'pad':10})
        ax2.annotate(es_energy, xy=(37,-9), backgroundcolor='white', bbox={'facecolor':'white', 'alpha':1.0, 'pad':10})
        
        if not os.path.exists(self.outputpath + 'plots/'):
            os.makedirs(self.outputpath + 'plots/', exist_ok=True)
            
        filename = self.outputpath + 'plots/' + filename + '.pdf'
        plt.savefig(filename)
        plt.close()
            
                

    def perform_parallel_footprint(self, receptor:str, ligand:str, tid:int):
        """
        This function outlines the steps to perform the footprint analysis using the DOCK 6 software. The analysis is conducted 
        in a parallel execution, taking into account the number of CPU's specified in the computational architecture. 

        Args:
            receptor (str): The receptor file to perform the footprint analysis.
            ligand (str): The ligand file to perform the footprint analysis.
            tid (int): The identifier of the thread.
            logger (bool): If True, the log file will be generated.

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.
        """
            
        output = receptor + '_' + ligand
        dock6_bin = resolve_binary('dock6', [self.__dock6_path + 'bin'])
        command = f'{dock6_bin} -i {str(tid)}_footprint.in -o {output}.out'
        self.perform_subprocess(command, local_path=self.outputpath)
            
        dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
        os.fsync(dir_fd)
        time.sleep(1)
               
        
    
    def prepare_footprint(self):
        """
        This function outlines the steps to prepare a parallel execution of perform_parallel_footprint method for the DOCK 6 software. 
        The analysis is conducted taking into account the number of CPU's specified in the computational architecture. 

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.
        """

        try:
            self.set_outputpath(f'{self.__base_output_path}/footprint/')

            files = [f.split('.')[0] for f in os.listdir(f'{self.ligandpath}') if f.endswith('.mol2')] 
            
            args = [(self.__pdb_code, ligand[1], ligand[0]) for ligand in enumerate(files)]
            
            for tid, ligand in enumerate(files):
                self.generate_docking_script(input_template=self.path + 'src/scripts/dock6/footprint.template',
                                        output_script=self.outputpath + str(tid) +"_footprint.in",
                                        ligand_atom_file=os.path.relpath(f'{self.__base_output_path}/energy_min/' + ligand + '.lig.min_scored.mol2', self.outputpath),
                                        fps_score_footprint_reference_mol2_filename=os.path.relpath(f'{self.ligandpath}' + ligand + '.lig.mol2', self.outputpath),
                                        fps_score_receptor_filename=os.path.relpath(self.receptorpath + self.__pdb_code + '.dockprep.mol2', self.outputpath),
                                        dock6_path=self.__dock6_path,
                                        ligand_outfile_prefix=ligand)


            self.process_in_parallel(method_name='perform_parallel_footprint', args_list=args) if args else None
        

        except Exception as e:
            self.logger.error(f'during to perform into prepare_footprint function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)


        finally:
            time.sleep(1)
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
            [os.remove(self.outputpath + f) for f in os.listdir(f'{self.outputpath}') if f.endswith('.in')]
            


    
    def plot_footprint_results(self):
        """
        This function plots the footprints based on the docking analysis. The function reads the output file generated by the DOCK 6 software
        and retrieves the residues with the highest scores. Once the residues are identified, the function plots the footprints based on the
        identified residues.

        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.
        """

        try:

            self.set_outputpath(f'{self.__base_output_path}/footprint/')
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
            time.sleep(5)

            files = [f for f in os.listdir(self.outputpath) if f.endswith('_footprint_scored.txt')]
            for filename in files:
                resindex_selected, resindex_remainder = self.__identify_residues(filename, self.__max_residues)
                self.__plot_footprints(filename.replace('_footprint_scored.txt', ''), resindex_selected, resindex_remainder)
        
        except Exception as e:
            self.logger.error(f'during to perform the plot_footprint_results function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)
        
        finally:
            time.sleep(1)
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
            
            
    
       
    def perform_parallel_docking(self, tid:int):
        """
        This function outlines the steps to perform the docking analysis using the DOCK 6 software. The analysis is conducted 
        in a parallel execution, taking into account the number of CPU's specified in the computational architecture. 

        Args:
            tid (int): The identifier of the thread.
            
        Raises:
            Exception: If any error occurs during the docking analysis, a log file will be created and posted in the log folder.
        """
        
        dock6_bin = resolve_binary('dock6', [self.__dock6_path + 'bin'])
        command = f'{dock6_bin} -i {str(tid)}_docking.in'
        self.perform_subprocess(command, local_path=self.outputpath)

        dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
        os.fsync(dir_fd)
        time.sleep(1)

        
    
        
    def perform_dock6_evaluation(self):
        
        try:
            self.set_outputpath(f'{self.__base_output_path}/flex/')
            
            files = [f for f in os.listdir(f'{self.__base_output_path}/energy_min/') if f.endswith('.mol2')]
            args = [(ligand[0],) for ligand in enumerate(files)]

            for tid, ligand in enumerate(files):
                self.generate_docking_script(input_template=self.path + 'src/scripts/dock6/docking.template',
                                        output_script=self.outputpath + str(tid) + '_docking.in',
                                        conformer_search_type=self.__conformer_search_type,
                                        ligand_atom_file=os.path.relpath(f'{self.__base_output_path}/energy_min/' + ligand, self.outputpath),
                                        rmsd_reference_filename=os.path.relpath(f'{self.__base_output_path}/energy_min/' + ligand, self.outputpath),
                                        receptor_site_file=os.path.relpath(f'{self.__base_output_path}/surface/Molecules/{ligand.split(".")[0]}.sph', self.outputpath), 
                                        ligand_sphere_file=os.path.relpath(f'{self.__base_output_path}/surface/Molecules/{ligand.split(".")[0]}.sph', self.outputpath),
                                        grid_score_grid_prefix=os.path.relpath(f'{self.__base_output_path}/gridbox/' + ligand.split(".")[0], self.outputpath),
                                        dock6_path=self.__dock6_path,
                                        ligand_outfile_prefix=ligand.split(".")[0])
                
            
            self.process_in_parallel(method_name='perform_parallel_docking', args_list=args) if args else None
        
        except Exception as e:
            self.logger.error(f'during to perform the perform_dock6_evaluation function', exc_info=True)
            self.logger.error(f'STDERR: {e}', exc_info=True)
        
        finally:
            time.sleep(1)
            # [os.remove(self.outputpath + f) for f in os.listdir(self.outputpath) if f.endswith('.in')]
            dir_fd = os.open(self.outputpath, os.O_DIRECTORY)
            os.fsync(dir_fd)
           
        
        
        