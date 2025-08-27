from flask import Flask, request, jsonify, render_template
import sys
import os

# Adiciona o diretório raiz do BioMolExplorer ao Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'BioMolExplorer', 'src')))

from wrappers.crawlers import load_pdb
from crawlers.complex import PolymerEntityType, ExperimentalMethod

app = Flask(__name__, template_folder='../frontend', static_folder='../frontend')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/load_pdb', methods=['POST'])
def run_load_pdb():
    data = request.json
    try:
        # Converte as strings recebidas do frontend para os membros do Enum correspondente
        if 'PolymerEntityTypeID' in data and data['PolymerEntityTypeID']:
            data['PolymerEntityTypeID'] = [PolymerEntityType[item] for item in data['PolymerEntityTypeID']]
        if 'ExperimentalMethodID' in data and data['ExperimentalMethodID']:
            data['ExperimentalMethodID'] = [ExperimentalMethod[item] for item in data['ExperimentalMethodID']]

        # Chama a função para baixar os arquivos PDB com os parâmetros do formulário
        load_pdb(
            target=data.get('target'),
            base_output_path=os.path.join(' BioMolExplorer', 'datasets'),
            pdb_ec=data.get('pdb_ec'),
            PolymerEntityTypeID=data.get('PolymerEntityTypeID'),
            ExperimentalMethodID=data.get('ExperimentalMethodID'),
            max_resolution=data.get('max_resolution'),
            must_have_ligand=data.get('must_have_ligand', True)
        )
        return jsonify({'status': 'success', 'message': f"Dados PDB para {data.get('target')} carregados com sucesso"})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

if __name__ == '__main__':
    app.run(debug=True)