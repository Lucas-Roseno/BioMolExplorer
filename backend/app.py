from flask import Flask, request, jsonify, render_template
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


# --- PDB functions ---
@app.route('/load_pdb', methods=['POST'])
def run_load_pdb():
    data = request.json
    try:
        if 'PolymerEntityTypeID' in data and data['PolymerEntityTypeID']:
            data['PolymerEntityTypeID'] = [PolymerEntityType[item] for item in data['PolymerEntityTypeID']]
        if 'ExperimentalMethodID' in data and data['ExperimentalMethodID']:
            data['ExperimentalMethodID'] = [ExperimentalMethod[item] for item in data['ExperimentalMethodID']]
        
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
            if not os.listdir(os.path.join(PDB_BASE_PATH, target)):
                 shutil.rmtree(os.path.join(PDB_BASE_PATH, target))
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
        # Temporary change of the correnct directory so that the code work
        biomol_explorer_path = os.path.join(BASE_DIR, 'BioMolExplorer')
        os.chdir(biomol_explorer_path)
        
        user_data = request.json
        
        target_data = user_data.get('target', {})
        target_name = target_data.get('target_name')
        
        if not target_name:
            return jsonify({'status': 'error', 'message': 'Target name is required'}), 400

        def update_json_file(file_path, new_data):
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
        return jsonify({'status': 'error', 'message': str(e)}), 400
    finally:
    # Come back to the original directory
        os.chdir(original_cwd)

if __name__ == '__main__':
    app.run(debug=True)