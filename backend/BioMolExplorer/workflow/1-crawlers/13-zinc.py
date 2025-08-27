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
import sys 
sys.path.append("src")
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from wrappers.crawlers import load_chembl, load_pdb, load_zinc
#----------------------------------------------------------------------------------------------



if __name__ == "__main__":
    

    #----------------------------------------------------------------------------------------------
    # Example 1: Load ZINC database
    # @param base_output_path: str = '/datasets' - base output path to save the data and find the 
    #                                              URIs files
    # @param zinc2d: bool  = False - if True, download 2D structures if URI is available
    # @param zinc3d: bool  = True  - if True, download 3D structures if URI is available
    # @param verbose: bool = True  - if True, print the progress in the console
    #----------------------------------------------------------------------------------------------
    load_zinc(base_output_path='/datasets',
              zinc2d=True, zinc3d=False,
              verbose=True) 
    
    
    
   