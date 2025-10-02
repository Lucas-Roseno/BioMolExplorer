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

# Pages path
app = Flask(__name__, template_folder='../frontend', static_folder='../frontend/static')

# Download path
PDB_BASE_PATH = os.path.join('BioMolExplorer', 'datasets', 'PDB')
# JSON crawlers path
JSON_CRAWLERS_PATH = os.path.join('BioMolExplorer', 'src', 'scripts', 'crawlers')

# --- ROUTES ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/pdbLoader')
def pdbLoader():
    return render_template('pdbLoader.html')

@app.route('/chemblLoader')
def chemblLoader():
    return render_template('chemblLoader.html')

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

# --- ChEMBL ROUTE ---
@app.route('/load_chembl', methods=['POST'])
def run_load_chembl():
    """Atualiza os arquivos JSON com os dados do usuário e executa o crawler do ChEMBL."""
    try:
        user_data = request.json
        target_name = user_data.get('target_name')
        if not target_name:
            return jsonify({'status': 'error', 'message': 'Target name is required'}), 400

        # --- Update target.json ---
        target_path = os.path.join(JSON_CRAWLERS_PATH, 'target.json')
        with open(target_path, 'r') as f:
            target_json = json.load(f)
        target_json.update(user_data['target'])
        with open(target_path, 'w') as f:
            json.dump(target_json, f, indent=4)

        # --- Update bioactivity.json ---
        bioactivity_path = os.path.join(JSON_CRAWLERS_PATH, 'bioactivity.json')
        with open(bioactivity_path, 'r') as f:
            bioactivity_json = json.load(f)
        bioactivity_json.update(user_data['bioactivity'])
        with open(bioactivity_path, 'w') as f:
            json.dump(bioactivity_json, f, indent=4)

        # --- Update molecules.json ---
        molecules_path = os.path.join(JSON_CRAWLERS_PATH, 'molecules.json')
        with open(molecules_path, 'r') as f:
            molecules_json = json.load(f)
        molecules_json.update(user_data['molecules'])
        with open(molecules_path, 'w') as f:
            json.dump(molecules_json, f, indent=4)

        # --- Update similarmols.json ---
        similarmols_path = os.path.join(JSON_CRAWLERS_PATH, 'similarmols.json')
        with open(similarmols_path, 'r') as f:
            similarmols_json = json.load(f)
        similarmols_json.update(user_data['similarmols'])
        with open(similarmols_path, 'w') as f:
            json.dump(similarmols_json, f, indent=4)

        # --- Run the crawler function ---
        load_chembl(
            target_name=target_name,
            base_output_path=os.path.join('BioMolExplorer', 'datasets')
        )

        return jsonify({'status': 'success', 'message': f"ChEMBL data for '{target_name}' loaded successfully!"})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

# --- Other routes (PDB) ---
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

if __name__ == '__main__':
    app.run(debug=True)