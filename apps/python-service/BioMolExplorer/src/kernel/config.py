import os
from pathlib import Path

# This dynamically calculates the absolute path to the BioMolExplorer root directory.
# Since this file is located at apps/python-service/BioMolExplorer/src/kernel/config.py
# The parent path resolution is as follows:
#   parent 1: kernel
#   parent 2: src
#   parent 3: BioMolExplorer
BIOMOL_ROOT = str(Path(__file__).resolve().parent.parent.parent) + "/"
