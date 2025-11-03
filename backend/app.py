from flask import Flask, request, jsonify, render_template, send_file
import sys
import os
import shutil
import json
import re

# Michel's files
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'BioMolExplorer', 'src')))
from wrappers.crawlers import load_pdb, load_chembl
from crawlers.complex import PolymerEntityType, ExperimentalMethod

# PATHs
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, template_folder='../frontend', static_folder='../frontend/static')
PDB_BASE_PATH = os.path.join(BASE_DIR, 'BioMolExplorer', 'datasets', 'PDB')
CHEMBL_BASE_PATH = os.path.join(BASE_DIR, 'BioMolExplorer', 'datasets', 'ChEMBL')
JSON_CRAWLERS_PATH = os.path.join(BASE_DIR, 'BioMolExplorer', 'src', 'scripts', 'crawlers')

# --- Page routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/pdbLoader')
def pdbLoader():
    return render_template('pdbLoader.html')

@app.route('/chemblLoader')
def chemblLoader():
    return render_template('chemblLoader.html')

@app.route('/about')
def about():
    return render_template('about.html')


# --- PDB functions ---
@app.route('/load_pdb', methods=['POST'])
def run_load_pdb():
    data = request.json
    try:
        # Lógica revertida para o básico
        if 'PolymerEntityTypeID' in data and data['PolymerEntityTypeID']:
            data['PolymerEntityTypeID'] = [PolymerEntityType[item] for item in data['PolymerEntityTypeID'] if item]
        if 'ExperimentalMethodID' in data and data['ExperimentalMethodID']:
            data['ExperimentalMethodID'] = [ExperimentalMethod[item] for item in data['ExperimentalMethodID'] if item]
        
        load_pdb(
            target=data.get('target'),
            base_output_path=os.path.join('BioMolExplorer', 'datasets'),
            pdb_ec=data.get('pdb_ec'),
            PolymerEntityTypeID=data.get('PolymerEntityTypeID'),
            ExperimentalMethodID=data.get('ExperimentalMethodID'),
            max_resolution=data.get('max_resolution'),
            must_have_ligand=data.get('must_have_ligand', True)
        )
        return jsonify({'status': 'success', 'message': f"PDB data for {data.get('target')} loaded successfully"})
    
    except Exception as e:
        # Erro básico reportado
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
    
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            # If target folder is empty, remove it
            target_dir_path = os.path.join(PDB_BASE_PATH, target)
            if not os.listdir(target_dir_path):
                 shutil.rmtree(target_dir_path)
            return jsonify({'status': 'success', 'message': f'{pdb_file} deleted successfully'})
        else:
            return jsonify({'status': 'error', 'message': 'File not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---CHEMBL functions ---
@app.route('/load_chembl', methods=['POST'])
def run_load_chembl():
    """Updates JSON files with user data and runs the ChEMBL crawler."""
    original_cwd = os.getcwd()
    try:
        # Lógica revertida para o básico
        biomol_explorer_path = os.path.join(BASE_DIR, 'BioMolExplorer')
        os.chdir(biomol_explorer_path)
        
        user_data = request.json
        
        target_data = user_data.get('target', {})
        target_name = target_data.get('target_name')
        
        if not target_name:
            return jsonify({'status': 'error', 'message': 'Target name is required'}), 400

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
                
        update_json_file(os.path.join(JSON_CRAWLERS_PATH, 'target.json'), user_data.get('target', {}))
        update_json_file(os.path.join(JSON_CRAWLERS_PATH, 'bioactivity.json'), user_data.get('bioactivity', {}))
        update_json_file(os.path.join(JSON_CRAWLERS_PATH, 'molecules.json'), user_data.get('molecules', {}))
        update_json_file(os.path.join(JSON_CRAWLERS_PATH, 'similarmols.json'), user_data.get('similarmols', {}))


        load_chembl(
            target_name=target_name,
            base_output_path='/datasets'
        )
        return jsonify({'status': 'success', 'message': f"ChEMBL data for '{target_name}' loaded successfully!"})

    except Exception as e:
        # Erro básico reportado
        return jsonify({'status': 'error', 'message': str(e)}), 400
    finally:
    # Come back to the original directory
        os.chdir(original_cwd)

# --- NEW ChEMBL file management routes ---

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

@app.route('/delete_chembl', methods=['POST'])
def delete_chembl():
    """Deletes a specific ChEMBL CSV file."""
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
        if os.path.exists(file_path):
            os.remove(file_path)
            target_path = os.path.join(CHEMBL_BASE_PATH, sub_dir_name, target)
            # If target folder is empty, remove it
            if not os.listdir(target_path):
                 os.rmdir(target_path) 
            return jsonify({'status': 'success', 'message': f'{csv_file} deleted successfully'})
        else:
            return jsonify({'status': 'error', 'message': 'File not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)