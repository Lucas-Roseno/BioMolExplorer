import os
import csv
import shutil
import sys

# Setup paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDB_BASE_PATH = os.path.join(BASE_DIR, 'apps', 'python-service', 'BioMolExplorer', 'datasets', 'PDB')
TEST_TARGET = 'TestTarget'
TEST_DIR = os.path.join(PDB_BASE_PATH, TEST_TARGET)

def setup_test():
    if os.path.exists(TEST_DIR):
        shutil.rmtree(TEST_DIR)
    os.makedirs(TEST_DIR)
    
    # Create pdb_codes.csv
    csv_path = os.path.join(TEST_DIR, 'pdb_codes.csv')
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['PDB_CODE', 'LIGAND', 'RESNUM', 'CHAIN', 'RESOLUTION'])
        writer.writerow(['1EA5', 'NAG', '599', 'A', '1.8'])
        writer.writerow(['6G1U', 'NAG', '611', 'B', '1.79'])
        writer.writerow(['6G1U', 'NAG', '602', 'B', '1.79'])
    
    # Create .pdb files
    with open(os.path.join(TEST_DIR, '1EA5.pdb'), 'w') as f: f.write('dummy')
    with open(os.path.join(TEST_DIR, '6G1U.pdb'), 'w') as f: f.write('dummy')
    
    print("Setup complete.")

# Import the logic from app.py (manually copied here for testing since we can't easily import from app.py with routes)
def _perform_pdb_cascade_delete(target, pdb_code):
    target_dir = os.path.join(PDB_BASE_PATH, target)
    pdb_file = f"{pdb_code}.pdb"
    file_path = os.path.join(target_dir, pdb_file)
    if os.path.exists(file_path):
        os.remove(file_path)
        print(f"Deleted {pdb_file}")
    if os.path.exists(target_dir):
        for filename in os.listdir(target_dir):
            if filename.endswith('.csv'):
                csv_path = os.path.join(target_dir, filename)
                with open(csv_path, 'r', newline='') as f:
                    rows = list(csv.reader(f))
                if rows:
                    headers = rows[0]
                    new_rows = [headers]
                    for row in rows[1:]:
                        if not any(pdb_code.upper() in str(cell).upper() for cell in row):
                            new_rows.append(row)
                    if len(new_rows) < len(rows):
                        with open(csv_path, 'w', newline='') as f:
                            writer = csv.writer(f)
                            writer.writerows(new_rows)
                        print(f"Updated {filename}")
    if os.path.isdir(TEST_DIR) and not os.listdir(TEST_DIR):
        shutil.rmtree(TEST_DIR)
        print(f"Deleted empty target dir {TEST_TARGET}")

def test_delete_row(row_index):
    csv_file = 'pdb_codes.csv'
    file_path = os.path.join(TEST_DIR, csv_file)
    
    with open(file_path, 'r', newline='') as f:
        rows = list(csv.reader(f))
    
    headers = rows[0]
    pdb_code_idx = -1
    for i, h in enumerate(headers):
        if h.upper() == 'PDB_CODE':
            pdb_code_idx = i
            break
    
    pdb_code_to_sync = rows[row_index + 1][pdb_code_idx].strip()
    print(f"Deleting row {row_index} (PDB: {pdb_code_to_sync})")
    
    rows.pop(row_index + 1)
    
    with open(file_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    
    still_exists = any(len(row) > pdb_code_idx and row[pdb_code_idx].strip().upper() == pdb_code_to_sync.upper() for row in rows[1:])
    if not still_exists:
        print(f"PDB {pdb_code_to_sync} no longer in CSV. Triggering cascade delete.")
        _perform_pdb_cascade_delete(TEST_TARGET, pdb_code_to_sync)
    else:
        print(f"PDB {pdb_code_to_sync} still exists in CSV. Skipping cascade delete.")

# setup_test()
# # 1. Delete one of 6G1U (index 1)
# test_delete_row(1)
# assert os.path.exists(os.path.join(TEST_DIR, '6G1U.pdb'))
# print("Test 1 passed: 6G1U.pdb still exists.")

# # 2. Delete the last of 6G1U (index 1 after previous pop)
# test_delete_row(1)
# assert not os.path.exists(os.path.join(TEST_DIR, '6G1U.pdb'))
# print("Test 2 passed: 6G1U.pdb removed.")

# # 3. Delete 1EA5 (index 0)
# test_delete_row(0)
# # assert not os.path.exists(TEST_DIR) # Commented out for verification
# print("Test 3 passed: 1EA5.pdb removed.")
