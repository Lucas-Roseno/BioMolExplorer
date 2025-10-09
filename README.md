# 0) Activate Conda
```
conda activate
```

# 1) Create the environment from the YAML file
```
conda env create -f .\backend\BioMolExplorer\requirements.yml
```

# 2) Activate the new environment
```
conda activate BioMolExplorer
```

# 3) Install Flask
```
conda install -c conda-forge flask
```

# 4) Run the application
```
cd .\backend\
python app.py
```