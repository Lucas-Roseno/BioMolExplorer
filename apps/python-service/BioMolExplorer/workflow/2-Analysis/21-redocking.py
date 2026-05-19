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
from wrappers.redocking import perform_redocking
#----------------------------------------------------------------------------------------------



if __name__ == "__main__":

    #----------------------------------------------------------------------------------------------
    # REDOCKING EXPERIMENTS USING AUTODOCK VINA WITH COMPLEXES FROM PDB - RMSD CALCULATION
    #----------------------------------------------------------------------------------------------
    perform_redocking(base_input_path='/datasets/PDB',
                      target='MonoamineOxidaseB',
                      base_output_path='/resultados/redocking',
                      prepare_complex=True, charge_type='am1')
    