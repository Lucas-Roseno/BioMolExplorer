from flask import Flask, request, jsonify, send_file
import sys
import os
import shutil
import json
import io
import base64
import zipfile
import requests
import pandas as pd
from rdkit import Chem
from rdkit.Chem import AllChem, Draw
import ast

# Michel's files
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'BioMolExplorer', 'src')))
from wrappers.crawlers import load_pdb, load_chembl, load_zinc
from crawlers.complex import PolymerEntityType, ExperimentalMethod
from wrappers.molecular_analyzer import compute_similarity, analyze_graphs, generate_fingerprints
from kernel.descriptors import similarityFunctions, fingerprints

# PATHs
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)
PDB_BASE_PATH = os.path.join(BASE_DIR, 'BioMolExplorer', 'datasets', 'PDB')
CHEMBL_BASE_PATH = os.path.join(BASE_DIR, 'BioMolExplorer', 'datasets', 'ChEMBL')
JSON_CRAWLERS_PATH = os.path.join(BASE_DIR, 'BioMolExplorer', 'src', 'scripts', 'crawlers')
ZINC_BASE_PATH = os.path.join(BASE_DIR, 'BioMolExplorer', 'datasets', 'ZINC')

# --- PDB functions ---
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
        
        warnings = load_pdb(
            target=data.get('target'),
            base_output_path='/BioMolExplorer/datasets',
            pdb_ec=data.get('pdb_ec'),
            PolymerEntityTypeID=data.get('PolymerEntityTypeID'),
            ExperimentalMethodID=data.get('ExperimentalMethodID'),
            max_resolution=data.get('max_resolution'),
            must_have_ligand=data.get('must_have_ligand', True)
        )
        
        return jsonify({
            'status': 'success', 
            'message': f"PDB data for {data.get('target')} loaded successfully",
            'warnings': warnings 
        })
    
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
            return jsonify({'status': 'success', 'message': f'Target {target} deleted successfully'})
        else:
            return jsonify({'status': 'error', 'message': 'Target directory not found'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ---CHEMBL functions ---
@app.route('/load_chembl', methods=['POST'])
def run_load_chembl():
    """Updates JSON files with user data and runs the ChEMBL crawler."""
    original_cwd = os.getcwd()
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
        biomol_explorer_path = os.path.join(BASE_DIR, 'BioMolExplorer')
        os.chdir(biomol_explorer_path)
        
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


        load_chembl(
            target_name=target_name,
            base_output_path='/datasets'
        )
        return jsonify({'status': 'success', 'message': f"ChEMBL data for '{target_name}' loaded successfully!"})

    except Exception as e:
        print(e)
        return jsonify({'status': 'error', 'message': str(e)}), 400
    finally:
    # Come back to the original directory
        os.chdir(original_cwd)
        

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
        for sub_dir_name in ['molecules', 'similars']:
            target_dir = os.path.join(CHEMBL_BASE_PATH, sub_dir_name, target)
            if os.path.isdir(target_dir):
                shutil.rmtree(target_dir)
                deleted_something = True
        if deleted_something:
            return jsonify({'status': 'success', 'message': f'Target "{target}" deleted successfully'})
        else:
            return jsonify({'status': 'error', 'message': 'Target folder not found'}), 404
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
        original_cwd = os.getcwd()
        biomol_explorer_path = os.path.join(BASE_DIR, 'BioMolExplorer')
        os.chdir(biomol_explorer_path)

        try:
            # CORREÇÃO: Passar run_2d e run_3d em vez das variáveis baseadas apenas no nome
            load_zinc(
                base_output_path='/datasets', 
                zinc2d=run_2d,  # Use flag corresponding to saved file
                zinc3d=run_3d,  # Use flag corresponding to saved file
                verbose=verbose_flag
            )
        finally:
            os.chdir(original_cwd)

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

@app.route('/api/analysis/graph-data', methods=['GET'])
def get_graph_data():
    """
    Runs the analysis pipeline (to ensure fresh data)
    and returns the graph data (nodes and edges).
    """
    original_cwd = os.getcwd()
    try:
        target = request.args.get('target', 'Acetylcholinesterase')
        
        # --- 0. Run Analysis Pipeline (as requested by user) ---
        target_dir = os.path.join(BASE_DIR, 'BioMolExplorer')
        os.chdir(target_dir)

        # Defining paths relative to CWD
        rel_db_path = '/datasets/ChEMBL/DrugBank'
        
        # Optimization: if datasets do not exist, skip processing
        full_db_path = os.path.join(target_dir, 'datasets', 'ChEMBL', 'DrugBank')
        if not os.path.exists(full_db_path):
             return jsonify({'success': False, 'message': f'Datasets path {full_db_path} not found.'}), 404

        # Executing original workflow functions (21-dataAnalysis.py)
        # Note: these functions use Path.cwd() internally
        generate_fingerprints(base_input_path=rel_db_path, morgan=True, maccs=True, pharmacophore=True)
        compute_similarity(base_input_path=rel_db_path + '/Fingerprints',
                           base_output_path=rel_db_path,
                           metric=similarityFunctions.TanimotoSimilarity,
                            fingerprint=fingerprints.Morgan)
        analyze_graphs(base_input_path=rel_db_path,
                        base_output_path='/resultados/grafos',
                        metric=similarityFunctions.TanimotoSimilarity,
                        fingerprint=fingerprints.Morgan)

        dataset_type = request.args.get('datasetType', 'MOLS')
        if dataset_type not in ['MOLS', 'SIMS']:
            dataset_type = 'MOLS'

        # --- 1. Load Processed Data ---
        maxcomp_dir = os.path.join(BASE_DIR, 'BioMolExplorer', 'resultados', 'grafos', 'data', 'maxcomp')
        
        # Find corresponding file flexibly (ignoring spaces in target name)
        csv_file = None
        target_normalized = target.replace(" ", "").lower()
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
            return jsonify({'success': False, 'message': f'Graph data file not found for {dataset_type} dataset.'}), 404
            
        # Read edges (source, target, value)
        edges_df = pd.read_csv(csv_file)
        
        # Read molecule data (to map ID -> SMILES) flexibly
        mols_file = os.path.join(BASE_DIR, 'BioMolExplorer', 'datasets', 'ChEMBL', 'DrugBank', f'{correct_alvo}_{dataset_type}.csv')
        
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
                full_graph_file = os.path.join(BASE_DIR, 'BioMolExplorer', 'datasets', 'ChEMBL', 'DrugBank', 'Similarity', filename)
                
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
        os.chdir(original_cwd)

@app.route('/api/analysis/plots', methods=['GET'])
def list_analysis_plots():
    """Returns a list of filename names of the images generated in the analysis."""
    try:
        plots_dir = os.path.join(BASE_DIR, 'BioMolExplorer', 'resultados', 'grafos', 'plots')
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
            
        file_path = os.path.join(BASE_DIR, 'BioMolExplorer', 'resultados', 'grafos', 'plots', filename)
        
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
        drawer = rdMolDraw2D.MolDraw2DSVG(400, 300)
        drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        svg = drawer.GetDrawingText()
        
        return jsonify({'success': True, 'svg': svg})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)