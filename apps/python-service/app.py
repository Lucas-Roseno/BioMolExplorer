from flask import Flask, request, jsonify, send_file
import sys
import os
import shutil
import json
import io
import csv
import base64
import zipfile
import requests
import pandas as pd
from rdkit import Chem
from rdkit.Chem import AllChem, Draw
import uuid
import threading
import time
import logging
from pathlib import Path
import re

# Global dictionary to track active background tasks
active_tasks = {}
import ast

# Michel's files
BIOMOL_ROOT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'BioMolExplorer'))
sys.path.insert(0, os.path.join(BIOMOL_ROOT_PATH, 'src'))
from wrappers.crawlers import load_pdb, load_chembl, load_zinc
from crawlers.complex import PolymerEntityType, ExperimentalMethod
from wrappers.molecular_analyzer import compute_similarity, analyze_graphs, generate_fingerprints
from kernel.descriptors import similarityFunctions, fingerprints
from wrappers.redocking import perform_redocking
from wrappers.admet import ADMETWrapper
from wrappers.docking import perform_consensus, get_available_ligands, get_better_complex
from kernel.process_manager import ActiveSubprocesses, TaskCancelledException

# PATHs
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)
ActiveSubprocesses.register_signal_handlers()
BIOMOL_ROOT_PATH = os.path.abspath(os.path.join(BASE_DIR, 'BioMolExplorer'))
PDB_BASE_PATH = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'PDB')
CHEMBL_BASE_PATH = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ChEMBL')
JSON_CRAWLERS_PATH = os.path.join(BIOMOL_ROOT_PATH, 'src', 'scripts', 'crawlers')
ZINC_BASE_PATH = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ZINC')
DRUGBANK_PATH    = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ChEMBL', 'DrugBank')
ADMET_BASE_PATH  = os.path.join(DRUGBANK_PATH, 'ADMET')

# ==========================================
# FILESYSTEM BROWSER API
# ==========================================

