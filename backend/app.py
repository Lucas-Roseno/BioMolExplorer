from flask import Flask, request, jsonify, render_template
import sys
import os
import shutil 

# Arquivos do Michel
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'BioMolExplorer', 'src')))
from wrappers.crawlers import load_pdb
from crawlers.complex import PolymerEntityType, ExperimentalMethod

# Caminho das páginas
app = Flask(__name__, template_folder='../frontend', static_folder='../frontend/static')

# Caminho para o download
PDB_BASE_PATH = os.path.join('BioMolExplorer', 'datasets', 'PDB')


# --- ROTAS ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/pdbLoader')
def pdbLoader():
    return render_template('pdbLoader.html')

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
        return jsonify({'status': 'success', 'message': f"Dados PDB para {data.get('target')} carregados com sucesso"})
    
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
        return jsonify({'status': 'error', 'message': 'Target ou arquivo PDB não especificado'}), 400

    file_path = os.path.join(PDB_BASE_PATH, target, pdb_file)
    
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            if not os.listdir(os.path.join(PDB_BASE_PATH, target)):
                 shutil.rmtree(os.path.join(PDB_BASE_PATH, target))
            return jsonify({'status': 'success', 'message': f'{pdb_file} deletado com sucesso'})
        else:
            return jsonify({'status': 'error', 'message': 'Arquivo não encontrado'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)