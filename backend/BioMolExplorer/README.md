<img src="imgs/banner.png" alt="Banner" style="width:100%;"/>

<p> </p>
<p> </p>

<h1 align="justify">
A Flexible Information Retrieval Architecture for Exploring and Assembling Molecular Space Domains For Drug Discovery and Repositioning Based on Computer-Aided Drug Design Strategies.
</h1>

<p> </p>
<p> </p>

<div style="display: inline-block;" align="center">
<img align="center" height="15px" width="100px" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg"/> 
<img align="center" height="15px" width="80px" src="https://img.shields.io/badge/Python-14354C?style=for-the-badge&logo=python&logoColor=green"/> 
<img align="center" height="15px" width="100px" src="https://img.shields.io/badge/Made_for-VSCode-green.svg"/> 
<img align="center" height="15px" width="120px" src="https://img.shields.io/badge/contributions-welcome-green.svg?style=flat"/>
<img align="center" height="15px" width="80px" src="https://img.shields.io/badge/License-GPLv3-green.svg"/>
<img align="center" height="15px" width="120px" src="https://img.shields.io/badge/Virtual_Screening-yes-green.svg"/>
<img align="center" height="15px" width="150px" src="https://img.shields.io/badge/Structure_Based_Analysis-yes-green.svg"/>
</div>

<p> </p>
<p> </p>

<div align="justify">

Managing the overwhelming amount of data required for analyzing the relationships between compounds and therapeutic targets is a growing challenge in computer-aided drug design. Large drug banks containing vast and diverse metadata impose significant limitations on traditional exploit strategies. Consequently, designing comprehensive and robust research datasets becomes costly and time-consuming. In such a context, establishing suitable methods for each drug-investigative project is particularly challenging because it requires defining rules for assessing the quality of retrieved information and evaluating missing, overlapping, and inconsistent data, which adds complexity to the process. BioMolExplorer's capabilities in data management provide a much-needed relief from this burden.

BioMolExplorer is a powerful tool that efficiently addresses these challenges. It collects and standardizes data from well-known drug databases such as PDB, ChEMBL, and ZINC, ensuring solid datasets for exploration and research. Focusing on molecular entities based on predefined targets guarantees the retrieval of relevant information, making the research process more productive. This strategy retrieves bioactive molecules, structurally similar compounds (i.e., analogs), and enzyme complexes, all essential for drug discovery and repositioning methodologies. Diverse filtering methods further enhance the efficiency of the extracted information, aligning it with specific research requirements and the analyzed data domain.

</div>

#### Key Advantages:

> 1. **Comprehensive Data Retrieval**: Access to extensive drug banks of bioactive compounds and molecular structures is essential for robust drug discovery.
> 2. **Enhanced Target-Specific Insights**: Detailed analysis of molecular interactions aids in uncovering new drug candidates and understanding mechanisms of efficacy.
> 3. **Streamlined Data Processing**: Minimizes the need for labor-intensive preliminary data evaluations, enabling researchers to engage directly with high-quality, pertinent data.
> 4. **Support for Advanced Analytical Techniques**: The rich datasets support advanced analytical methods, enhancing drug discovery through predictive modeling and pattern recognition.
> 5. **Custom filters**: Enables information retrieval based on specific research constraints, facilitating the composition of data domain spaces that align with research objectives.

<p> </p>
<p> </p>

## Molecular Pre-Analysis and Modeling

<div align="justify">

This stage focuses on structuring drug relationship networks and clustering based on models of molecular signature affinity. Signatures generated for each molecule enable the evaluation of these networks. By identifying the maximum connected component within each network and quantifying molecular similarity, BioMolExplorer facilitates the clustering and assessment of compounds with similar signatures, aiding in identifying potential scaffolds (i.e., common molecular fragments) and compound overlap constraints when a multi-target investigation is required. This approach enhances the capacity for developing sophisticated discovery and repositioning strategies. Figure 1 shows the maximum connected component research process and common molecular fragment identification.

<div align="center">
<img src="imgs/Fig1.png" width="50%" height="50%">
</div>