@app.route('/api/filesystem/browse', methods=['GET'])
def browse_filesystem():
    """
    Returns a directory listing for the file picker modal.
    Allows browsing any directory on the local machine — the backend
    is running locally so there is no security boundary to enforce here.
    """
    # Open in project root directory by default, while allowing access anywhere on the PC
    project_root = os.path.abspath(os.path.join(BASE_DIR, '..', '..'))
    default_path = project_root
    requested_path = request.args.get('path', default_path)

    # Normalize the path to resolve symlinks and prevent redundant traversal
    try:
        resolved = os.path.realpath(os.path.abspath(requested_path))
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid path.'}), 400

    if not os.path.isdir(resolved):
        return jsonify({'status': 'error', 'message': 'Path is not a directory.'}), 400

    try:
        entries = []
        for name in sorted(os.listdir(resolved)):
            full = os.path.join(resolved, name)
            try:
                entry_type = 'dir' if os.path.isdir(full) else 'file'
            except PermissionError:
                entry_type = 'file'  # Treat unreadable entries as files
            entries.append({'name': name, 'type': entry_type})

        # Parent is None only when already at the filesystem root
        parent_path = os.path.dirname(resolved)
        if parent_path == resolved:  # We are at '/'
            parent_path = None

        return jsonify({
            'status': 'ok',
            'current_path': resolved,
            'parent_path': parent_path,
            'entries': entries,
        })
    except PermissionError:
        return jsonify({'status': 'error', 'message': 'Permission denied.'}), 403
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/filesystem/native-picker', methods=['GET'])
def native_folder_picker():
    """
    Opens the native OS file explorer dialog starting at the project root directory.
    """
    project_root = os.path.abspath(os.path.join(BASE_DIR, '..', '..'))
    initial_dir = request.args.get('initial_dir', project_root)
    if not os.path.isdir(initial_dir):
        initial_dir = project_root

    selected_path = ""
    # Try Tkinter first
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        selected_path = filedialog.askdirectory(
            initialdir=initial_dir,
            title="Select Folder - BioMolExplorer"
        )
        root.destroy()
    except Exception:
        # Fallback to zenity native Linux file selection dialog
        try:
            import subprocess
            res = subprocess.run(
                ['zenity', '--file-selection', '--directory', f'--filename={initial_dir}/', '--title=Select Folder - BioMolExplorer'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            if res.returncode == 0:
                selected_path = res.stdout.strip()
        except Exception as e2:
            return jsonify({'status': 'error', 'message': f'Could not open native OS picker: {str(e2)}'}), 500

    if selected_path:
        return jsonify({'status': 'ok', 'path': selected_path})
    else:
        return jsonify({'status': 'cancelled', 'path': ''})


@app.route('/api/filesystem/validate-folder', methods=['POST'])
def validate_folder_contents():
    """
    Validates if a selected folder contains files compatible with the BioMolExplorer pipeline.
    folder_type can be:
      - 'prepared_receptor': expects .pdbqt files (directly or inside a /Prepared subdirectory)
      - 'molecules': expects .csv or .sdf files
    """
    data = request.json or {}
    folder_path = data.get('path', '')
    folder_type = data.get('folder_type', 'prepared_receptor')

    if not folder_path:
        return jsonify({'valid': False, 'message': 'No folder path provided.'}), 400

    try:
        resolved = os.path.realpath(os.path.abspath(folder_path))
        if not os.path.isdir(resolved):
            return jsonify({'valid': False, 'message': f'Directory does not exist: {folder_path}'}), 400

        entries = os.listdir(resolved)
        if folder_type == 'prepared_receptor':
            pdbqt_files = [f for f in entries if f.endswith('.pdbqt')]
            prep_sub = os.path.join(resolved, 'Prepared')
            if os.path.isdir(prep_sub):
                pdbqt_files.extend([f"Prepared/{f}" for f in os.listdir(prep_sub) if f.endswith('.pdbqt')])
            
            pdb_files = [f for f in entries if f.endswith('.pdb')]

            if len(pdbqt_files) > 0:
                return jsonify({
                    'valid': True,
                    'message': f'Valid Prepared Receptor folder ({len(pdbqt_files)} .pdbqt files found).',
                    'file_count': len(pdbqt_files),
                    'files': pdbqt_files[:5]
                })
            elif len(pdb_files) > 0:
                return jsonify({
                    'valid': False,
                    'warning': True,
                    'message': f'Warning: Found {len(pdb_files)} .pdb files but 0 .pdbqt files. Pipeline requires prepared .pdbqt files when "Prepare Complex" is unchecked.',
                    'file_count': len(pdb_files),
                    'files': pdb_files[:5]
                })
            else:
                return jsonify({
                    'valid': False,
                    'message': 'Invalid folder: No prepared receptor files (.pdbqt) found in this directory.',
                    'file_count': 0,
                    'files': []
                })

        elif folder_type == 'molecules':
            csv_files = [f for f in entries if f.endswith('.csv') or f.endswith('.sdf')]
            if len(csv_files) > 0:
                return jsonify({
                    'valid': True,
                    'message': f'Valid Molecules folder ({len(csv_files)} CSV/SDF files found).',
                    'file_count': len(csv_files),
                    'files': csv_files[:5]
                })
            else:
                return jsonify({
                    'valid': False,
                    'message': 'Invalid folder: No molecule CSV/SDF files found in this directory.',
                    'file_count': 0,
                    'files': []
                })

        return jsonify({'valid': True, 'message': 'Directory exists.'})
    except Exception as e:
        return jsonify({'valid': False, 'message': f'Error validating directory: {str(e)}'}), 500


@app.route('/api/tasks/status/<task_id>', methods=['GET'])
def get_general_task_status(task_id):
    status = active_tasks.get(task_id, {'status': 'not_found', 'message': 'Task not found'})
    return jsonify(status)


@app.route('/load_pdb', methods=['POST'])
def run_load_pdb():
    data = request.json
    try:
        # Logic reverted to basics
        if 'PolymerEntityTypeID' in data and data['PolymerEntityTypeID']:
            data['PolymerEntityTypeID'] = [PolymerEntityType[item] for item in data['PolymerEntityTypeID'] if item]
        if 'ExperimentalMethodID' in data and data['ExperimentalMethodID']:
            data['ExperimentalMethodID'] = [ExperimentalMethod[item] for item in data['ExperimentalMethodID'] if item]
            if any("NMR" in method.value for method in data['ExperimentalMethodID']):
                data['max_resolution'] = None

        task_id = str(uuid.uuid4())
        active_tasks[task_id] = {
            'status': 'running',
            'message': f"Loading PDB data for {data.get('target')}...",
            'progress': {'phase': 'Downloading PDB structures...'}
        }

        def worker():
            try:
                warnings = load_pdb(
                    target=data.get('target'),
                    base_output_path='datasets',
                    pdb_ec=data.get('pdb_ec'),
                    PolymerEntityTypeID=data.get('PolymerEntityTypeID'),
                    ExperimentalMethodID=data.get('ExperimentalMethodID'),
                    max_resolution=data.get('max_resolution'),
                    must_have_ligand=data.get('must_have_ligand', True)
                )
                active_tasks[task_id] = {
                    'status': 'completed',
                    'message': f"PDB data for {data.get('target')} loaded successfully",
                    'warnings': warnings
                }
            except Exception as e:
                print(f"Error in load_pdb async worker: {e}")
                active_tasks[task_id] = {
                    'status': 'error',
                    'message': str(e)
                }

        threading.Thread(target=worker, daemon=True).start()

        return jsonify({
            'status': 'success',
            'task_id': task_id,
            'message': 'PDB download started in background'
        })

    except Exception as e:
        print(f"Error in load_pdb: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/pdb_files', methods=['GET'])
def get_pdb_list():
    pdb_data = {}
    if not os.path.exists(PDB_BASE_PATH):
        return jsonify({})

    for target_dir in os.listdir(PDB_BASE_PATH):
        target_path = os.path.join(PDB_BASE_PATH, target_dir)
        if os.path.isdir(target_path):
            pdb_files = [f for f in os.listdir(target_path) if f.endswith('.pdb')]
            if pdb_files:
                pdb_data[target_dir] = sorted(pdb_files)
    
    return jsonify(pdb_data)

@app.route('/pdb_csv/<target>/<csv_file>', methods=['GET'])
def get_pdb_csv(target, csv_file):
    if not target or not csv_file:
        return jsonify({'status': 'error', 'message': 'Target or CSV file not specified'}), 400
    if '..' in target or '..' in csv_file:
        return jsonify({'status': 'error', 'message': 'Invalid path'}), 400

    file_path = os.path.join(PDB_BASE_PATH, target, csv_file)
    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': 'CSV file not found'}), 404

    try:
        with open(file_path, 'r', newline='', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            rows = list(reader)
        if not rows:
            return jsonify({'status': 'success', 'headers': [], 'rows': []})

        headers = rows[0]
        data_rows = rows[1:]
        return jsonify({'status': 'success', 'headers': headers, 'rows': data_rows})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

def _perform_pdb_cascade_delete(target, pdb_code):
    """
    Helper to remove a .pdb file and its references from all CSVs in a target folder.
    """
    target_dir = os.path.join(PDB_BASE_PATH, target)
    pdb_file = f"{pdb_code}.pdb"
    file_path = os.path.join(target_dir, pdb_file)
    
    # 1. Remove the .pdb file if it exists
    print(f"DEBUG: Checking for PDB file: {file_path}", file=sys.stderr)
    if os.path.exists(file_path):
        try:
            print(f"DEBUG: Removing PDB file: {file_path}", file=sys.stderr)
            os.remove(file_path)
        except Exception as e:
            print(f"Error removing PDB file {file_path}: {str(e)}", file=sys.stderr)
    else:
        print(f"DEBUG: PDB file NOT FOUND: {file_path}", file=sys.stderr)
    
    # 2. Cascade delete: Remove all rows with this PDB code from ALL CSVs in the target folder
    if os.path.exists(target_dir):
        for filename in os.listdir(target_dir):
            if filename.endswith('.csv'):
                csv_path = os.path.join(target_dir, filename)
                try:
                    with open(csv_path, 'r', newline='', encoding='utf-8', errors='ignore') as f:
                        rows = list(csv.reader(f))
                    
                    if rows:
                        headers = rows[0]
                        # Filter out rows that contain the pdb_code in ANY column
                        # (Case-insensitive comparison for safety)
                        new_rows = [headers]
                        for row in rows[1:]:
                            if not any(pdb_code.upper() in str(cell).upper() for cell in row):
                                new_rows.append(row)
                        
                        # Only write back if rows were actually removed
                        if len(new_rows) < len(rows):
                            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                                writer = csv.writer(f)
                                writer.writerows(new_rows)
                except Exception as e:
                    print(f"Error updating CSV {filename} for {target}: {str(e)}", file=sys.stderr)
    
    # 3. Cleanup: If target folder is empty, remove it
    try:
        if os.path.isdir(target_dir) and not os.listdir(target_dir):
            shutil.rmtree(target_dir)
    except:
        pass

@app.route('/delete_pdb_csv_row', methods=['POST'])
def delete_pdb_csv_row():
    data = request.json
    target = data.get('target')
    csv_file = data.get('csv_file')
    row_index = data.get('row_index')

    if not target or not csv_file or row_index is None:
        return jsonify({'status': 'error', 'message': 'Target, CSV file, and row index are required'}), 400
    if not isinstance(row_index, int):
        try:
            row_index = int(row_index)
        except (ValueError, TypeError):
            return jsonify({'status': 'error', 'message': 'Row index must be an integer'}), 400
    if '..' in target or '..' in csv_file:
        return jsonify({'status': 'error', 'message': 'Invalid path'}), 400

    file_path = os.path.join(PDB_BASE_PATH, target, csv_file)
    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': 'CSV file not found'}), 404

    try:
        with open(file_path, 'r', newline='', encoding='utf-8', errors='ignore') as f:
            rows = list(csv.reader(f))

        if len(rows) <= 1 or row_index < 0 or row_index >= len(rows) - 1:
            return jsonify({'status': 'error', 'message': 'Row index out of range'}), 400

        # Identify PDB code to check for sync deletion
        headers = rows[0]
        pdb_code_idx = -1
        for i, h in enumerate(headers):
            if h.upper() == 'PDB_CODE':
                pdb_code_idx = i
                break
        
        pdb_code_to_sync = None
        if pdb_code_idx != -1:
            pdb_code_to_sync = rows[row_index + 1][pdb_code_idx].strip()

        # Remove the row
        rows.pop(row_index + 1)

        # Save the updated CSV
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerows(rows)

        # If it was the last row for this PDB code, trigger cascade delete of the .pdb file
        sync_message = ""
        if pdb_code_to_sync:
            # Check if any other row still has this PDB code
            still_exists = any(len(row) > pdb_code_idx and row[pdb_code_idx].strip().upper() == pdb_code_to_sync.upper() for row in rows[1:])
            print(f"DEBUG: PDB code {pdb_code_to_sync} still exists: {still_exists}", file=sys.stderr)
            if not still_exists:
                print(f"DEBUG: Triggering cascade delete for {pdb_code_to_sync}", file=sys.stderr)
                _perform_pdb_cascade_delete(target, pdb_code_to_sync)
                sync_message = f" and last representative sync-deleted {pdb_code_to_sync}.pdb"

        return jsonify({
            'status': 'success',
            'message': f'CSV row deleted successfully{sync_message}'
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/download_pdb_csv/<target>/<csv_file>', methods=['GET'])
def download_pdb_csv(target, csv_file):
    if not target or not csv_file:
        return jsonify({'status': 'error', 'message': 'Target or CSV file not specified'}), 400
    if '..' in target or '..' in csv_file:
        return jsonify({'status': 'error', 'message': 'Invalid path'}), 400

    file_path = os.path.join(PDB_BASE_PATH, target, csv_file)
    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': 'CSV file not found'}), 404

    try:
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/download_pdb_zip/<target>', methods=['GET'])
def download_pdb_zip(target):
    if not target: return jsonify({'status': 'error', 'message': 'Target not specified'}), 400
    if '..' in target: return jsonify({'status': 'error', 'message': 'Invalid target name'}), 400
    target_dir = os.path.join(PDB_BASE_PATH, target)
    if not os.path.isdir(target_dir): return jsonify({'status': 'error', 'message': 'Target directory not found'}), 404
    zip_buffer = io.BytesIO()
    try:
        files_added = 0
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for filename in os.listdir(target_dir):
                if filename.endswith('.pdb'):
                    zf.write(os.path.join(target_dir, filename), arcname=filename)
                    files_added += 1
        if files_added == 0: return jsonify({'status': 'error', 'message': 'No PDB files found'}), 404
        zip_buffer.seek(0)
        return send_file(zip_buffer, mimetype='application/zip', as_attachment=True, download_name=f'{target}_pdb.zip')
    except Exception as e: return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/download_pdb/<target>/<pdb_file>', methods=['GET'])
def download_pdb(target, pdb_file):
    """Sends the requested PDB file to the client for download."""
    if not target or not pdb_file:
        return jsonify({'status': 'error', 'message': 'Target or PDB file not specified'}), 400

    # Basic security check to prevent directory traversal
    if '..' in target or '..' in pdb_file:
        return jsonify({'status': 'error', 'message': 'Invalid file path'}), 400

    file_path = os.path.join(PDB_BASE_PATH, target, pdb_file)
    
    try:
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True)
        else:
            return jsonify({'status': 'error', 'message': 'File not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/delete_pdb', methods=['POST'])
def delete_pdb():
    data = request.json
    target = data.get('target')
    pdb_file = data.get('pdb_file')

    if not target or not pdb_file:
        return jsonify({'status': 'error', 'message': 'Target or PDB file not specified'}), 400

    file_path = os.path.join(PDB_BASE_PATH, target, pdb_file)
    target_dir = os.path.join(PDB_BASE_PATH, target)
    
    try:
        # Extract PDB code from filename (remove extension)
        pdb_code = os.path.splitext(pdb_file)[0].strip()

        _perform_pdb_cascade_delete(target, pdb_code)
        
        return jsonify({'status': 'success', 'message': f'{pdb_file} and all its references deleted successfully'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/delete_pdb_target', methods=['POST'])
def delete_pdb_target():
    data = request.json
    target = data.get('target')

    if not target:
        return jsonify({'status': 'error', 'message': 'Target not specified'}), 400

    # Basic security check
    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid target name'}), 400

    target_dir_path = os.path.join(PDB_BASE_PATH, target)
    
    try:
        if os.path.exists(target_dir_path) and os.path.isdir(target_dir_path):
            shutil.rmtree(target_dir_path) # Remove the entire folder and its contents
            
            # Also remove docking results if the PDB target is deleted
            docking_dir = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'docking', target)
            if os.path.isdir(docking_dir):
                shutil.rmtree(docking_dir)
                
            return jsonify({'status': 'success', 'message': f'Target {target} deleted successfully'})
        else:
            return jsonify({'status': 'error', 'message': 'Target directory not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ---CHEMBL functions ---
@app.route('/load_chembl', methods=['POST'])
def run_load_chembl():
    """Updates JSON files with user data and runs the ChEMBL crawler."""
    pass
    try:
        user_data = request.json
        
        # --- Robust Validation ---
        if not user_data:
            return jsonify({'status': 'error', 'message': 'No data provided in request.'}), 400

        target_data = user_data.get('target', {})
        bioactivity_data = user_data.get('bioactivity', {})
        similarmols_data = user_data.get('similarmols', {})
        molecules_data = user_data.get('molecules', {})

        # 1. Validate Target Name
        target_name = target_data.get('target_name')
        print(target_name)
        if not target_name or not isinstance(target_name, str) or len(target_name.strip()) == 0:
            print('erro aqui')
            return jsonify({'status': 'error', 'message': "Target name is required."}), 400
        
        target_name = target_name.strip() # Use stripped version

        # 2. Validate Bioactivity Standard Types
        standard_types = bioactivity_data.get('standard_type__in')
        if not standard_types or not isinstance(standard_types, list) or len(standard_types) == 0:
            return jsonify({'status': 'error', 'message': "At least one Standard Type is required."}), 400

        # 3. Validate Bioactivity Value
        max_value = bioactivity_data.get('standard_value__lte')
        if max_value is None: # Allow 0
            return jsonify({'status': 'error', 'message': "Max Value Reference (standard_value__lte) is required."}), 400
        try:
            float(max_value)
        except (ValueError, TypeError):
            return jsonify({'status': 'error', 'message': "Max Value Reference (standard_value__lte) must be a number."}), 400

        # 4. Validate Similarity
        similarity = similarmols_data.get('similarity')
        if similarity is None: # Allow 0
            return jsonify({'status': 'error', 'message': "Similarity percentage is required."}), 400
        try:
            float(similarity)
        except (ValueError, TypeError):
            return jsonify({'status': 'error', 'message': "Similarity must be a number."}), 400

        # 5. Validate Molecule Weight
        mw = similarmols_data.get('mw_freebase__lte')
        if mw is None: # Allow 0
            return jsonify({'status': 'error', 'message': "Max Molecule Weight (mw_freebase__lte) is required."}), 400
        try:
            float(mw)
        except (ValueError, TypeError):
            return jsonify({'status': 'error', 'message': "Max Molecule Weight must be a number."}), 400
        # --- End Validation ---

        # Temporary change of the correct directory so that the code work
        pass
        pass
        
        def update_json_file(file_path, new_data):
            # Check if file exists, if not, create it
            if not os.path.exists(file_path):
                with open(file_path, 'w') as f:
                    json.dump({}, f, indent=4)
                    
            with open(file_path, 'r') as f:
                json_data = json.load(f)
            json_data.update(new_data)
            with open(file_path, 'w') as f:
                json.dump(json_data, f, indent=4)
                
        update_json_file(os.path.join(JSON_CRAWLERS_PATH, 'target.json'), target_data)
        update_json_file(os.path.join(JSON_CRAWLERS_PATH, 'bioactivity.json'), bioactivity_data)
        update_json_file(os.path.join(JSON_CRAWLERS_PATH, 'molecules.json'), molecules_data)
        update_json_file(os.path.join(JSON_CRAWLERS_PATH, 'similarmols.json'), similarmols_data)

        task_id = str(uuid.uuid4())
        active_tasks[task_id] = {
            'status': 'running',
            'message': f"Loading ChEMBL data for '{target_name}'...",
            'progress': {'phase': 'Scraping ChEMBL & processing molecules...'}
        }

        def worker():
            try:
                load_chembl(
                    target_name=target_name,
                    base_output_path='datasets'
                )
                active_tasks[task_id] = {
                    'status': 'completed',
                    'message': f"ChEMBL data for '{target_name}' loaded successfully!"
                }
            except Exception as e:
                print(f"Error in load_chembl async worker: {e}")
                active_tasks[task_id] = {
                    'status': 'error',
                    'message': str(e)
                }

        threading.Thread(target=worker, daemon=True).start()

        return jsonify({
            'status': 'success',
            'task_id': task_id,
            'message': f"ChEMBL download for '{target_name}' started in background"
        })

    except Exception as e:
        print(e)
        return jsonify({'status': 'error', 'message': str(e)}), 400
    finally:
    # Come back to the original directory
        pass
        

@app.route('/chembl_files', methods=['GET'])
def get_chembl_list():
    """Lists downloaded ChEMBL files (molecules and similars) grouped by target."""
    chembl_data = {}
    if not os.path.exists(CHEMBL_BASE_PATH):
        return jsonify(chembl_data)

    sub_dirs = ["molecules", "similars"]
    all_targets = set()

    # First, find all unique target directories across all sub-directories
    for sub_dir in sub_dirs:
        sub_dir_path = os.path.join(CHEMBL_BASE_PATH, sub_dir)
        if os.path.isdir(sub_dir_path):
            for target_name in os.listdir(sub_dir_path):
                if os.path.isdir(os.path.join(sub_dir_path, target_name)):
                    all_targets.add(target_name)

    # Now, build the nested dictionary
    for target in sorted(list(all_targets)):
        chembl_data[target] = {"molecules": [], "similars": []}
        
        for sub_dir in sub_dirs:
            target_path = os.path.join(CHEMBL_BASE_PATH, sub_dir, target)
            if os.path.isdir(target_path):
                csv_files = sorted([f for f in os.listdir(target_path) if f.endswith('.csv')])
                if csv_files:
                    chembl_data[target][sub_dir] = csv_files
    
    return jsonify(chembl_data)


@app.route('/download_chembl/<sub_dir_name>/<target>/<csv_file>', methods=['GET'])
def download_chembl(sub_dir_name, target, csv_file):
    """Sends the requested ChEMBL CSV file to the client for download."""
    if not all([sub_dir_name, target, csv_file]):
        return jsonify({'status': 'error', 'message': 'Path components not specified'}), 400

    if '..' in sub_dir_name or '..' in target or '..' in csv_file:
        return jsonify({'status': 'error', 'message': 'Invalid file path'}), 400
    
    if sub_dir_name not in ['molecules', 'similars']:
            return jsonify({'status': 'error', 'message': 'Invalid directory'}), 400

    file_path = os.path.join(CHEMBL_BASE_PATH, sub_dir_name, target, csv_file)
    
    try:
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True)
        else:
            return jsonify({'status': 'error', 'message': 'File not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/download_chembl_zip/<target>', methods=['GET'])
def download_chembl_zip(target):
    """Compress all ChEMBL CSVs for a given target (molecules + similars) into a ZIP."""
    if not target:
        return jsonify({'status': 'error', 'message': 'Target not specified'}), 400

    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid target name'}), 400

    sub_dirs = ['molecules', 'similars']
    zip_buffer = io.BytesIO()

    try:
        files_added = 0
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for sub_dir in sub_dirs:
                target_dir = os.path.join(CHEMBL_BASE_PATH, sub_dir, target)
                if os.path.isdir(target_dir):
                    for filename in os.listdir(target_dir):
                        if filename.endswith('.csv'):
                            file_path = os.path.join(target_dir, filename)
                            arcname = f'{sub_dir}/{filename}'
                            zf.write(file_path, arcname=arcname)
                            files_added += 1

        if files_added == 0:
            return jsonify({'status': 'error', 'message': 'No CSV files found for this target'}), 404

        zip_buffer.seek(0)
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'{target}_chembl.zip'
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/download_chembl_category_zip/<sub_dir_name>/<target>', methods=['GET'])
def download_chembl_category_zip(sub_dir_name, target):
    """
    Compresses all CSVs of ONE category (molecules OR similar)
    to a specific target and sent as a ZIP file.
    """
    if not sub_dir_name or not target:
        return jsonify({'status': 'error', 'message': 'Category or target not specified'}), 400

    if '..' in sub_dir_name or '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid path'}), 400

    if sub_dir_name not in ['molecules', 'similars']:
        return jsonify({'status': 'error', 'message': 'Invalid category'}), 400

    target_dir = os.path.join(CHEMBL_BASE_PATH, sub_dir_name, target)

    if not os.path.isdir(target_dir):
        return jsonify({'status': 'error', 'message': 'Category folder not found for this target'}), 404

    zip_buffer = io.BytesIO()

    try:
        files_added = 0
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for filename in os.listdir(target_dir):
                if filename.endswith('.csv'):
                    file_path = os.path.join(target_dir, filename)
                    zf.write(file_path, arcname=filename)
                    files_added += 1

        if files_added == 0:
            return jsonify({'status': 'error', 'message': 'No CSV files found in this category'}), 404

        zip_buffer.seek(0)
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'{target}_{sub_dir_name}.zip'
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/delete_chembl_category', methods=['POST'])
def delete_chembl_category():
    """
    Delete all CSVs of ONE category (molecules OR similar)
    for a specific target.
    """
    data = request.json or {}
    sub_dir_name = data.get('sub_dir_name')
    target = data.get('target')

    if not sub_dir_name or not target:
        return jsonify({'status': 'error', 'message': 'Category or target not specified'}), 400

    if '..' in sub_dir_name or '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid path'}), 400

    if sub_dir_name not in ['molecules', 'similars']:
        return jsonify({'status': 'error', 'message': 'Invalid category'}), 400

    target_dir = os.path.join(CHEMBL_BASE_PATH, sub_dir_name, target)

    try:
        if os.path.isdir(target_dir):
            shutil.rmtree(target_dir)
            return jsonify({
                'status': 'success',
                'message': f'All "{sub_dir_name}" data for "{target}" deleted successfully'
            })
        else:
            return jsonify({'status': 'error', 'message': 'Category folder not found for this target'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/delete_chembl_target', methods=['POST'])
def delete_chembl_target():
    data = request.json or {}
    target = data.get('target')
    if not target: return jsonify({'status': 'error', 'message': 'Target not specified'}), 400
    if '..' in target: return jsonify({'status': 'error', 'message': 'Invalid target name'}), 400
    try:
        deleted_something = False
        # 1. Delete main ChEMBL folders
        for sub_dir_name in ['molecules', 'similars', 'bioactivity']:
            target_dir = os.path.join(CHEMBL_BASE_PATH, sub_dir_name, target)
            if os.path.isdir(target_dir):
                shutil.rmtree(target_dir)
                deleted_something = True
                
        # 2. Delete DrugBank consolidated files
        for suffix in ['_MOLS.csv', '_SIMS.csv', '_FULL.csv']:
            drugbank_file = os.path.join(DRUGBANK_PATH, f"{target}{suffix}")
            if os.path.exists(drugbank_file):
                os.remove(drugbank_file)
                deleted_something = True
                
        # 3. Delete ADMET results
        if os.path.isdir(ADMET_BASE_PATH):
            for fname in os.listdir(ADMET_BASE_PATH):
                if fname.startswith(f"{target}_") or fname == target:
                    fpath = os.path.join(ADMET_BASE_PATH, fname)
                    if os.path.isdir(fpath):
                        shutil.rmtree(fpath)
                    else:
                        os.remove(fpath)
                    deleted_something = True
                    
        # 4. Delete Graph Cache
        maxcomp_dir = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'grafos', 'data', 'maxcomp')
        if os.path.isdir(maxcomp_dir):
            for fname in os.listdir(maxcomp_dir):
                if fname.startswith(f"Tanimoto_morgan_{target}_"):
                    os.remove(os.path.join(maxcomp_dir, fname))
                    deleted_something = True
                    
        # 5. Delete Docking results
        docking_dir = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'docking', target)
        if os.path.isdir(docking_dir):
            shutil.rmtree(docking_dir)
            deleted_something = True

        if deleted_something:
            return jsonify({'status': 'success', 'message': f'Target "{target}" deleted successfully'})
        else:
            return jsonify({'status': 'error', 'message': 'Target folder not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/delete_chembl', methods=['POST'])
def delete_chembl():
    """Deletes a specific ChEMBL CSV file and all its references in other CSVs."""
    data = request.json
    sub_dir_name = data.get('sub_dir_name')
    target = data.get('target')
    csv_file = data.get('csv_file')

    if not all([sub_dir_name, target, csv_file]):
        return jsonify({'status': 'error', 'message': 'Path components not specified'}), 400
    
    if sub_dir_name not in ['molecules', 'similars']:
            return jsonify({'status': 'error', 'message': 'Invalid directory'}), 400

    file_path = os.path.join(CHEMBL_BASE_PATH, sub_dir_name, target, csv_file)
    
    try:
        # Identify the molecule ID (e.g., CHEMBL123) from the filename
        molecule_id = os.path.splitext(csv_file)[0].strip()

        if os.path.exists(file_path):
            # 1. Remove the specific .csv file
            os.remove(file_path)
            
            # 2. Cascade delete: Search and remove the ID from all CSVs in ChEMBL related folders for this target
            search_dirs = [
                os.path.join(CHEMBL_BASE_PATH, 'molecules', target),
                os.path.join(CHEMBL_BASE_PATH, 'similars', target),
                os.path.join(CHEMBL_BASE_PATH, 'bioactivity', target),
                DRUGBANK_PATH,
                ADMET_BASE_PATH,
                os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'docking', target)
            ]
            
            for directory in search_dirs:
                if os.path.exists(directory) and os.path.isdir(directory):
                    for filename in os.listdir(directory):
                        # Optimize for DrugBank and ADMET: only check files related to the target
                        if directory in [DRUGBANK_PATH, ADMET_BASE_PATH] and not filename.startswith(f"{target}_"):
                            continue
                            
                        if filename.endswith('.csv'):
                            csv_path = os.path.join(directory, filename)
                            try:
                                with open(csv_path, 'r', newline='', encoding='utf-8', errors='ignore') as f:
                                    rows = list(csv.reader(f))
                                
                                if rows:
                                    headers = rows[0]
                                    # Remove any row that contains the molecule_id in any cell
                                    new_rows = [headers]
                                    for row in rows[1:]:
                                        if not any(molecule_id.upper() in str(cell).upper() for cell in row):
                                            new_rows.append(row)
                                    
                                    if len(new_rows) < len(rows):
                                        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                                            writer = csv.writer(f)
                                            writer.writerows(new_rows)
                            except Exception as e:
                                print(f"Error updating ChEMBL CSV {filename}: {str(e)}", file=sys.stderr)

            # Cleanup empty folders
            target_path = os.path.join(CHEMBL_BASE_PATH, sub_dir_name, target)
            if os.path.exists(target_path) and not os.listdir(target_path):
                 os.rmdir(target_path) 
                 
            # 3. Delete Graph Cache to force re-generation without the deleted molecule
            maxcomp_dir = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'grafos', 'data', 'maxcomp')
            if os.path.isdir(maxcomp_dir):
                for fname in os.listdir(maxcomp_dir):
                    if fname.startswith(f"Tanimoto_morgan_{target}_"):
                        try:
                            os.remove(os.path.join(maxcomp_dir, fname))
                        except Exception:
                            pass
            
            return jsonify({'status': 'success', 'message': f'{csv_file} and all its references deleted successfully'})
        else:
            return jsonify({'status': 'error', 'message': 'File not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    

# --- ZINC Functions ---

@app.route('/load_zinc', methods=['POST'])
def run_load_zinc():
    """
    Handles the upload of the .uri file and execution of the ZINC crawler.
    """
    try:
        # 1. Check if file is present
        if 'zinc_file' not in request.files:
            return jsonify({'status': 'error', 'message': 'No file part'}), 400
        
        file = request.files['zinc_file']
        
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'No selected file'}), 400

        if not file.filename.endswith('.uri'):
             return jsonify({'status': 'error', 'message': 'File must be a .uri file'}), 400

        # 2. Determine Parameters based on Filename
        filename_original = file.filename
        # Verifica se contém os termos (case-sensitive, conforme seu código original)
        has_2d = '2D' in filename_original
        has_3d = '3D' in filename_original
        
        if not has_2d and not has_3d:
            return jsonify({'status': 'error', 'message': 'Invalid Model: Filename must contain "2D" or "3D"'}), 400

        # 3. Get Verbose Parameter
        verbose_flag = request.form.get('verbose') == 'on'

        # 4. Save the uploaded file AND set the flags strictly based on what we actully save
        if not os.path.exists(ZINC_BASE_PATH):
            os.makedirs(ZINC_BASE_PATH)
            
        # CORREÇÃO: Determinar qual arquivo será salvo e ajustar as flags para load_zinc
        # Se tiver "2D", priorizamos salvar como zinc_2d.uri e processar APENAS 2D.
        # Caso contrário (tem "3D" e não "2D"), salvamos como zinc_3d.uri e processamos APENAS 3D.
        
        if has_2d:
            target_filename = "zinc_2d.uri"
            run_2d = True
            run_3d = False
        else:
            target_filename = "zinc_3d.uri"
            run_2d = False
            run_3d = True
        
        file_path = os.path.join(ZINC_BASE_PATH, target_filename)
        
        # Remove arquivo antigo se existir para evitar conflitos
        if os.path.exists(file_path):
            os.remove(file_path)
            
        file.save(file_path)

        # 5. Run the Crawler Wrapper
        pass
        pass
        pass

        try:
            load_zinc(
                base_output_path='datasets/ZINC',
                filename=target_filename,
                verbose=verbose_flag
            )
        finally:
            pass

        return jsonify({'status': 'success', 'message': f'ZINC processing for {filename_original} completed.'})

    except requests.exceptions.ConnectionError:
        return jsonify({'status': 'error', 'message': 'The ZINC server (files.docking.org) is unavailable. Please try again later.'}), 503
    except Exception as e:
        print(f"ZINC Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
    

@app.route('/zinc_files', methods=['GET'])
def get_zinc_list():
    """Lists files in the ZINC dataset directory. Deprecated or used as fallback."""
    files = []
    if os.path.exists(ZINC_BASE_PATH):
        for f in sorted(os.listdir(ZINC_BASE_PATH)):
            if not f.startswith('.'): 
                files.append(f)
    return jsonify(files)

@app.route('/get_zinc_content', methods=['GET'])
def get_zinc_content():
    """
    Returns the content of the generated ZINC CSV files (ZINC2D.csv, ZINC3D.csv)
    to be displayed in a table.
    """
    data = []
    if os.path.exists(ZINC_BASE_PATH):
        for f in sorted(os.listdir(ZINC_BASE_PATH)):
            if f.endswith('.csv'): # Process only CSVs
                file_path = os.path.join(ZINC_BASE_PATH, f)
                try:
                    df = pd.read_csv(file_path)
                    # Check if required columns exist
                    if not df.empty and 'smile' in df.columns and 'zinc_id' in df.columns:
                        # Convert to list of dicts. You can limit rows here if needed (e.g., .head(100))
                        records = df[['zinc_id', 'smile']].fillna('').to_dict(orient='records')
                        data.append({'filename': f, 'content': records})
                except Exception as e:
                    print(f"Error reading {f}: {e}")
    return jsonify(data)

@app.route('/download_zinc_zip/<target>', methods=['GET'])
def download_zinc_zip(target):
    zip_buffer = io.BytesIO()
    try:
        files_added = 0
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            if os.path.exists(ZINC_BASE_PATH):
                for filename in os.listdir(ZINC_BASE_PATH):
                    if filename.endswith('.csv') or filename.endswith('.uri'):
                        zf.write(os.path.join(ZINC_BASE_PATH, filename), arcname=filename)
                        files_added += 1
        if files_added == 0: return jsonify({'status': 'error', 'message': 'No ZINC files found'}), 404
        zip_buffer.seek(0)
        return send_file(zip_buffer, mimetype='application/zip', as_attachment=True, download_name='ZINC_data.zip')
    except Exception as e: return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/download_zinc/<filename>', methods=['GET'])
def download_zinc_file(filename):
    """Downloads a specific file from the ZINC datasets folder."""
    if not filename:
         return jsonify({'status': 'error', 'message': 'Filename not specified'}), 400
    
    # Basic security to ensure we stay in ZINC folder
    if '..' in filename or '/' in filename:
         return jsonify({'status': 'error', 'message': 'Invalid filename'}), 400
         
    file_path = os.path.join(ZINC_BASE_PATH, filename)
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True)
    return jsonify({'status': 'error', 'message': 'File not found'}), 404

@app.route('/delete_zinc', methods=['POST'])
def delete_zinc():
    data = request.json
    filename = data.get('filename')

    if not filename:
        return jsonify({'status': 'error', 'message': 'Filename not specified'}), 400

    file_path = os.path.join(ZINC_BASE_PATH, filename)
    
    try:
        if os.path.exists(file_path):
            if os.path.isdir(file_path):
                shutil.rmtree(file_path)
            else:
                os.remove(file_path)
            return jsonify({'status': 'success', 'message': f'{filename} deleted successfully'})
        else:
            return jsonify({'status': 'error', 'message': 'File not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# -----2D and 3D visualization----
@app.route('/get_molecule_data/<sub_dir_name>/<target>/<csv_file>', methods=['GET'])
def get_molecule_data(sub_dir_name, target, csv_file):
    """
    Finds the SMILES from a molecule CSV file, generates the 2D image
    and a 3D conformation (MolBlock) for visualization.

    This function attempts to find the SMILES in three ways:
    1. 'canonical_smiles' column
    2. 'smiles' column
    3. 'canonical_smiles' key within the 'molecule_structures' column
    """
    if not all([sub_dir_name, target, csv_file]):
        return jsonify({'status': 'error', 'message': 'Path components not specified'}), 400
    if '..' in sub_dir_name or '..' in target or '..' in csv_file:
        return jsonify({'status': 'error', 'message': 'Invalid file path'}), 400
    if sub_dir_name not in ['molecules', 'similars']:
            return jsonify({'status': 'error', 'message': 'Invalid directory'}), 400

    file_path = os.path.join(CHEMBL_BASE_PATH, sub_dir_name, target, csv_file)

    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': 'File not found'}), 404

    try:
        # 1. Read the CSV file
        df = pd.read_csv(file_path)
        smiles = None

        # --- MODIFICATION START: Robust SMILES finding ---

        # Method 1: Check for a top-level 'canonical_smiles' column
        if 'canonical_smiles' in df.columns:
            smiles = df['canonical_smiles'].iloc[0]

        # Method 2: Check for a top-level 'smiles' column
        elif 'smiles' in df.columns:
            smiles = df['smiles'].iloc[0]

        # Method 3: Check inside the 'molecule_structures' column
        elif 'molecule_structures' in df.columns:
            structures_str = df['molecule_structures'].iloc[0]

            # Check if it's a non-empty string
            if structures_str and isinstance(structures_str, str):
                # Safely evaluate the string representation of the dictionary
                # It looks like: "{'canonical_smiles': '...', 'molfile': '...'}"
                structures_dict = ast.literal_eval(structures_str)

                if 'canonical_smiles' in structures_dict:
                    smiles = structures_dict['canonical_smiles']

        # If SMILES is still not found after all methods, raise a clear error
        if smiles is None:
            raise ValueError(f"Could not find SMILES in file {csv_file}. Checked 'canonical_smiles', 'smiles', and 'molecule_structures' columns.")

        # Check if the found SMILES is empty or NaN
        if not smiles or pd.isna(smiles):
            raise ValueError(f"SMILES string is empty or missing in file {csv_file}")

        # --- MODIFICATION END ---

        mol = Chem.MolFromSmiles(smiles)
        if not mol:
            # Provide the problematic SMILES in the error
            raise ValueError(f"Invalid SMILES string in file: {smiles}")

        # 2. Generate 2D Image (Base64)
        img = Draw.MolToImage(mol, size=(400, 300))
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_base64 = base64.b64encode(img_bytes.getvalue()).decode('utf-8')

        # 3. Generate 3D Structure (MolBlock)
        mol_3d = Chem.MolFromSmiles(smiles) # Reload for 3D
        mol_3d = Chem.AddHs(mol_3d)
        AllChem.EmbedMolecule(mol_3d, AllChem.ETKDG())
        AllChem.MMFFOptimizeMolecule(mol_3d)
        mol_block = Chem.MolToMolBlock(mol_3d)

        return jsonify({
            'status': 'success',
            'name': csv_file.replace('.csv', ''),
            'smiles': smiles,
            'image_base64': img_base64,
            'mol_block': mol_block
        })

    except Exception as e:
        # Send the specific error message to the frontend
        return jsonify({'status': 'error', 'message': str(e)}), 500   
    
@app.route('/get_pdb_content/<target>/<pdb_file>', methods=['GET'])
def get_pdb_content(target, pdb_file):
    """Sends the content of a PDB file as plain text."""
    if not target or not pdb_file:
        return jsonify({'status': 'error', 'message': 'Target or PDB file not specified'}), 400
    if '..' in target or '..' in pdb_file:
        return jsonify({'status': 'error', 'message': 'Invalid file path'}), 400

    file_path = os.path.join(PDB_BASE_PATH, target, pdb_file)
    
    try:
        if os.path.exists(file_path):
            # Sends the file as text, not as an attachment
            return send_file(file_path, mimetype='text/plain')
        else:
            return jsonify({'status': 'error', 'message': 'File not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/get_target_pdb/<target_name>', methods=['GET'])
def get_target_pdb(target_name):
    """
    Finds the first available PDB file for a given target
    and sends its content as text.
    """
    if not target_name:
        return jsonify({'status': 'error', 'message': 'Target name not specified'}), 400
    if '..' in target_name:
        return jsonify({'status': 'error', 'message': 'Invalid target name'}), 400

    # Use PDB_BASE_PATH which should be '.../datasets/PDB'
    target_dir = os.path.join(PDB_BASE_PATH, target_name)
    
    if not os.path.isdir(target_dir):
        return jsonify({'status': 'error', 'message': f"PDB directory for target '{target_name}' not found"}), 404

    try:
        # Find the first .pdb file in the directory
        pdb_file = None
        # Sort the directory content to ensure a consistent file is chosen first
        for f in sorted(os.listdir(target_dir)): 
            if f.endswith('.pdb'):
                pdb_file = f
                break  # Found one, stop looking

        if pdb_file is None:
            return jsonify({'status': 'error', 'message': f"No .pdb files found in directory for '{target_name}'"}), 404
        
        # We found a file, now send its content
        file_path = os.path.join(target_dir, pdb_file)
        return send_file(file_path, mimetype='text/plain')

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ==========================================
# SIMILARITY ANALYSIS ROUTES
# ==========================================

@app.route('/api/analysis/process-graphs', methods=['POST'])
def process_graphs():
    """
    Manually runs the similarity pipeline for the graphs.
    """
    pass
    try:
        pass
        pass

        rel_db_path = '/datasets/ChEMBL/DrugBank'
        full_db_path = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ChEMBL', 'DrugBank')
        
        if not os.path.exists(full_db_path):
             return jsonify({'success': False, 'message': f'Datasets path {full_db_path} not found.'}), 404

        generate_fingerprints(base_input_path=rel_db_path, morgan=True, maccs=True, pharmacophore=True)
        compute_similarity(base_input_path=rel_db_path + '/Fingerprints',
                           base_output_path=rel_db_path,
                           metric=similarityFunctions.TanimotoSimilarity,
                            fingerprint=fingerprints.Morgan)
        analyze_graphs(base_input_path=rel_db_path,
                        base_output_path='/resultados/grafos',
                        metric=similarityFunctions.TanimotoSimilarity,
                        fingerprint=fingerprints.Morgan)
                        
        return jsonify({'success': True, 'message': 'Processing completed successfully.'})
    except Exception as e:
        app.logger.error(f"Error processing graphs: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        pass

@app.route('/api/analysis/graph-data', methods=['GET'])
def get_graph_data():
    """
    Runs the analysis pipeline (to ensure fresh data)
    and returns the graph data (nodes and edges).
    """
    pass
    try:
        target = request.args.get('target', 'Acetylcholinesterase')
        
        # --- 0. Run Analysis Pipeline (as requested by user) ---
        pass
        pass

        # Defining paths relative to CWD
        rel_db_path = '/datasets/ChEMBL/DrugBank'
        
        # Optimization: if datasets do not exist, skip processing
        full_db_path = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ChEMBL', 'DrugBank')
        if not os.path.exists(full_db_path):
             return jsonify({'success': False, 'message': f'Datasets path {full_db_path} not found.'}), 404

        # Executing original workflow functions (21-dataAnalysis.py)

        dataset_type = request.args.get('datasetType', 'MOLS')
        if dataset_type not in ['MOLS', 'SIMS']:
            dataset_type = 'MOLS'

        # --- 1. Load Processed Data & Check if Outdated ---
        outdated = False
        target_normalized = target.replace(" ", "").lower()
        
        # Check source files (MOLS and SIMS)
        source_mols = None
        source_sims = None
        if os.path.exists(full_db_path):
            for f in os.listdir(full_db_path):
                if f.endswith('_MOLS.csv') and f.replace('_MOLS.csv', '').replace(' ', '').lower() == target_normalized:
                    source_mols = os.path.join(full_db_path, f)
                elif f.endswith('_SIMS.csv') and f.replace('_SIMS.csv', '').replace(' ', '').lower() == target_normalized:
                    source_sims = os.path.join(full_db_path, f)

        maxcomp_dir = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'grafos', 'data', 'maxcomp')
        csv_file = None
        correct_alvo = target # fallback
        
        if os.path.exists(maxcomp_dir):
            for filename in os.listdir(maxcomp_dir):
                if filename.startswith('Tanimoto_morgan_') and filename.endswith(f'_{dataset_type}.csv'):
                    alvo = filename.replace('Tanimoto_morgan_', '').replace(f'_{dataset_type}.csv', '')
                    if alvo.replace(" ", "").lower() == target_normalized:
                        csv_file = os.path.join(maxcomp_dir, filename)
                        correct_alvo = alvo
                        break
                        
        if not csv_file or not os.path.exists(csv_file):
            outdated = True
        else:
            # Check modification times
            generated_mtime = os.path.getmtime(csv_file)
            source_file = source_mols if dataset_type == 'MOLS' else source_sims
            if source_file and os.path.exists(source_file):
                if os.path.getmtime(source_file) > generated_mtime:
                    outdated = True
                    
        if outdated:
            return jsonify({'success': False, 'needs_processing': True, 'message': f'Graph data needs to be calculated for {target}.'}), 404

            
        # Read edges (source, target, value)
        edges_df = pd.read_csv(csv_file)
        
        # Read molecule data (to map ID -> SMILES) flexibly
        mols_file = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ChEMBL', 'DrugBank', f'{correct_alvo}_{dataset_type}.csv')
        
        smiles_map = {}
        if os.path.exists(mols_file):
            mols_df = pd.read_csv(mols_file)
            for _, row in mols_df.iterrows():
                if 'molecule_chembl_id' in row and 'canonical_smiles' in row:
                    smiles_map[row['molecule_chembl_id']] = row['canonical_smiles']
                
        # Constrói o JSON para o react-force-graph
        nodes_set = set()
        links = []
        
        # The value column might not be present in maxcomp, but it would be in raw similarity.
        # If there is no 'value', we will use a default weight.
        has_value = 'value' in edges_df.columns
        
        for _, row in edges_df.iterrows():
            source = str(row['source'])
            edge_target = str(row['target'])
            value = float(row['value']) if has_value else 1.0
            
            nodes_set.add(source)
            nodes_set.add(edge_target)
            
            links.append({
                'source': source,
                'target': edge_target,
                'value': value
            })
            
        nodes = []
        for node_id in nodes_set:
            nodes.append({
                'id': node_id,
                'name': node_id,
                'smiles': smiles_map.get(node_id, '')
            })
            
        # --- Calculate Full Graph Degree Distribution ---
        full_graph_degrees = []
        try:
            # Reconstruct the full graph filename matching the maxcomp one
            # It should be found in datasets/ChEMBL/DrugBank/Similarity/
            if csv_file:
                # The actual filename was picked up in the loop (e.g., Tanimoto_morgan_...csv)
                filename = os.path.basename(csv_file)
                full_graph_file = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ChEMBL', 'DrugBank', 'Similarity', filename)
                
                if os.path.exists(full_graph_file):
                    import networkx as nx
                    from collections import Counter
                    full_df = pd.read_csv(full_graph_file)
                    G_full = nx.from_pandas_edgelist(full_df, source='source', target='target')
                    degree_counts = Counter(dict(G_full.degree()).values())
                    # Construct dict format expected by frontend
                    full_graph_degrees = [{'degree': int(d), 'count': int(c)} for d, c in degree_counts.items()]
                    full_graph_degrees.sort(key=lambda x: x['degree'])
        except Exception as e:
            print(f"Failed to calculate full graph degrees: {e}")

        response_data = {
            'success': True,
            'data': {
                'nodes': nodes,
                'links': links,
                'fullGraphDegrees': full_graph_degrees
            }
        }
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Error in graph-data: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        pass

@app.route('/api/analysis/plots', methods=['GET'])
def list_analysis_plots():
    """Returns a list of filename names of the images generated in the analysis."""
    try:
        plots_dir = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'grafos', 'plots')
        if not os.path.exists(plots_dir):
            return jsonify({'success': True, 'data': []})
            
        files = [f for f in os.listdir(plots_dir) if f.endswith('.png')]
        return jsonify({'success': True, 'data': files})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/analysis/plot/<filename>', methods=['GET'])
def get_analysis_plot(filename):
    """Sends the PNG file of a specific plot."""
    try:
        # Basic security against path traversal
        if '..' in filename or '/' in filename:
            return jsonify({'success': False, 'message': 'Invalid filename.'}), 400
            
        file_path = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'grafos', 'plots', filename)
        
        if os.path.exists(file_path):
            return send_file(file_path, mimetype='image/png')
        else:
            return jsonify({'success': False, 'message': 'Plot not found.'}), 404
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/analysis/molecule-image', methods=['POST'])
def get_analysis_molecule_image():
    """Returns a base64 SVG image or plain text of a molecule from a SMILES."""
    try:
        data = request.json
        smiles = data.get('smiles')
        
        if not smiles:
            return jsonify({'success': False, 'message': 'SMILES not provided.'}), 400
            
        mol = Chem.MolFromSmiles(smiles)
        if not mol:
            return jsonify({'success': False, 'message': 'Invalid SMILES.'}), 400
            
        from rdkit.Chem.Draw import rdMolDraw2D
        from rdkit.Chem import AllChem
        
        drawer = rdMolDraw2D.MolDraw2DSVG(400, 300)
        drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        svg = drawer.GetDrawingText()
        
        # Generate 3D structure
        mol_3d = Chem.AddHs(mol)
        try:
            AllChem.EmbedMolecule(mol_3d, randomSeed=42)
            AllChem.MMFFOptimizeMolecule(mol_3d)
            mol_block = Chem.MolToMolBlock(mol_3d)
        except Exception as e:
            print(f"Failed to generate 3D structure: {e}")
            mol_block = None
        
        return jsonify({'success': True, 'svg': svg, 'molBlock': mol_block})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ==========================================
# REDOCKING WORKER & ROUTES
# ==========================================

# Dictionary to store logs for each task
task_logs = {}

def redocking_worker(task_id, target, charge_type, prepare_complex):
    threading.current_thread().task_id = task_id
    import logging
    pass
    pass
    pass
    
    # Create a stream to capture stdout
    log_stream = io.StringIO()
    
    # Redirect stdout and stderr to our stream
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    # Captura stdout e stderr mas também mantém o original para debug no terminal
    class Tee(object):
        def __init__(self, *files):
            self.files = files
        def write(self, obj):
            for f in self.files:
                f.write(obj)
                f.flush()
        def flush(self):
            for f in self.files:
                f.flush()
        def fileno(self):
            for f in self.files:
                if hasattr(f, 'fileno'):
                    return f.fileno()
            return sys.__stdout__.fileno()

    original_stdout = sys.stdout
    original_stderr = sys.stderr
    sys.stdout = Tee(log_stream, sys.__stdout__)
    sys.stderr = Tee(log_stream, sys.__stderr__)

    # Add a stream handler to project loggers so they show up in our captured logs
    project_loggers = ['wrapper_redocking', 'Docking', 'DockVina', 'crawlers']
    handlers = []
    for name in project_loggers:
        l = logging.getLogger(name)
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        l.addHandler(h)
        handlers.append((l, h))
    
    out_dir = os.path.join(BIOMOL_ROOT_PATH, 'resultados/redocking', target.replace(' ', ''))
    in_dir = os.path.join(BIOMOL_ROOT_PATH, 'datasets/PDB', target.replace(' ', ''))

    # Clean stale output files from previous runs so progress counter starts cleanly at 0
    if os.path.exists(out_dir):
        try:
            for old_f in os.listdir(out_dir):
                if old_f.endswith('.lig.pdbqt') or old_f.endswith('.vina'):
                    try:
                        os.remove(os.path.join(out_dir, old_f))
                    except Exception:
                        pass
        except Exception:
            pass

    try:
        task_start_time = time.time()
        active_tasks[task_id] = {
            'status': 'running',
            'target': target,
            'message': f'Running redocking for {target}...',
            'progress': {
                'phase': 'Redocking Complexes (Step 1/2)',
                'molecules_total': 0,
                'molecules_done': 0
            }
        }
        task_logs[task_id] = ""

        # Determine total complexes
        total_complexes = 0
        csv_p = os.path.join(in_dir, 'pdb_codes.csv')
        if os.path.exists(csv_p):
            try:
                with open(csv_p, 'r', encoding='utf-8', errors='ignore') as f:
                    total_complexes = max(0, len([l for l in f if l.strip()]) - 1)
            except Exception:
                total_complexes = 0

        # Start a thread to periodically update task_logs and progress
        def update_logs_and_progress():
            while active_tasks.get(task_id, {}).get('status') == 'running':
                content = log_stream.getvalue()
                task_logs[task_id] = content
                done_count = 0
                phase = 'Redocking Complexes (Step 1/2)'
                if os.path.exists(out_dir):
                    try:
                        done_count = len([
                            f for f in os.listdir(out_dir)
                            if f.endswith('.lig.pdbqt') and os.path.getmtime(os.path.join(out_dir, f)) >= task_start_time - 10.0
                        ])
                    except Exception:
                        done_count = 0
                if total_complexes > 0 and done_count >= total_complexes:
                    phase = 'Calculating RMSD & Post-Processing (Step 2/2)'
                    done_count = total_complexes
                if task_id in active_tasks:
                    active_tasks[task_id]['progress'] = {
                        'phase': phase,
                        'molecules_total': total_complexes,
                        'molecules_done': done_count
                    }
                threading.Event().wait(0.5)
            task_logs[task_id] = log_stream.getvalue()

        log_updater = threading.Thread(target=update_logs_and_progress)
        log_updater.daemon = True
        log_updater.start()

        perform_redocking(
            base_input_path=os.path.join(BIOMOL_ROOT_PATH, 'datasets/PDB'),
            target=target,
            base_output_path=os.path.join(BIOMOL_ROOT_PATH, 'resultados/redocking'),
            prepare_complex=prepare_complex,
            charge_type=charge_type
        )
        
        if active_tasks.get(task_id, {}).get('status') == 'cancelled':
            active_tasks[task_id]['message'] = f'Redocking for {target} stopped by user. Partial results saved.'
            if 'progress' in active_tasks[task_id]:
                active_tasks[task_id]['progress']['phase'] = 'Stopped (Partial Results Saved)'
        else:
            active_tasks[task_id]['status'] = 'completed'
            active_tasks[task_id]['message'] = f'Redocking for {target} completed successfully.'

    except TaskCancelledException:
        active_tasks[task_id]['status'] = 'cancelled'
        active_tasks[task_id]['message'] = f'Redocking for {target} stopped by user. Partial results saved.'
        if 'progress' in active_tasks[task_id]:
            active_tasks[task_id]['progress']['phase'] = 'Stopped (Partial Results Saved)'
    except Exception as e:
        print(f"FATAL ERROR in redocking_worker: {str(e)}", file=sys.__stderr__)
        active_tasks[task_id]['status'] = 'error'
        active_tasks[task_id]['message'] = str(e)
    finally:
        # Remove our custom handlers
        for l, h in handlers:
            l.removeHandler(h)
            
        sys.stdout = original_stdout
        sys.stderr = original_stderr
        pass

@app.route('/api/redocking/targets', methods=['GET'])
def get_redocking_targets():
    """Lists downloaded PDB targets that can be used for redocking."""
    pdb_data = {}
    if not os.path.exists(PDB_BASE_PATH):
        return jsonify([])

    targets = []
    for target_dir in os.listdir(PDB_BASE_PATH):
        target_path = os.path.join(PDB_BASE_PATH, target_dir)
        if os.path.isdir(target_path):
            pdb_files = [f for f in os.listdir(target_path) if f.endswith('.pdb')]
            if pdb_files:
                targets.append(target_dir)
    
    return jsonify(sorted(targets))

@app.route('/api/redocking/run', methods=['POST'])
def run_redocking_task():
    data = request.json or {}
    target = data.get('target')
    charge_type = data.get('charge_type', 'am1')
    prepare_complex = data.get('prepare_complex', True)
    prepared_receptor_path = data.get('prepared_receptor_path')

    if not target:
        return jsonify({'status': 'error', 'message': 'Target is required'}), 400

    # If prepare_complex is False, the user must confirm they have a prepared receptor
    if not prepare_complex:
        if not prepared_receptor_path:
            return jsonify({'status': 'error', 'message': 'prepared_receptor_path is required when prepare_complex is false.'}), 400
        prep_path = os.path.realpath(os.path.abspath(prepared_receptor_path))
        if not os.path.isdir(prep_path):
            return jsonify({'status': 'error', 'message': f'Prepared receptor directory not found: {prepared_receptor_path}'}), 400
        pdbqts = [f for f in os.listdir(prep_path) if f.endswith('.pdbqt')]
        prep_sub = os.path.join(prep_path, 'Prepared')
        if os.path.isdir(prep_sub):
            pdbqts.extend([f for f in os.listdir(prep_sub) if f.endswith('.pdbqt')])
        if not pdbqts:
            return jsonify({'status': 'error', 'message': f'Invalid Prepared Receptor folder: No prepared .pdbqt files found inside "{prepared_receptor_path}". Please select a valid Prepared folder.'}), 400

    task_id = str(uuid.uuid4())
    thread = threading.Thread(target=redocking_worker, args=(task_id, target, charge_type, prepare_complex))
    thread.start()

    return jsonify({'status': 'success', 'task_id': task_id})


@app.route('/api/redocking/status/<task_id>', methods=['GET'])
def get_redocking_status(task_id):
    status = active_tasks.get(task_id, {'status': 'not_found', 'message': 'Task not found'})
    logs = task_logs.get(task_id, "")
    return jsonify({**status, 'logs': logs})


def finalize_partial_rmsd(target_name):
    """Calculates RMSD for any existing docked .lig.pdbqt partial results and saves into pdb_codes.csv."""
    if not target_name:
        return
    try:
        from kernel.descriptors import Descriptors
        desc = Descriptors()
        target_clean = target_name.replace(' ', '')
        in_dir = os.path.join(BIOMOL_ROOT_PATH, 'datasets/PDB', target_clean)
        out_dir = os.path.join(BIOMOL_ROOT_PATH, 'resultados/redocking', target_clean)
        csv_path = os.path.join(in_dir, 'pdb_codes.csv')
        
        if not os.path.exists(csv_path) or not os.path.exists(out_dir):
            return
            
        df = pd.read_csv(csv_path)
        results = []
        for idx, row in df.iterrows():
            receptor = str(row.get('PDB_CODE', ''))
            ligand = str(row.get('LIGAND', ''))
            resnum = str(row.get('RESNUM', ''))
            chain = str(row.get('CHAIN', ''))
            composite = f'{receptor}_{ligand}_{resnum}{chain}'
            iligand = os.path.join(in_dir, 'Prepared', f'{composite}.lig.pdbqt')
            vina_model = os.path.join(out_dir, f'{composite}.lig.pdbqt')
            rmsd_val = None
            if os.path.isfile(iligand) and os.path.isfile(vina_model):
                try:
                    rmsd_val = desc.calcRMSD(iligand, vina_model)
                except Exception:
                    pass
            results.append(rmsd_val)
            
        df['RMSD'] = results
        df.to_csv(csv_path, index=False)
    except Exception as e:
        print(f"Error saving partial RMSD for {target_name}: {e}", file=sys.__stderr__)


@app.route('/api/redocking/cancel/<task_id>', methods=['POST'])
def cancel_redocking_task(task_id):
    """Cancels a running redocking task and saves partial results."""
    if task_id in active_tasks:
        if active_tasks[task_id].get('status') == 'running':
            active_tasks[task_id]['status'] = 'cancelled'
            active_tasks[task_id]['message'] = 'Stopping redocking and saving partial results...'
            ActiveSubprocesses.kill_by_task_id(task_id)
            ActiveSubprocesses._kill_orphans()
            target_name = active_tasks[task_id].get('target')
            finalize_partial_rmsd(target_name)
            return jsonify({'success': True, 'message': 'Cancellation requested and partial results saved'})
    return jsonify({'success': False, 'message': 'Task not running or not found'}), 404


@app.route('/api/redocking/results', methods=['GET'])
def list_redocking_results():
    """Lists targets that have redocking results (pdb_codes.csv with RMSD)."""
    results = []
    if not os.path.exists(PDB_BASE_PATH):
        return jsonify([])

    for target_dir in os.listdir(PDB_BASE_PATH):
        csv_path = os.path.join(PDB_BASE_PATH, target_dir, 'pdb_codes.csv')
        if os.path.exists(csv_path):
            try:
                df = pd.read_csv(csv_path)
                if 'RMSD' in df.columns and not df['RMSD'].dropna().empty:
                    results.append(target_dir)
            except:
                continue
    
    return jsonify(sorted(results))

@app.route('/api/redocking/csv/<target>', methods=['GET'])
def get_redocking_csv(target):
    csv_path = os.path.join(PDB_BASE_PATH, target, 'pdb_codes.csv')
    if not os.path.exists(csv_path):
        return jsonify({'status': 'error', 'message': 'Results not found'}), 404

    try:
        df = pd.read_csv(csv_path)
        # Filter to only show rows with results
        if 'RMSD' in df.columns:
            df = df[df['RMSD'].notnull()]
            # Sort by RMSD descending, as requested
            df = df.sort_values(by='RMSD', ascending=False)
        
        headers = df.columns.tolist()
        rows = df.values.tolist()
        return jsonify({'status': 'success', 'headers': headers, 'rows': rows})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/redocking/download/<target>', methods=['GET'])
def download_redocking_csv(target):
    csv_path = os.path.join(PDB_BASE_PATH, target, 'pdb_codes.csv')
    if not os.path.exists(csv_path):
        return jsonify({'status': 'error', 'message': 'Results not found'}), 404
    
    return send_file(csv_path, as_attachment=True, download_name=f'redocking_results_{target}.csv')

# ==========================================
# ADMET ROUTES
# ==========================================

# Dictionary to store ADMET task logs
admet_task_logs = {}

def admet_worker(task_id: str, target: str, input_file: str | None = None):
    """Background worker that runs the ADMET pipeline for a given ChEMBL target.

    Reads the three consolidated DrugBank files:
        {DRUGBANK_PATH}/{target}_MOLS.csv
        {DRUGBANK_PATH}/{target}_SIMS.csv
        {DRUGBANK_PATH}/{target}_FULL.csv

    Writes results to {ADMET_BASE_PATH}/ (= DrugBank/ADMET/).
    """
    log_stream = io.StringIO()
    old_stdout, old_stderr = sys.stdout, sys.stderr

    class Tee:
        def __init__(self, *files): self.files = files
        def write(self, obj):
            for f in self.files: f.write(obj); f.flush()
        def flush(self):
            for f in self.files: f.flush()
        def fileno(self):
            for f in self.files:
                if hasattr(f, 'fileno'): return f.fileno()
            return sys.__stdout__.fileno()

    sys.stdout = Tee(log_stream, sys.__stdout__)
    sys.stderr = Tee(log_stream, sys.__stderr__)

    def update_logs():
        while active_tasks.get(task_id, {}).get('status') == 'running':
            admet_task_logs[task_id] = log_stream.getvalue()
            threading.Event().wait(0.5)
        admet_task_logs[task_id] = log_stream.getvalue()

    active_tasks[task_id] = {
        'status': 'running',
        'message': f'Running ADMET for {target}...',
        'progress': {
            'phase': 'Loading Molecules',
            'molecules_total': 0,
            'molecules_done': 0
        }
    }
    admet_task_logs[task_id] = ''

    log_updater = threading.Thread(target=update_logs)
    log_updater.daemon = True
    log_updater.start()

    try:

        # Verify that at least one DrugBank group file exists for this target
        found_any = any(
            os.path.isfile(os.path.join(DRUGBANK_PATH, f"{target}_{sfx}.csv"))
            for sfx in ('MOLS', 'SIMS', 'FULL')
        )
        if not found_any:
            raise FileNotFoundError(
                f"No DrugBank group files found for target '{target}'. "
                f"Expected files like '{target}_MOLS.csv' in {DRUGBANK_PATH}. "
                f"Please download ChEMBL data first."
            )

        output_path = ADMET_BASE_PATH

        wrapper = ADMETWrapper(
            drugbank_path=DRUGBANK_PATH,
            output_path=output_path,
            target=target,
            verbose=True,
        )

        def _on_admet_progress(phase, done, total):
            if task_id in active_tasks:
                active_tasks[task_id]['progress'] = {
                    'phase': phase,
                    'molecules_total': total,
                    'molecules_done': done
                }

        summary = wrapper.run_pipeline(
            progress_callback=_on_admet_progress,
            cancel_check=lambda: active_tasks.get(task_id, {}).get('status') == 'cancelled'
        )

        if active_tasks.get(task_id, {}).get('status') == 'cancelled':
            active_tasks[task_id]['message'] = f'ADMET for {target} stopped by user. Partial results saved.'
            if 'progress' in active_tasks[task_id]:
                active_tasks[task_id]['progress']['phase'] = 'Stopped (Partial Results Saved)'
        else:
            active_tasks[task_id]['status']  = 'completed'
            active_tasks[task_id]['message'] = f'ADMET for {target} completed successfully.'
            active_tasks[task_id]['summary'] = summary

    except Exception as e:
        print(f"FATAL ERROR in admet_worker: {e}", file=sys.__stderr__)
        active_tasks[task_id]['status']  = 'error'
        active_tasks[task_id]['message'] = str(e)
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


@app.route('/api/admet/run', methods=['POST'])
def run_admet_task():
    """Starts an async ADMET analysis for the given ChEMBL target."""
    data   = request.json or {}
    target = data.get('target')

    if not target:
        return jsonify({'status': 'error', 'message': 'target is required'}), 400
    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid target name'}), 400

    task_id = str(uuid.uuid4())
    thread  = threading.Thread(target=admet_worker, args=(task_id, target, None))
    thread.start()

    return jsonify({'status': 'success', 'task_id': task_id})


@app.route('/api/admet/status/<task_id>', methods=['GET'])
def get_admet_status(task_id):
    """Returns the current status and logs for a running ADMET task."""
    status = active_tasks.get(task_id, {'status': 'not_found', 'message': 'Task not found'})
    logs   = admet_task_logs.get(task_id, '')
    return jsonify({**status, 'logs': logs})


@app.route('/api/admet/cancel/<task_id>', methods=['POST'])
def cancel_admet_task(task_id):
    """Cancels a running ADMET task and saves partial results."""
    if task_id in active_tasks:
        if active_tasks[task_id].get('status') == 'running':
            active_tasks[task_id]['status'] = 'cancelled'
            active_tasks[task_id]['message'] = 'Stopping ADMET and saving partial results...'
            return jsonify({'success': True, 'message': 'Cancellation requested'})
    return jsonify({'success': False, 'message': 'Task not running or not found'}), 404


@app.route('/api/admet/results', methods=['GET'])
def list_admet_results():
    """Lists targets that have completed ADMET results in DrugBank/ADMET/."""
    results = set()
    if not os.path.isdir(ADMET_BASE_PATH):
        return jsonify([])

    for fname in os.listdir(ADMET_BASE_PATH):
        if fname.endswith('.csv'):
            # Strip the group suffix to get the target name
            for sfx in ('_MOLS.csv', '_SIMS.csv', '_FULL.csv'):
                if fname.endswith(sfx):
                    results.add(fname[: -len(sfx)])
                    break

    return jsonify(sorted(results))


def _find_matching_admet_csv(base_dir, target, suffix):
    if not os.path.isdir(base_dir):
        return None
    exact_path = os.path.join(base_dir, f"{target}_{suffix}.csv")
    if os.path.isfile(exact_path):
        return exact_path
    norm_t = re.sub(r'[\s\-_]', '', target).lower()
    for fname in os.listdir(base_dir):
        if fname.endswith(f"_{suffix}.csv"):
            base_t = fname[:-len(f"_{suffix}.csv")]
            if re.sub(r'[\s\-_]', '', base_t).lower() == norm_t:
                return os.path.join(base_dir, fname)
    return None

@app.route('/api/admet/csv/<target>', methods=['GET'])
def get_admet_csv(target):
    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid target'}), 400

    if not os.path.isdir(ADMET_BASE_PATH):
        return jsonify({'status': 'error', 'message': 'No ADMET results found'}), 404

    groups = []
    for suffix in ('MOLS', 'SIMS', 'FULL'):
        csv_path = _find_matching_admet_csv(ADMET_BASE_PATH, target, suffix)
        if not csv_path or not os.path.isfile(csv_path):
            continue
        try:
            df = pd.read_csv(csv_path)
            if df.empty:
                continue
            summary = {
                'total':     len(df),
                'bbb_plus':  int((df['BBB'] == 'BBB+').sum()),
                'bbb_minus': int((df['BBB'] == 'BBB-').sum()),
                'hia_plus':  int((df['HIA'] == 'HIA+').sum()),
                'pgp_plus':  int((df['PGP'] == 'PGP+').sum()),
            }
            groups.append({
                'group':   suffix,
                'headers': df.columns.tolist(),
                'rows':    df.values.tolist(),
                'summary': summary,
            })
        except Exception as e:
            print(f"Error reading {csv_path}: {e}")

    if not groups:
        return jsonify({'status': 'error', 'message': 'No ADMET results found for this target'}), 404

    return jsonify({'status': 'success', 'groups': groups})


@app.route('/api/admet/plot/<target>/<filename>', methods=['GET'])
def get_admet_plot(target, filename):
    """Serves a BOILED-Egg PNG plot for the given target from DrugBank/ADMET/."""
    if '..' in target or '..' in filename:
        return jsonify({'status': 'error', 'message': 'Invalid path'}), 400
    if not filename.endswith('.png'):
        return jsonify({'status': 'error', 'message': 'Only PNG files are served'}), 400

    file_path = os.path.join(ADMET_BASE_PATH, filename)
    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': 'Plot not found'}), 404

    return send_file(file_path, mimetype='image/png')


@app.route('/api/admet/plots/<target>', methods=['GET'])
def list_admet_plots(target):
    """Lists available BOILED-Egg PNG plots for a given target from DrugBank/ADMET/."""
    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid target'}), 400

    if not os.path.isdir(ADMET_BASE_PATH):
        return jsonify([])

    plots = sorted([
        f for f in os.listdir(ADMET_BASE_PATH)
        if f.startswith(target) and f.endswith('_egg.png')
    ])
    return jsonify(plots)


@app.route('/api/admet/download/<target>/<group>', methods=['GET'])
def download_admet_csv(target, group):
    """Downloads a specific ADMET group CSV (MOLS, SIMS, or FULL) for a given target."""
    if '..' in target or '..' in group:
        return jsonify({'status': 'error', 'message': 'Invalid target or group'}), 400
    if group not in ('MOLS', 'SIMS', 'FULL'):
        return jsonify({'status': 'error', 'message': 'group must be MOLS, SIMS, or FULL'}), 400

    csv_path = os.path.join(ADMET_BASE_PATH, f"{target}_{group}.csv")
    if not os.path.isfile(csv_path):
        return jsonify({'status': 'error', 'message': 'Results CSV not found'}), 404

    return send_file(
        csv_path,
        as_attachment=True,
        download_name=f'admet_{target}_{group}.csv'
    )


@app.route('/api/admet/available-targets', methods=['GET'])
def list_admet_available_targets():
    """
    Lists targets eligible for ADMET analysis — those that have at least one
    DrugBank group file (_MOLS.csv / _SIMS.csv / _FULL.csv) in DRUGBANK_PATH.
    """
    if not os.path.isdir(DRUGBANK_PATH):
        return jsonify([])

    targets = set()
    for fname in os.listdir(DRUGBANK_PATH):
        for sfx in ('_MOLS.csv', '_SIMS.csv', '_FULL.csv'):
            if fname.endswith(sfx):
                targets.add(fname[: -len(sfx)])
                break

    return jsonify(sorted(targets))


# ==========================================
# DOCKING ROUTES
# ==========================================

docking_task_logs = {}


def _resolve_dock6_app_path() -> str:
    """
    Resolves the dock6 application directory (the folder containing bin/dock6)
    in a portable way, without hardcoding any user-specific paths.

    Resolution order:
      1. Find 'dock6' binary via shutil.which() -> return its grandparent dir (bin/../)
      2. DOCK6_PATH environment variable (pointing to the dock6 installation dir)
      3. Raise RuntimeError with a clear installation message.
    """
    dock6_bin = shutil.which('dock6')
    if dock6_bin:
        # binary lives at <dock6_root>/bin/dock6 -> return <dock6_root>/
        return str(Path(dock6_bin).parent.parent) + '/'

    env_path = os.environ.get('DOCK6_PATH')
    if env_path and os.path.isdir(env_path):
        return env_path if env_path.endswith('/') else env_path + '/'

    fallback_path = os.path.expanduser('~/progs/dock6/')
    if os.path.isdir(fallback_path):
        return fallback_path

    raise RuntimeError(
        "dock6 binary not found in your system PATH.\n"
        "Please install DOCK 6 and add its bin/ directory to PATH, "
        "or set the DOCK6_PATH environment variable to the DOCK 6 installation directory."
    )


def _resolve_base_mols_path(custom_base_mols: str, library: str) -> str:
    if not custom_base_mols:
        if library == 'zinc':
            return os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ZINC')
        return os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ChEMBL', 'DrugBank', 'ADMET')

    path = custom_base_mols
    if not os.path.isabs(path):
        candidate = os.path.join(BIOMOL_ROOT_PATH, path)
        if os.path.exists(candidate):
            path = candidate
        else:
            path = os.path.abspath(path)

    # Auto-correct if user selected a subdirectory (e.g. .../ADMET/Molecules) where CSV files are in parent directory
    if os.path.exists(path) and os.path.isdir(path):
        has_csv = any(f.endswith('.csv') for f in os.listdir(path))
        if not has_csv:
            parent_dir = os.path.dirname(path)
            if os.path.exists(parent_dir) and os.path.isdir(parent_dir):
                if any(f.endswith('.csv') for f in os.listdir(parent_dir)):
                    path = parent_dir

    return path


def docking_worker(task_id: str, target: str, pdb_code, library: str, dock_kwargs: dict):
    """
    Background thread that orchestrates the full consensus docking pipeline.
    Calls perform_consensus() exactly as the professor's code does.
    """
    threading.current_thread().task_id = task_id
    log_stream = io.StringIO()
    old_stdout, old_stderr = sys.stdout, sys.stderr

    class Tee:
        def __init__(self, *files):
            self.files = files
        def write(self, obj):
            for f in self.files:
                f.write(obj)
                f.flush()
        def flush(self):
            for f in self.files:
                f.flush()
        def fileno(self):
            for f in self.files:
                if hasattr(f, 'fileno'):
                    return f.fileno()
            return sys.__stdout__.fileno()

    sys.stdout = Tee(log_stream, sys.__stdout__)
    sys.stderr = Tee(log_stream, sys.__stderr__)

    # Determine total molecules for progress indicator
    total_mols = 0
    try:
        custom_base_mols_temp = dock_kwargs.get('base_selected_mols', None)
        base_selected_mols_temp = _resolve_base_mols_path(custom_base_mols_temp, library)
        mol_fn = dock_kwargs.get('mol_filename', 'molecules') if library == 'zinc' else (dock_kwargs.get('mol_filename') or f"{target}_MOLS")
        csv_p = os.path.join(base_selected_mols_temp, f"{mol_fn}.csv")
        if os.path.exists(csv_p):
            with open(csv_p, 'r', encoding='utf-8', errors='ignore') as f:
                lines = [l.strip() for l in f if l.strip()]
                total_mols = max(0, len(lines) - 1)
    except Exception:
        total_mols = 0

    base_output_path = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'docking')

    def _update_logs_and_progress():
        vina_dir = os.path.join(base_output_path, target.replace(' ', ''), 'Vina')
        dock6_dir = os.path.join(base_output_path, target.replace(' ', ''), 'Dock6')
        consensus_file = os.path.join(base_output_path, target.replace(' ', ''), f"{target.replace(' ', '')}.csv")

        while active_tasks.get(task_id, {}).get('status') == 'running':
            docking_task_logs[task_id] = log_stream.getvalue()

            done_count = 0
            phase = 'Preparing Complex'
            mols_dir = os.path.join(base_output_path, target.replace(' ', ''), 'Molecules')
            if os.path.exists(mols_dir):
                mols_done = len([f for f in os.listdir(mols_dir) if f.endswith('.mol2')])
                done_count = max(done_count, mols_done)
            if os.path.exists(vina_dir):
                pdbqts = [f for f in os.listdir(vina_dir) if f.endswith('.lig.pdbqt')]
                vinas = [f for f in os.listdir(vina_dir) if f.endswith('.vina')]
                done_count = max(done_count, len(pdbqts), len(vinas))
                if len(vinas) > 0 and len(vinas) < total_mols:
                    phase = 'Vina Docking'
                elif len(vinas) >= total_mols and total_mols > 0:
                    phase = 'DOCK6 Scoring'
            if os.path.exists(dock6_dir):
                dock6_outs = []
                for root_dir, _, files in os.walk(dock6_dir):
                    dock6_outs.extend([f for f in files if f.endswith('.out')])
                if len(dock6_outs) > 0:
                    done_count = max(done_count, len(dock6_outs))
                    phase = 'DOCK6 Scoring'
            if os.path.exists(consensus_file):
                phase = 'Consensus Evaluation'
                done_count = total_mols

            if task_id in active_tasks:
                active_tasks[task_id]['progress'] = {
                    'phase': phase,
                    'molecules_total': total_mols,
                    'molecules_done': done_count
                }
            threading.Event().wait(0.5)

        docking_task_logs[task_id] = log_stream.getvalue()

    active_tasks[task_id] = {
        'status': 'running',
        'message': f'Running Docking for {target}...',
        'progress': {
            'phase': 'Preparing Complex',
            'molecules_total': total_mols,
            'molecules_done': 0
        }
    }
    docking_task_logs[task_id] = ''

    log_updater = threading.Thread(target=_update_logs_and_progress, daemon=True)
    log_updater.start()

    try:

        # ── Paths (all absolute, portable) ────────────────────────────────────
        base_input_path  = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'PDB')

        # Use the user-supplied base_selected_mols if provided, otherwise use the defaults
        custom_base_mols = dock_kwargs.pop('base_selected_mols', None)
        base_selected_mols = _resolve_base_mols_path(custom_base_mols, library)

        if library == 'zinc':
            mol_filename = dock_kwargs.get('mol_filename', 'molecules')
        else:

            # Determine which ADMET file to use for this target
            if dock_kwargs.get('mol_filename'):
                mol_filename = dock_kwargs.get('mol_filename')
            else:
                if os.path.exists(os.path.join(base_selected_mols, f"{target}_FULL.csv")):
                    mol_filename = f"{target}_FULL"
                elif os.path.exists(os.path.join(base_selected_mols, f"{target}_MOLS.csv")):
                    mol_filename = f"{target}_MOLS"
                else:
                    mol_filename = f"{target}_MOLS"

        # Resolve dock6 installation directory portably (no hardcoded user paths)
        dock6_app_path = _resolve_dock6_app_path()

        # ── Build the pdb_code tuple (pdb_id, ligand, resnum, chain) ──────────
        pdb_tuple = None
        if isinstance(pdb_code, dict):
            target_pdb_id = pdb_code.get('pdb_id')
            if not target_pdb_id:
                best = get_better_complex(os.path.join(base_input_path, target) + '/')
                if best and len(best) > 0:
                    # best[0] is e.g. ('9L27', 'ACT', 301, 'A')
                    pdb_tuple = (best[0][0], best[0][1], str(best[0][2]), best[0][3])
                else:
                    raise ValueError(f"No valid complex found for target '{target}'")
            else:
                pdb_tuple = (
                    target_pdb_id,
                    pdb_code.get('resname'),
                    str(pdb_code.get('resnum')) if pdb_code.get('resnum') is not None else None,
                    pdb_code.get('chain'),
                )
        elif isinstance(pdb_code, (list, tuple)):
            pdb_tuple = tuple(pdb_code)
            
        if not pdb_tuple or len(pdb_tuple) != 4 or any(x is None for x in pdb_tuple):
            # Fallback to the best complex if tuple is invalid
            best = get_better_complex(os.path.join(base_input_path, target) + '/')
            if best and len(best) > 0:
                pdb_tuple = (best[0][0], best[0][1], str(best[0][2]), best[0][3])
            else:
                raise ValueError(f"Invalid pdb_code format and no best complex found: {pdb_tuple}")

        # ── Call perform_consensus() exactly as the professor's workflow does ──
        perform_consensus(
            base_input_path=base_input_path,
            target=target,
            base_output_path=base_output_path,
            base_selected_mols=base_selected_mols,
            dock6_app_path=dock6_app_path,
            pdb_code=pdb_tuple,
            cancel_check=lambda: active_tasks.get(task_id, {}).get('status') == 'cancelled',
            **{**dock_kwargs, 'mol_filename': mol_filename}
        )

        if active_tasks.get(task_id, {}).get('status') == 'cancelled':
            active_tasks[task_id]['message'] = f'Docking for {target} stopped by user. Partial results saved.'
            if 'progress' in active_tasks[task_id]:
                active_tasks[task_id]['progress']['phase'] = 'Stopped (Partial Results Saved)'
        else:
            active_tasks[task_id]['status']  = 'completed'
            active_tasks[task_id]['message'] = f'Docking for {target} completed successfully.'

    except TaskCancelledException:
        active_tasks[task_id]['status'] = 'cancelled'
        active_tasks[task_id]['message'] = f'Docking for {target} stopped by user. Partial results saved.'
        if 'progress' in active_tasks[task_id]:
            active_tasks[task_id]['progress']['phase'] = 'Stopped (Partial Results Saved)'
    except Exception as e:
        print(f"FATAL ERROR in docking_worker: {str(e)}", file=sys.__stderr__)
        active_tasks[task_id]['status']  = 'error'
        active_tasks[task_id]['message'] = str(e)
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


@app.route('/api/docking/available-ligands/<target>/<pdb_code>', methods=['GET'])
def get_ligands_docking(target, pdb_code):
    """Returns a list of ligands available in a given PDB file for docking."""
    if '..' in target or '..' in pdb_code:
        return jsonify({'status': 'error', 'message': 'Invalid file path'}), 400

    try:
        target_path = os.path.join(PDB_BASE_PATH, target)

        # If pdb_code == target, auto-resolve the best complex via scoring CSV
        if pdb_code == target:
            best = get_better_complex(target_path + '/')
            if best and len(best) > 0:
                real_pdb_code = best[0][0]
                file_path = os.path.join(target_path, f"{real_pdb_code}.pdb")
            else:
                return jsonify({'status': 'error', 'message': 'No valid complex found in target directory'}), 404
        else:
            file_path = os.path.join(target_path, f"{pdb_code}.pdb")

        if not os.path.exists(file_path):
            return jsonify({'status': 'error', 'message': 'PDB file not found'}), 404

        ligands = get_available_ligands(file_path)
        return jsonify({'status': 'success', 'ligands': ligands})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/docking/run', methods=['POST'])
def run_docking_task():
    """Starts a docking job in a background thread and returns a task_id for polling."""
    data     = request.json or {}
    target   = data.get('target')
    pdb_code = data.get('pdb_code')  # list/tuple: [pdb_id, resname, resnum, chain]
    library  = data.get('library', 'chembl')

    if not target or not pdb_code:
        return jsonify({'status': 'error', 'message': 'target and pdb_code are required'}), 400

    # ── Optional user-supplied paths ────────────────────────────────────────
    custom_base_mols      = data.get('base_selected_mols')        # may be None
    prepared_receptor_path = data.get('prepared_receptor_path')   # required if prepare_complex=False

    dock_kwargs = {
        'conformer_search_type': data.get('conformer_search_type', 'flex'),
        'density':               data.get('density', 0.5),
        'radius':                data.get('radius', 1.4),
        'distance':              data.get('distance', 10.0),
        'plot_max_residues':     data.get('plot_max_residues', 50),
        'pH':                    data.get('pH', 7.4),
        'sizeof_box':            data.get('sizeof_box', [24, 24, 24]),
        'exhaustiveness':        data.get('exhaustiveness', 20),
        'num_modes':             data.get('num_modes', 10),
        'prepare_complex':       data.get('prepare_complex', True),
        'charge_type':           data.get('charge_type', 'gas'),
        'mol_filename':          data.get('mol_filename'),
        'base_selected_mols':    custom_base_mols,  # forwarded to docking_worker
    }

    # Pre-flight validation (Fail-fast)
    prepare_complex = dock_kwargs['prepare_complex']
    target_clean = target.replace(' ', '')

    # 1. Check if Prepared folder exists when prepare_complex is False.
    #    The user must provide the path via the frontend picker.
    if not prepare_complex:
        if not prepared_receptor_path:
            return jsonify({'status': 'error', 'message': 'prepared_receptor_path is required when prepare_complex is false.'}), 400
        prepared_path = os.path.realpath(os.path.abspath(prepared_receptor_path))
        if not os.path.isdir(prepared_path):
            return jsonify({'status': 'error', 'message': f'Prepared receptor directory not found: {prepared_receptor_path}'}), 400
        pdbqts = [f for f in os.listdir(prepared_path) if f.endswith('.pdbqt')]
        prep_sub = os.path.join(prepared_path, 'Prepared')
        if os.path.isdir(prep_sub):
            pdbqts.extend([f for f in os.listdir(prep_sub) if f.endswith('.pdbqt')])
        if not pdbqts:
            return jsonify({'status': 'error', 'message': f'Invalid Prepared Receptor folder: No prepared .pdbqt files found inside "{prepared_receptor_path}". Please select a valid Prepared folder.'}), 400

    # 2. Check if molecules CSV exists in the selected mols folder
    effective_base_mols = _resolve_base_mols_path(custom_base_mols, library)
    mol_filename = dock_kwargs.get('mol_filename')
    if library == 'zinc':
        mol_filename = mol_filename or 'molecules'
        molecules_path = os.path.join(effective_base_mols, mol_filename + '.csv')
    else:
        if mol_filename and os.path.isfile(os.path.join(effective_base_mols, mol_filename + '.csv')):
            molecules_path = os.path.join(effective_base_mols, mol_filename + '.csv')
        elif _find_matching_admet_csv(effective_base_mols, target, "FULL"):
            molecules_path = _find_matching_admet_csv(effective_base_mols, target, "FULL")
            mol_filename = os.path.basename(molecules_path)[:-4]
        elif _find_matching_admet_csv(effective_base_mols, target, "MOLS"):
            molecules_path = _find_matching_admet_csv(effective_base_mols, target, "MOLS")
            mol_filename = os.path.basename(molecules_path)[:-4]
        else:
            csv_files = [f for f in os.listdir(effective_base_mols) if f.endswith('.csv')] if os.path.isdir(effective_base_mols) else []
            if csv_files:
                mol_filename = csv_files[0][:-4]
                molecules_path = os.path.join(effective_base_mols, csv_files[0])
            else:
                mol_filename = f"{target}_MOLS"
                molecules_path = os.path.join(effective_base_mols, mol_filename + '.csv')

    if not os.path.isfile(molecules_path):
        return jsonify({'status': 'error', 'message': f'Invalid molecules folder: No molecule CSV files found inside "{effective_base_mols}". Please select a folder containing molecule CSV files or run ADMET filter first.'}), 400

    task_id = str(uuid.uuid4())
    thread  = threading.Thread(
        target=docking_worker,
        args=(task_id, target, pdb_code, library, {**dock_kwargs, 'mol_filename': mol_filename, 'base_selected_mols': effective_base_mols}),
        daemon=True
    )
    thread.task_id = task_id
    thread.start()

    return jsonify({'status': 'success', 'task_id': task_id})


@app.route('/api/docking/status/<task_id>', methods=['GET'])
def get_docking_status(task_id):
    """Returns the current status and live logs of a running docking task."""
    status = active_tasks.get(task_id, {'status': 'not_found', 'message': 'Task not found'})
    logs   = docking_task_logs.get(task_id, '')
    return jsonify({**status, 'logs': logs})


@app.route('/api/docking/cancel/<task_id>', methods=['POST'])
def cancel_docking_task(task_id):
    """Cancels a running docking task and generates partial results."""
    if task_id in active_tasks:
        if active_tasks[task_id].get('status') == 'running':
            active_tasks[task_id]['status'] = 'cancelled'
            active_tasks[task_id]['message'] = 'Stopping docking and saving partial results...'
            ActiveSubprocesses.kill_by_task_id(task_id)
            return jsonify({'success': True, 'message': 'Cancellation requested'})
    return jsonify({'success': False, 'message': 'Task not running or not found'}), 404


@app.route('/api/docking/results', methods=['GET'])
def list_docking_results():
    """Lists targets that have a completed docking consensus CSV."""
    docking_base = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'docking')
    if not os.path.exists(docking_base):
        return jsonify([])

    results = [
        d for d in os.listdir(docking_base)
        if os.path.isfile(os.path.join(docking_base, d, f"{d}.csv"))
    ]
    return jsonify(sorted(results))


@app.route('/api/docking/csv/<target>', methods=['GET'])
def get_docking_csv(target):
    """Returns the consensus docking results CSV as JSON for a given target."""
    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid target'}), 400

    csv_path = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'docking', target, f"{target}.csv")
    if not os.path.exists(csv_path):
        return jsonify({'status': 'error', 'message': 'Results not found'}), 404

    try:
        df = pd.read_csv(csv_path)
        rows = [[None if pd.isna(x) else x for x in row] for row in df.values.tolist()]
        return jsonify({'status': 'success', 'headers': df.columns.tolist(), 'rows': rows})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/docking/plot/<target>', methods=['GET'])
def get_docking_plot(target):
    """Serves the correlation plot PNG for a completed docking target."""
    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid path'}), 400

    file_path = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'docking', target, 'correlation.png')
    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': 'Plot not found'}), 404

    return send_file(file_path, mimetype='image/png')


@app.route('/api/docking/download/<target>', methods=['GET'])
def download_docking_csv(target):
    """Downloads the consensus docking CSV for a given target."""
    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid target'}), 400

    csv_path = os.path.join(BIOMOL_ROOT_PATH, 'resultados', 'docking', target, f"{target}.csv")
    if not os.path.exists(csv_path):
        return jsonify({'status': 'error', 'message': 'Results not found'}), 404

    return send_file(csv_path, as_attachment=True, download_name=f'docking_{target}.csv')


if __name__ == '__main__':
    # Enabled debug mode for development hot-reload
    port = int(os.environ.get('PORT', os.environ.get('FLASK_PORT', 5000)))
    app.run(host="127.0.0.1", port=port, debug=True, use_reloader=True)