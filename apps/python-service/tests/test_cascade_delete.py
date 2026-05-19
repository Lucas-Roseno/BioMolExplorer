import os
import csv
import json
import pytest
import shutil
from app import app, PDB_BASE_PATH, CHEMBL_BASE_PATH

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_pdb_cascade_delete(client):
    # Setup dummy data
    target = "TestTargetPDB"
    pdb_file = "TEST999.pdb"
    pdb_code = "TEST999"
    target_dir = os.path.join(PDB_BASE_PATH, target)
    os.makedirs(target_dir, exist_ok=True)
    
    # Create a dummy .pdb file
    pdb_path = os.path.join(target_dir, pdb_file)
    with open(pdb_path, 'w') as f:
        f.write("HEADER TEST")
    
    # Create a dummy .csv file with references
    csv_path = os.path.join(target_dir, "pdb_codes.csv")
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["pdb_code", "name"])
        writer.writerow(["TEST999", "Molecule 1"])
        writer.writerow(["KEEP111", "Molecule 2"])

    # Perform deletion
    response = client.post('/delete_pdb', json={
        'target': target,
        'pdb_file': pdb_file
    })
    
    assert response.status_code == 200
    assert not os.path.exists(pdb_path)
    
    # Check if reference was removed from CSV
    with open(csv_path, 'r') as f:
        content = f.read()
        assert "TEST999" not in content
        assert "KEEP111" in content

    # Cleanup
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)

def test_chembl_cascade_delete(client):
    # Setup dummy data
    target = "TestTargetChEMBL"
    molecule_id = "CHEMBL_TEST"
    molecule_csv = f"{molecule_id}.csv"
    
    mol_dir = os.path.join(CHEMBL_BASE_PATH, "molecules", target)
    bio_dir = os.path.join(CHEMBL_BASE_PATH, "bioactivity", target)
    os.makedirs(mol_dir, exist_ok=True)
    os.makedirs(bio_dir, exist_ok=True)
    
    # Create main molecule file
    mol_path = os.path.join(mol_dir, molecule_csv)
    with open(mol_path, 'w') as f:
        f.write("id,smile\nCHEMBL_TEST,C1=CC=CC=C1")
        
    # Create bioactivity file with references
    bio_path = os.path.join(bio_dir, "activity.csv")
    with open(bio_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["molecule_chembl_id", "value"])
        writer.writerow(["CHEMBL_TEST", "10.5"])
        writer.writerow(["CHEMBL_KEEP", "5.0"])

    # Perform deletion
    response = client.post('/delete_chembl', json={
        'sub_dir_name': 'molecules',
        'target': target,
        'csv_file': molecule_csv
    })
    
    assert response.status_code == 200
    assert not os.path.exists(mol_path)
    
    # Check if reference was removed from bioactivity
    with open(bio_path, 'r') as f:
        content = f.read()
        assert "CHEMBL_TEST" not in content
        assert "CHEMBL_KEEP" in content

    # Cleanup
    shutil.rmtree(os.path.join(CHEMBL_BASE_PATH, "molecules", target), ignore_errors=True)
    shutil.rmtree(os.path.join(CHEMBL_BASE_PATH, "bioactivity", target), ignore_errors=True)