<h6 align="justify">
Figure 1: An overview of the variance degrees representation of overlap in molecular structural features based on a network model. Node relevance (i.e., relevance of each molecule) is assessed about the therapeutic target and its most prominent clinical investigations recorded in the ChEMBL database. The in-degree rank plot depicts the relationship between nodes and their respective interaction counts within the graph. The degree histogram highlights the distribution of key nodes, while the complete graph analysis presents the overall degree distribution, emphasizing the significance of the most connected component.
</h6>

The most considerable connected component approach amplifies the potential for overlap in the identification process, mainly when applying multi-target strategies. This method enables the identification of chemical signatures based on the most common chemical characteristics—the group of compounds with the highest chemical similarity that share relevant structural and functional properties. 

Focusing on the most significant connected component allows for a more robust analysis of compounds most likely to interact with biological targets or exhibit similar pharmacological properties. At the same time, it reduces noise in the explored chemical space and minimizes computational complexity. 

</div>

#### Benefits:

> 1. **Enhanced Data Organization**: Molecular data is organized into coherent clusters, facilitating efficient analysis and interpretation.
> 2. **Identification of Key Molecular Interactions**: Analysis of bond coefficients helps identify crucial interactions for drug discovery and repositioning.
> 3. **Efficient Drug Candidate Selection**: Clustering by molecular signature affinity streamlines the prioritization of drug candidates for further validation.
> 4. **Support for Advanced Analytical Methods**: Structured data output enables the utilization of advanced analytical techniques, enhancing predictive capabilities.
> 5. **Scaffold Exploration**:   Analyzing each cluster's maximum common scaffold (i.e., centroid) introduces an added virtual screening level to understand compounds investigated in the data domain space.


# 🎯 How to BioMolExplorer on Linux Systems

BioMolExplorer is designed to execute on Linux machines. Thus, the installation process presented uses directives associated with that operation system. 

#### 1. Download and Install Dependencies

1. ***Anaconda***
    - Download the latest version of Anaconda from the [Anaconda website](https://www.anaconda.com/download).
    - Make the downloaded installer executable with:
      ```bash
      chmod +x <downloaded_file.sh>
      ```
    - Install Anaconda by running the installer script:
      ```bash
      ./<downloaded_file.sh>
      ```

2. ***Create the Environment for BioMolExplorer***
    - Copy the BioMolExplorer folder to your preferred location on your system.
    - Navigate to the directory containing the `requirements.yml` file and create the conda environment with:
      ```bash
      conda env create -f environment.yml
      ```

3. ***Alternative Method to Configure the Environment***
    - Copy the BioMolExplorer folder to your preferred location on your system.
    - Navigate to the directory containing the `install.sh` file and perform:
      ```bash
      chmod +x install.sh
      ./install.sh
      ```


#### 2. Running BioMolExplorer

1. ***Using Visual Studio Code (VSCode)***
    - Download and install Visual Studio Code from the Ubuntu Software Center or the [official website](https://code.visualstudio.com/).

2. ****Configure VSCode****
    - Open VSCode and install the Python plugin from the Extensions marketplace.
    - Set the Python interpreter to the one associated with your Anaconda environment by selecting it from the Command Palette (`Ctrl+Shift+P`) and searching for "Python: Select Interpreter."
    - Locate BioMolExplorer in the presented list and select it.

3. ***Execute BioMolExplorer Scripts***
    - Open the BioMolExplorer project folder in VSCode.
    - Run the Python scripts located in the workflow folder in the following sequence:
      1. `crawler`: This stage involves data extraction from the PDB, ChEMBL, and ZINC datasets.
      2. `preprocessing`: The data analysis stage consists of three phases: (a) generate fingerprints; (b) produce similarity references; and (c) analysis through complex networks.
      



## Authors

| [<img loading="lazy" src="imgs/michel.png" width=150><br><sub> Michel Pires da Silva</sub>](http://lattes.cnpq.br/1449902596670082) |  [<img loading="lazy" src="imgs/alisson.png" width=150><br><sub> Alisson Marques da Silva</sub>](http://lattes.cnpq.br/3856358583630209) |  [<img loading="lazy" src="imgs/alex.png" width=150><br><sub> Alex Gutterres Taranto</sub>](http://lattes.cnpq.br/4759006674013596) |
| :---: | :---: | :---: |
