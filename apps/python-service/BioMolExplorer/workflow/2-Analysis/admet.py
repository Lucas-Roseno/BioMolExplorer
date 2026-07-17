#----------------------------------------------------------------------------------------------
import sys 
sys.path.append("src")
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from kernel.header_builder import HeaderBuilder

__doc__ = HeaderBuilder.build(

    module_title="ADMET analysis",

    module_description=(
    "Main functions for managing and integrating ADMET " 
    "analysis available in the src/caad directory"
),

    module_version="1.0.0"
)
#----------------------------------------------------------------------------------------------

#----------------------------------------------------------------------------------------------
from wrappers.admet import ADMETWrapper
#----------------------------------------------------------------------------------------------
    
if __name__ == "__main__":

    adme_pipeline = ADMETWrapper(base_input_path='/datasets/ChEMBL/DrugBank/',
                                 base_output_path='/datasets/ChEMBL/DrugBank/ADMET/',
                                 verbose=True)
    
    adme_pipeline.run_pipeline()
