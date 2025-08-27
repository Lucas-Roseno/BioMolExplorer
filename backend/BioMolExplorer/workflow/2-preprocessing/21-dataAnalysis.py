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
from wrappers.molecular_analyzer import compute_similarity, analyze_graphs
from kernel.descriptors import similarityFunctions, fingerprints
from wrappers.molecular_analyzer import generate_fingerprints
#----------------------------------------------------------------------------------------------


if __name__ == "__main__":
    
    
    #----------------------------------------------------------------------------------------------
    # PREPARE FINGERPRINTS FOR EACH MOL AND SIM FILES AVAILABLE IN THE DRUGBANK FOLDER.
    # @param base_input_path: The path to the folder containing the MOL and SIM files.
    # @param amputate: If True, the amputate function is used to remove columns with no variation.
    # @param morgan: If True, the Morgan fingerprint is generated.
    # @param maccs: If True, the MACCS fingerprint is generated.
    # @param pharmacophore: If True, the pharmacophore fingerprint is generated.
    #----------------------------------------------------------------------------------------------
    generate_fingerprints(base_input_path='/datasets/ChEMBL/DrugBank',
                          morgan=True, maccs=True, pharmacophore=True
    )
    
    #----------------------------------------------------------------------------------------------
    # COMPUTE THE SIMILARITY BETWEEN THE MOLECULES BASED ON THE FINGERPRINTS GENERATED.
    # @param base_input_path: The path to the folder containing the fingerprints.
    # @param base_output_path: The path to the folder where the similarity computations will be saved.
    # @param metric: The similarity metric to be used (Tanimoto, Dice, Cosine, etc).
    # @param fingerprint: The fingerprint to be used (Morgan, MACCS, and Pharmacophore).
    #----------------------------------------------------------------------------------------------
    compute_similarity(base_input_path='/datasets/ChEMBL/DrugBank/Fingerprints',
                       base_output_path='/datasets/ChEMBL/DrugBank',
                       metric=similarityFunctions.TanimotoSimilarity,
                       fingerprint=fingerprints.Morgan                  
    )

    #----------------------------------------------------------------------------------------------
    # COMPUTE THE RELATIONSHIP BETWEEN THE MOLECULES BASED ON THE SIMILARITY VALUES COMPUTED. THE GRAPH
    # REPRESENTATION IS USED TO IDENTIFY RELEVANT CHARACTERISTICS IN MOLECULES AND ANALOGS STRUCTURES.
    # @param base_input_path: The path to the folder containing the Similarity folder computed.
    # @param base_output_path: The path to the folder where the graph representations will be saved.
    # @param metric: The similarity metric to be considered in this step (Tanimoto, Dice, Cosine, etc).
    # @param fingerprint: The fingerprint to be considered in this step (Morgan, MACCS, and Pharmacophore).
    #----------------------------------------------------------------------------------------------
    analyze_graphs(base_input_path='/datasets/ChEMBL/DrugBank',
                    base_output_path='/resultados/grafos',
                    metric=similarityFunctions.TanimotoSimilarity,
                    fingerprint=fingerprints.Morgan
    )
    