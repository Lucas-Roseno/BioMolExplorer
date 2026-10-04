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
import tempfile
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

# Auth & Workspace modules
import auth as auth_module
import workspace as workspace_module
import dataset_import as dataset_import_module
from similarity_workspace import SimilarityInputError, available_targets as similarity_targets, prepare_inputs

# PATHs
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = dataset_import_module.MAX_IMPORT_BYTES
app.config['MAX_FORM_PARTS'] = dataset_import_module.MAX_IMPORT_FILES * 2 + 100
app.config['MAX_FORM_MEMORY_SIZE'] = 8 * 1024 * 1024
ActiveSubprocesses.register_signal_handlers()
BIOMOL_ROOT_PATH = os.path.abspath(os.path.join(BASE_DIR, 'BioMolExplorer'))
JSON_CRAWLERS_PATH = os.path.join(BIOMOL_ROOT_PATH, 'src', 'scripts', 'crawlers')

# Legacy path constants — still used for BIOMOL library internals (e.g. crawlers).
# All user-facing data paths now resolve through workspace_module.resolve_workspace_path().
_LEGACY_PDB_PATH    = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'PDB')
_LEGACY_CHEMBL_PATH = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ChEMBL')
_LEGACY_ZINC_PATH   = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ZINC')
_LEGACY_DRUGBANK    = os.path.join(BIOMOL_ROOT_PATH, 'datasets', 'ChEMBL', 'DrugBank')
_LEGACY_ADMET       = os.path.join(_LEGACY_DRUGBANK, 'ADMET')

# Initialize auth database on startup
auth_module.init_db()

# ==========================================
# AUTH MIDDLEWARE
# ==========================================

# Routes that do NOT require authentication
_PUBLIC_ROUTES = {
    '/api/auth/setup',
    '/api/auth/setup-required',
    '/api/auth/login',
}

def _extract_token() -> str | None:
    """Extract Bearer token from the Authorization header."""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    return None

@app.before_request
def require_auth():
    """Validate the session token on every request except public routes."""
    if request.path in _PUBLIC_ROUTES:
        return None  # Allow unauthenticated access
    if request.method == 'OPTIONS':
        return None  # CORS pre-flight

    token = _extract_token()
    user = auth_module.validate_token(token) if token else None
    if user is None:
        return jsonify({'status': 'error', 'message': 'Authentication required.'}), 401

    # Attach to request context for use in route handlers
    request.current_user = user

    # Validate every supplied workspace before any endpoint turns it into a
    # filesystem path. Workspace-management endpoints remain reachable with
    # a stale browser selection so the user can recover by choosing another
    # workspace.
    workspace_name = request.headers.get('X-Workspace', '').strip()
    workspace_optional = (
        request.path.startswith('/api/auth')
        or request.path.startswith('/api/users')
        or request.path.startswith('/api/workspaces')
        or request.path.startswith('/api/admin')
        or request.path.startswith('/api/filesystem')
    )
    if not workspace_name and not workspace_optional:
        return jsonify({
            'status': 'error',
            'message': 'Select an active workspace before using this feature.'
        }), 400
    if workspace_name and not workspace_optional:
        try:
            if not workspace_module.workspace_exists(user['username'], workspace_name):
                return jsonify({
                    'status': 'error',
                    'message': 'The selected workspace does not exist or does not belong to this user.'
                }), 404
            workspace_module.resolve_workspace_path(user['username'], workspace_name)
        except ValueError as exc:
            return jsonify({'status': 'error', 'message': str(exc)}), 400
    return None

def _get_user():
    """Return the current authenticated user dict."""
    return getattr(request, 'current_user', None)

def _get_workspace_path(sub: str | None = None) -> Path:
    """
    Resolve the active workspace path from request headers.
    Optionally append a sub-path (e.g. 'datasets/PDB').

    The client must send:
      X-Workspace: <workspace_name>

    Data endpoints require an explicitly selected, registered workspace. This
    prevents accidental writes to the old shared repository directories.
    """
    user = _get_user()
    workspace_name = request.headers.get('X-Workspace', '').strip()

    if not user or not workspace_name:
        raise ValueError('An active workspace is required.')
    base = workspace_module.resolve_workspace_path(user['username'], workspace_name)

    if sub:
        return base / sub
    return base


def _new_task_state(**state) -> dict:
    """Attach the current user/workspace scope to an asynchronous task."""
    user = _get_user()
    workspace_name = request.headers.get('X-Workspace', '').strip()
    return {
        '_owner': user['username'],
        '_workspace': workspace_name,
        **state,
    }


def _task_for_current_scope(task_id: str) -> dict | None:
    task = active_tasks.get(task_id)
    user = _get_user()
    workspace_name = request.headers.get('X-Workspace', '').strip()
    if not task or task.get('_owner') != user['username'] or task.get('_workspace') != workspace_name:
        return None
    return task


def _public_task_state(task: dict) -> dict:
    return {key: value for key, value in task.items() if not key.startswith('_')}

def _pdb_path()     -> Path: return _get_workspace_path('datasets/PDB')
def _chembl_path()  -> Path: return _get_workspace_path('datasets/ChEMBL')
def _zinc_path()    -> Path: return _get_workspace_path('datasets/ZINC')
def _results_path() -> Path: return _get_workspace_path('resultados')
def _drugbank_path()-> Path: return _get_workspace_path('datasets/ChEMBL/DrugBank')
def _admet_path()   -> Path: return _get_workspace_path('datasets/ChEMBL/DrugBank/ADMET')

# Aliases kept for code readability where the variable name mirrors old constants:
def PDB_BASE_PATH() -> str: return str(_pdb_path())
def CHEMBL_BASE_PATH() -> str: return str(_chembl_path())
def ZINC_BASE_PATH() -> str: return str(_zinc_path())
def DRUGBANK_PATH() -> str: return str(_drugbank_path())
def ADMET_BASE_PATH() -> str: return str(_admet_path())

# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.route('/api/auth/setup', methods=['POST'])
def auth_setup():
    """Create the first admin account. Only works when no admin exists."""
    if not auth_module.setup_required():
        return jsonify({'status': 'error', 'message': 'Admin account already configured.'}), 409

    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    try:
        user = auth_module.create_admin(username, password)
        token = auth_module.generate_token(
            auth_module.authenticate(username, password)['id']
        )
        return jsonify({'status': 'success', 'user': user, 'token': token}), 201
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/api/auth/setup-required', methods=['GET'])
def auth_setup_required():
    """Returns whether initial admin setup is needed. Public endpoint."""
    return jsonify({'setup_required': auth_module.setup_required()})


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """Authenticate a user and return a session token."""
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    user = auth_module.authenticate(username, password)
    if user is None:
        return jsonify({'status': 'error', 'message': 'Invalid username or password.'}), 401

    token = auth_module.generate_token(user['id'])
    return jsonify({'status': 'success', 'token': token, 'user': {
        'id': user['id'],
        'username': user['username'],
        'is_admin': user['is_admin'],
    }})


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    """Invalidate the current session token."""
    token = _extract_token()
    if token:
        auth_module.revoke_token(token)
    return jsonify({'status': 'success', 'message': 'Logged out.'})


@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    """Return the current authenticated user's info."""
    user = _get_user()
    return jsonify({'status': 'success', 'user': user})


# ==========================================
# USER MANAGEMENT (admin only)
# ==========================================

@app.route('/api/users', methods=['GET'])
def users_list():
    """List all users. Admin only."""
    user = _get_user()
    try:
        users = auth_module.list_users(user['id'])
        return jsonify({'status': 'success', 'users': users})
    except PermissionError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 403


@app.route('/api/users', methods=['POST'])
def users_create():
    """Create a new regular user. Admin only."""
    user = _get_user()
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    try:
        new_user = auth_module.create_user(username, password, user['id'])
        return jsonify({'status': 'success', 'user': new_user}), 201
    except PermissionError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 403
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/api/users/<int:target_user_id>', methods=['DELETE'])
def users_delete(target_user_id: int):
    """
    Permanently delete a user and all their data.
    Admin only. Requires 'confirm_username' in request body as double confirmation.
    """
    user = _get_user()
    data = request.json or {}
    confirm_username = data.get('confirm_username', '').strip()

    # Fetch the target user to verify the confirmation string
    target = auth_module.get_user_by_id(target_user_id)
    if target is None:
        return jsonify({'status': 'error', 'message': 'User not found.'}), 404

    if confirm_username.lower() != target['username'].lower():
        return jsonify({
            'status': 'error',
            'message': 'Confirmation username does not match. Please type the exact username to confirm deletion.'
        }), 400

    try:
        auth_module.delete_user(target_user_id, user['id'])
        return jsonify({'status': 'success', 'message': f"User '{target['username']}' permanently deleted."})
    except PermissionError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 403
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


# ==========================================
# WORKSPACE MANAGEMENT
# ==========================================

@app.route('/api/workspaces', methods=['GET'])
def workspaces_list():
    """List all workspaces belonging to the current user."""
    user = _get_user()
    workspaces = workspace_module.list_workspaces(user['username'])
    external_paths_enabled = os.environ.get(
        'BIOMOL_ALLOW_EXTERNAL_WORKSPACES', ''
    ).lower() in {'1', 'true', 'yes'}
    return jsonify({
        'status': 'success',
        'workspaces': workspaces,
        'external_paths_enabled': external_paths_enabled,
    })


@app.route('/api/workspaces', methods=['POST'])
def workspaces_create():
    """Create a new workspace for the current user."""
    user = _get_user()
    data = request.json or {}
    name = data.get('name', '').strip()

    try:
        storage_parent = data.get('storage_parent')
        external_paths_enabled = os.environ.get(
            'BIOMOL_ALLOW_EXTERNAL_WORKSPACES', ''
        ).lower() in {'1', 'true', 'yes'}
        if storage_parent and not external_paths_enabled:
            raise ValueError(
                'Custom workspace folders are disabled in this process. '
                'If you are running locally, restart the application with ./start.sh.'
            )
        ws = workspace_module.create_workspace(user['username'], name, storage_parent)
        return jsonify({'status': 'success', 'workspace': ws}), 201
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400


@app.route('/api/workspaces/<string:name>', methods=['DELETE'])
def workspaces_delete(name: str):
    """Delete a workspace and all its contents permanently."""
    user = _get_user()
    try:
        workspace_module.delete_workspace(user['username'], name)
        return jsonify({'status': 'success', 'message': f"Workspace '{name}' deleted."})
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 404


@app.route('/api/workspaces/import-dataset', methods=['POST'])
def workspace_import_dataset():
    """Import a validated PDB/ChEMBL dataset into the active workspace."""
    user = _get_user()
    workspace_name = request.headers.get('X-Workspace', '').strip()
    if not workspace_name:
        return jsonify({
            'status': 'error',
            'message': 'Selecione o workspace que receberá o dataset.',
            'issues': [{
                'path': 'workspace',
                'reason': 'O cabeçalho X-Workspace não foi informado.',
                'code': 'missing_workspace',
            }],
        }), 400
    if not workspace_module.workspace_exists(user['username'], workspace_name):
        return jsonify({
            'status': 'error',
            'message': 'O workspace selecionado não existe ou não pertence ao usuário.',
            'issues': [{
                'path': workspace_name,
                'reason': 'Workspace não encontrado para o usuário autenticado.',
                'code': 'workspace_not_found',
            }],
        }), 404

    content_length = request.content_length
    if content_length is not None and content_length > dataset_import_module.MAX_IMPORT_BYTES:
        return jsonify({
            'status': 'error',
            'message': 'O dataset excede o limite total permitido.',
            'issues': [{
                'path': 'datasets',
                'reason': f'O limite por importação é {dataset_import_module.MAX_IMPORT_BYTES} bytes.',
                'code': 'dataset_too_large',
            }],
        }), 413

    files = request.files.getlist('files')
    relative_paths = request.form.getlist('relative_paths')
    empty_directories = request.form.getlist('empty_directories')
    if len(files) != len(relative_paths):
        return jsonify({
            'status': 'error',
            'message': 'O manifesto do upload está incompleto.',
            'issues': [{
                'path': 'datasets',
                'reason': 'A quantidade de arquivos não corresponde à quantidade de caminhos enviados.',
                'code': 'manifest_mismatch',
            }],
        }), 400

    uploads = [
        dataset_import_module.UploadItem(relative_path=relative_path, stream=file.stream)
        for file, relative_path in zip(files, relative_paths, strict=True)
    ]
    try:
        result = dataset_import_module.import_dataset(
            workspace_module.resolve_workspace_path(user['username'], workspace_name),
            uploads,
            empty_directories=empty_directories,
        )
        return jsonify({
            'status': 'success',
            'message': 'Dataset importado com segurança.',
            **result,
        }), 201
    except dataset_import_module.DatasetImportError as exc:
        return jsonify({
            'status': 'error',
            'message': str(exc),
            'issues': [issue.as_dict() for issue in exc.issues],
        }), 400
    except OSError as exc:
        app.logger.exception('Dataset import failed due to a filesystem error')
        return jsonify({
            'status': 'error',
            'message': 'Não foi possível gravar o dataset no workspace.',
            'issues': [{
                'path': 'datasets',
                'reason': exc.strerror or str(exc),
                'code': 'filesystem_error',
            }],
        }), 500


@app.route('/api/admin/workspaces', methods=['GET'])
def admin_workspaces_list():
    """List workspaces for all users. Admin read-only view."""
    user = _get_user()
    if not user.get('is_admin'):
        return jsonify({'status': 'error', 'message': 'Admin access required.'}), 403
    all_ws = workspace_module.list_all_workspaces()
    return jsonify({'status': 'success', 'workspaces': all_ws})



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


@app.route('/api/filesystem/native-picker', methods=['GET', 'POST'])
def native_folder_picker():
    """
    Open a native directory chooser on the local BioMolExplorer machine.

    The route is intentionally unavailable to hosted or non-loopback clients:
    opening an OS dialog is a privileged local-desktop operation.
    """
    external_paths_enabled = os.environ.get(
        'BIOMOL_ALLOW_EXTERNAL_WORKSPACES', ''
    ).lower() in {'1', 'true', 'yes'}
    local_client = request.headers.get('X-BioMol-Local-Client') == '1'
    if not external_paths_enabled:
        return jsonify({
            'status': 'error',
            'message': 'Restart the local application with ./start.sh before choosing a folder.',
        }), 403
    if not local_client:
        return jsonify({
            'status': 'error',
            'message': 'The system folder picker is available only on the local application.',
        }), 403

    initial_dir = request.args.get('initial_dir', str(Path.home()))
    if not os.path.isdir(initial_dir):
        initial_dir = str(Path.home())

    import subprocess
    if shutil.which('zenity'):
        command = [
            'zenity', '--file-selection', '--directory',
            f'--filename={initial_dir}/',
            '--title=Escolha onde criar o workspace — BioMolExplorer',
        ]
    elif shutil.which('kdialog'):
        command = [
            'kdialog', '--getexistingdirectory', initial_dir,
            '--title', 'Escolha onde criar o workspace — BioMolExplorer',
        ]
    else:
        return jsonify({
            'status': 'error',
            'message': 'No supported system folder picker was found (zenity or kdialog).',
        }), 501

    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=600,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return jsonify({'status': 'error', 'message': 'Folder selection timed out.'}), 408
    except OSError as exc:
        return jsonify({'status': 'error', 'message': f'Could not open the system folder picker: {exc}'}), 500

    selected_path = result.stdout.strip() if result.returncode == 0 else ''

    if selected_path:
        return jsonify({'status': 'ok', 'path': selected_path})
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
    status = _task_for_current_scope(task_id)
    if status is None:
        return jsonify({'status': 'not_found', 'message': 'Task not found'}), 404
    return jsonify(_public_task_state(status))


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

        workspace_base_path = str(_get_workspace_path('datasets'))
        task_id = str(uuid.uuid4())
        active_tasks[task_id] = _new_task_state(**{
            'status': 'running',
            'message': f"Loading PDB data for {data.get('target')}...",
            'progress': {'phase': 'Downloading PDB structures...'}
        })

        def worker():
            try:
                warnings = load_pdb(
                    target=data.get('target'),
                    base_output_path=workspace_base_path,
                    pdb_ec=data.get('pdb_ec'),
                    PolymerEntityTypeID=data.get('PolymerEntityTypeID'),
                    ExperimentalMethodID=data.get('ExperimentalMethodID'),
                    max_resolution=data.get('max_resolution'),
                    must_have_ligand=data.get('must_have_ligand', True)
                )
                active_tasks[task_id].update({
                    'status': 'completed',
                    'message': f"PDB data for {data.get('target')} loaded successfully",
                    'warnings': warnings
                })
            except Exception as e:
                print(f"Error in load_pdb async worker: {e}")
                active_tasks[task_id].update({
                    'status': 'error',
                    'message': str(e)
                })

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
    if not os.path.exists(PDB_BASE_PATH()):
        return jsonify({})

    for target_dir in os.listdir(PDB_BASE_PATH()):
        target_path = os.path.join(PDB_BASE_PATH(), target_dir)
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

    file_path = os.path.join(PDB_BASE_PATH(), target, csv_file)
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
    target_dir = os.path.join(PDB_BASE_PATH(), target)
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

    file_path = os.path.join(PDB_BASE_PATH(), target, csv_file)
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

    file_path = os.path.join(PDB_BASE_PATH(), target, csv_file)
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
    target_dir = os.path.join(PDB_BASE_PATH(), target)
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

    file_path = os.path.join(PDB_BASE_PATH(), target, pdb_file)
    
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

    file_path = os.path.join(PDB_BASE_PATH(), target, pdb_file)
    target_dir = os.path.join(PDB_BASE_PATH(), target)
    
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

    target_dir_path = os.path.join(PDB_BASE_PATH(), target)
    
    try:
        if os.path.exists(target_dir_path) and os.path.isdir(target_dir_path):
            shutil.rmtree(target_dir_path) # Remove the entire folder and its contents
            
            # Also remove docking results if the PDB target is deleted
            docking_dir = os.path.join(_results_path(), 'docking', target)
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
    """Validate request-scoped filters and start the ChEMBL crawler."""
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
        if not target_name or not isinstance(target_name, str) or len(target_name.strip()) == 0:
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

        workspace_base_path = str(_get_workspace_path('datasets'))
        task_id = str(uuid.uuid4())
        active_tasks[task_id] = _new_task_state(**{
            'status': 'running',
            'message': f"Loading ChEMBL data for '{target_name}'...",
            'progress': {'phase': 'Scraping ChEMBL & processing molecules...'}
        })

        def worker():
            try:
                last_error = None
                for attempt in range(3):
                    try:
                        load_chembl(
                            target_name=target_name,
                            base_output_path=workspace_base_path,
                            target_filters=dict(target_data),
                            bioactivity_filters=dict(bioactivity_data),
                            molecule_filters=dict(molecules_data),
                            similar_filters=dict(similarmols_data),
                        )
                        last_error = None
                        break
                    except Exception as exc:
                        last_error = exc
                        error_text = str(exc).lower()
                        transient = any(marker in error_text for marker in (
                            'status 429', 'status 500', 'status 502', 'status 503', 'status 504',
                            '/spore', 'connection', 'timed out', 'temporarily unavailable',
                        ))
                        if not transient or attempt == 2:
                            raise
                        active_tasks[task_id]['progress'] = {
                            'phase': f'ChEMBL temporarily unavailable; retrying ({attempt + 2}/3)...'
                        }
                        time.sleep(2 ** attempt)
                if last_error is not None:
                    raise last_error
                active_tasks[task_id].update({
                    'status': 'completed',
                    'message': f"ChEMBL data for '{target_name}' loaded successfully!"
                })
            except Exception as e:
                print(f"Error in load_chembl async worker: {e}")
                active_tasks[task_id].update({
                    'status': 'error',
                    'message': str(e)
                })

        threading.Thread(target=worker, daemon=True).start()

        return jsonify({
            'status': 'success',
            'task_id': task_id,
            'message': f"ChEMBL download for '{target_name}' started in background"
        })

    except Exception as e:
        print(e)
        return jsonify({'status': 'error', 'message': str(e)}), 400
        

@app.route('/chembl_files', methods=['GET'])
def get_chembl_list():
    """Lists downloaded ChEMBL files (molecules and similars) grouped by target."""
    chembl_data = {}
    if not os.path.exists(CHEMBL_BASE_PATH()):
        return jsonify(chembl_data)

    sub_dirs = ["molecules", "similars"]
    all_targets = set()

    # First, find all unique target directories across all sub-directories
    for sub_dir in sub_dirs:
        sub_dir_path = os.path.join(CHEMBL_BASE_PATH(), sub_dir)
        if os.path.isdir(sub_dir_path):
            for target_name in os.listdir(sub_dir_path):
                if os.path.isdir(os.path.join(sub_dir_path, target_name)):
                    all_targets.add(target_name)

    # Now, build the nested dictionary
    for target in sorted(list(all_targets)):
        chembl_data[target] = {"molecules": [], "similars": []}
        
        for sub_dir in sub_dirs:
            target_path = os.path.join(CHEMBL_BASE_PATH(), sub_dir, target)
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

    file_path = os.path.join(CHEMBL_BASE_PATH(), sub_dir_name, target, csv_file)
    
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
                target_dir = os.path.join(CHEMBL_BASE_PATH(), sub_dir, target)
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

    target_dir = os.path.join(CHEMBL_BASE_PATH(), sub_dir_name, target)

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

    target_dir = os.path.join(CHEMBL_BASE_PATH(), sub_dir_name, target)

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
            target_dir = os.path.join(CHEMBL_BASE_PATH(), sub_dir_name, target)
            if os.path.isdir(target_dir):
                shutil.rmtree(target_dir)
                deleted_something = True
                
        # 2. Delete DrugBank consolidated files
        for suffix in ['_MOLS.csv', '_SIMS.csv', '_FULL.csv']:
            drugbank_file = os.path.join(DRUGBANK_PATH(), f"{target}{suffix}")
            if os.path.exists(drugbank_file):
                os.remove(drugbank_file)
                deleted_something = True
                
        # 3. Delete ADMET results
        if os.path.isdir(ADMET_BASE_PATH()):
            for fname in os.listdir(ADMET_BASE_PATH()):
                if fname.startswith(f"{target}_") or fname == target:
                    fpath = os.path.join(ADMET_BASE_PATH(), fname)
                    if os.path.isdir(fpath):
                        shutil.rmtree(fpath)
                    else:
                        os.remove(fpath)
                    deleted_something = True
                    
        # 4. Delete Graph Cache
        input_dir = next((p for p in input_root.iterdir() if p.is_dir() and p.name.replace(" ", "").lower() == target_normalized), None) if input_root.is_dir() else None
        source_file = None
        if input_dir is not None:
            candidate = input_dir / f"{input_dir.name}_{dataset_type}.csv"
            if candidate.is_file(): source_file = candidate
        if source_file is None:
            candidate = legacy_root / f"{target}_{dataset_type}.csv"
            if candidate.is_file(): source_file = candidate
        if source_file is None:
            return jsonify({"success": False, "needs_processing": True, "message": f"No molecular data found for {target} in this workspace."}), 404

        maxcomp_dir = os.path.join(_results_path(), 'grafos', 'data', 'maxcomp')
        if os.path.isdir(maxcomp_dir):
            for fname in os.listdir(maxcomp_dir):
                if fname.startswith(f"Tanimoto_morgan_{target}_"):
                    os.remove(os.path.join(maxcomp_dir, fname))
                    deleted_something = True
                    
        # 5. Delete Docking results
        docking_dir = os.path.join(_results_path(), 'docking', target)
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

    file_path = os.path.join(CHEMBL_BASE_PATH(), sub_dir_name, target, csv_file)
    
    try:
        # Identify the molecule ID (e.g., CHEMBL123) from the filename
        molecule_id = os.path.splitext(csv_file)[0].strip()

        if os.path.exists(file_path):
            # 1. Remove the specific .csv file
            os.remove(file_path)
            
            # 2. Cascade delete: Search and remove the ID from all CSVs in ChEMBL related folders for this target
            search_dirs = [
                os.path.join(CHEMBL_BASE_PATH(), 'molecules', target),
                os.path.join(CHEMBL_BASE_PATH(), 'similars', target),
                os.path.join(CHEMBL_BASE_PATH(), 'bioactivity', target),
                DRUGBANK_PATH(),
                ADMET_BASE_PATH(),
                os.path.join(_results_path(), 'docking', target)
            ]
            
            for directory in search_dirs:
                if os.path.exists(directory) and os.path.isdir(directory):
                    for filename in os.listdir(directory):
                        # Optimize for DrugBank and ADMET: only check files related to the target
                        if directory in [DRUGBANK_PATH(), ADMET_BASE_PATH()] and not filename.startswith(f"{target}_"):
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
            target_path = os.path.join(CHEMBL_BASE_PATH(), sub_dir_name, target)
            if os.path.exists(target_path) and not os.listdir(target_path):
                 os.rmdir(target_path) 
                 
            # 3. Delete Graph Cache to force re-generation without the deleted molecule
        input_dir = next((p for p in input_root.iterdir() if p.is_dir() and p.name.replace(" ", "").lower() == target_normalized), None) if input_root.is_dir() else None
        source_file = None
        if input_dir is not None:
            candidate = input_dir / f"{input_dir.name}_{dataset_type}.csv"
            if candidate.is_file(): source_file = candidate
        if source_file is None:
            candidate = legacy_root / f"{target}_{dataset_type}.csv"
            if candidate.is_file(): source_file = candidate
        if source_file is None:
            return jsonify({"success": False, "needs_processing": True, "message": f"No molecular data found for {target} in this workspace."}), 404

            maxcomp_dir = os.path.join(_results_path(), 'grafos', 'data', 'maxcomp')
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

        if not file.filename.lower().endswith('.uri'):
             return jsonify({'status': 'error', 'message': 'File must be a .uri file'}), 400

        # 2. The model is explicit in the UI. Keep the filename inference only
        # for compatibility with clients released before the selector existed.
        filename_original = file.filename
        workspace_base_path = str(_get_workspace_path('datasets/ZINC'))
        model = request.form.get('model', '').strip().upper()
        if not model:
            model = '2D' if '2D' in filename_original.upper() else '3D' if '3D' in filename_original.upper() else ''
        if model not in {'2D', '3D'}:
            return jsonify({'status': 'error', 'message': 'Select the ZINC model (2D or 3D).'}), 400

        # 3. Get Verbose Parameter
        verbose_flag = request.form.get('verbose') == 'on'

        # 4. Save the uploaded file AND set the flags strictly based on what we actully save
        if not os.path.exists(ZINC_BASE_PATH()):
            os.makedirs(ZINC_BASE_PATH())
            
        target_filename = f"zinc_{model.lower()}.uri"
        
        file_path = os.path.join(ZINC_BASE_PATH(), target_filename)
        
        # Remove arquivo antigo se existir para evitar conflitos
        if os.path.exists(file_path):
            os.remove(file_path)
            
        file.save(file_path)

        # 5. ZINC retrieval can take several minutes, so use the same scoped
        # background-job contract as PDB and ChEMBL.
        task_id = str(uuid.uuid4())
        active_tasks[task_id] = _new_task_state(**{
            'status': 'running',
            'message': f'Processing ZINC {model} data...',
            'progress': {'phase': f'Downloading ZINC {model} compounds...'}
        })

        def worker():
            try:
                load_zinc(
                    base_output_path=workspace_base_path,
                    filename=target_filename,
                    verbose=verbose_flag
                )
                active_tasks[task_id].update({
                    'status': 'completed',
                    'message': f'ZINC {model} data loaded successfully.'
                })
            except requests.exceptions.ConnectionError:
                active_tasks[task_id].update({
                    'status': 'error',
                    'message': 'The ZINC server (files.docking.org) is unavailable. Please try again later.'
                })
            except Exception as exc:
                app.logger.exception('ZINC worker failed')
                active_tasks[task_id].update({'status': 'error', 'message': str(exc)})

        threading.Thread(target=worker, daemon=True).start()
        return jsonify({
            'status': 'success',
            'task_id': task_id,
            'message': f'ZINC {model} processing started in background.'
        }), 202

    except Exception as e:
        print(f"ZINC Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
    

@app.route('/zinc_files', methods=['GET'])
def get_zinc_list():
    """Lists files in the ZINC dataset directory. Deprecated or used as fallback."""
    files = []
    if os.path.exists(ZINC_BASE_PATH()):
        for f in sorted(os.listdir(ZINC_BASE_PATH())):
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
    if os.path.exists(ZINC_BASE_PATH()):
        for f in sorted(os.listdir(ZINC_BASE_PATH())):
            if f.endswith('.csv'): # Process only CSVs
                file_path = os.path.join(ZINC_BASE_PATH(), f)
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
            if os.path.exists(ZINC_BASE_PATH()):
                for filename in os.listdir(ZINC_BASE_PATH()):
                    if filename.endswith('.csv') or filename.endswith('.uri'):
                        zf.write(os.path.join(ZINC_BASE_PATH(), filename), arcname=filename)
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
         
    file_path = os.path.join(ZINC_BASE_PATH(), filename)
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True)
    return jsonify({'status': 'error', 'message': 'File not found'}), 404

@app.route('/delete_zinc', methods=['POST'])
def delete_zinc():
    data = request.get_json(silent=True) or {}
    zinc_dir = Path(ZINC_BASE_PATH())
    try:
        if data.get('clear_all') is True:
            deleted = []
            if zinc_dir.is_dir():
                for entry in zinc_dir.iterdir():
                    if entry.is_file() and entry.suffix.lower() in {'.csv', '.uri'}:
                        entry.unlink()
                        deleted.append(entry.name)
            return jsonify({'status': 'success', 'message': 'ZINC dataset cleared.', 'deleted': deleted})

        filename = data.get('filename', '')
        if not filename:
            return jsonify({'status': 'error', 'message': 'Filename not specified'}), 400
        if Path(filename).name != filename or Path(filename).suffix.lower() not in {'.csv', '.uri'}:
            return jsonify({'status': 'error', 'message': 'Invalid ZINC filename'}), 400

        file_path = zinc_dir / filename
        if file_path.is_file():
            file_path.unlink()
            return jsonify({'status': 'success', 'message': f'{filename} deleted successfully'})
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

    file_path = os.path.join(CHEMBL_BASE_PATH(), sub_dir_name, target, csv_file)

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

    file_path = os.path.join(PDB_BASE_PATH(), target, pdb_file)
    
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

    # Use PDB_BASE_PATH() which should be '.../datasets/PDB'
    target_dir = os.path.join(PDB_BASE_PATH(), target_name)
    
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
    data = request.get_json(silent=True) or {}
    target = str(data.get('target', '')).strip()
    if not target:
        return jsonify({'success': False, 'code': 'target_required', 'message': 'Select a target before processing similarity.'}), 400

    try:
        workspace_root = _get_workspace_path()
        input_dir, metadata = prepare_inputs(workspace_root, target)
    except SimilarityInputError as exc:
        return jsonify({'success': False, 'code': 'input_unavailable', 'message': str(exc)}), 422
    except Exception:
        app.logger.error('Could not prepare similarity inputs', exc_info=True)
        return jsonify({'success': False, 'code': 'input_preparation_failed', 'message': 'Could not prepare molecular data for similarity.'}), 500

    task_id = str(uuid.uuid4())
    active_tasks[task_id] = _new_task_state(**{
        'status': 'running', 'message': f"Preparing similarity network for '{target}'...",
        'progress': {'phase': 'Generating molecular fingerprints'}, 'target': target, 'dataset': metadata,
    })
    graph_output_path = workspace_root / 'resultados' / 'grafos'

    def worker():
        try:
            generate_fingerprints(base_input_path=str(input_dir), morgan=True, maccs=True, pharmacophore=True)
            active_tasks[task_id]['progress'] = {'phase': 'Calculating Tanimoto similarities'}
            compute_similarity(base_input_path=str(input_dir / 'Fingerprints'), base_output_path=str(input_dir), metric=similarityFunctions.TanimotoSimilarity, fingerprint=fingerprints.Morgan)
            active_tasks[task_id]['progress'] = {'phase': 'Building graph components'}
            analyze_graphs(base_input_path=str(input_dir), base_output_path=str(graph_output_path), metric=similarityFunctions.TanimotoSimilarity, fingerprint=fingerprints.Morgan)
            active_tasks[task_id].update({'status': 'completed', 'message': 'Similarity graph is ready.'})
        except Exception:
            app.logger.error('Error processing similarity graphs', exc_info=True)
            active_tasks[task_id].update({'status': 'error', 'code': 'processing_failed', 'message': 'Similarity processing failed. Check the server logs for details.'})

    threading.Thread(target=worker, daemon=True).start()
    return jsonify({'success': True, 'task_id': task_id, 'message': 'Similarity processing started.', 'dataset': metadata}), 202


@app.route('/api/analysis/targets', methods=['GET'])
def get_similarity_targets():
    """List targets with molecular inputs in the active workspace."""
    return jsonify({'success': True, 'targets': similarity_targets(_chembl_path())})

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

        # Current workspace data is materialized under resultados/similarity/inputs.
        # DrugBank remains supported only as a legacy fallback.
        workspace_root = _get_workspace_path()
        input_root = workspace_root / "resultados" / "similarity" / "inputs"
        legacy_root = _drugbank_path()

        dataset_type = request.args.get('datasetType', 'MOLS')
        if dataset_type not in ["MOLS", "SIMS"]:
            dataset_type = "MOLS"
        graph_view = request.args.get("view", "strongest")
        if graph_view not in ["strongest", "full"]:
            graph_view = "strongest"

        # --- 1. Load Processed Data & Check if Outdated ---
        outdated = False
        target_normalized = target.replace(" ", "").lower()
        
        # Check source files (MOLS and SIMS)
        source_mols = None
        source_sims = None
        if os.path.exists(str(legacy_root)):
            for f in os.listdir(str(legacy_root)):
                if f.endswith('_MOLS.csv') and f.replace('_MOLS.csv', '').replace(' ', '').lower() == target_normalized:
                    source_mols = os.path.join(str(legacy_root), f)
                elif f.endswith('_SIMS.csv') and f.replace('_SIMS.csv', '').replace(' ', '').lower() == target_normalized:
                    source_sims = os.path.join(str(legacy_root), f)

        input_dir = next((p for p in input_root.iterdir() if p.is_dir() and p.name.replace(" ", "").lower() == target_normalized), None) if input_root.is_dir() else None
        source_file = None
        if input_dir is not None:
            candidate = input_dir / f"{input_dir.name}_{dataset_type}.csv"
            if candidate.is_file(): source_file = candidate
        if source_file is None:
            candidate = legacy_root / f"{target}_{dataset_type}.csv"
            if candidate.is_file(): source_file = candidate
        if source_file is None:
            return jsonify({"success": False, "needs_processing": True, "message": f"No molecular data found for {target} in this workspace."}), 404

        maxcomp_dir = os.path.join(_results_path(), 'grafos', 'data', 'maxcomp')
        csv_file = None
        correct_alvo = target # fallback
        if graph_view == 'full':
            candidate = os.path.join(str(input_dir), 'Similarity', f'Tanimoto_morgan_{input_dir.name}_{dataset_type}.csv')
            if os.path.isfile(candidate):
                csv_file = candidate
                correct_alvo = input_dir.name
        
        elif os.path.exists(maxcomp_dir):
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
            if source_file.is_file() and source_file.stat().st_mtime > generated_mtime:
                outdated = True
                    
        if outdated:
            return jsonify({'success': False, 'needs_processing': True, 'message': f'Graph data needs to be calculated for {target}.'}), 404

            
        # Read edges (source, target, value)
        edges_df = pd.read_csv(csv_file)
        
        # Read molecule data (to map ID -> SMILES) flexibly
        mols_file = str(source_file)
        
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
                full_graph_file = os.path.join(str(input_dir), 'Similarity', filename)
                if not os.path.exists(full_graph_file):
                    full_graph_file = os.path.join(str(_results_path()), 'grafos', 'data', 'Similarity', filename)
                if not os.path.exists(full_graph_file):
                    full_graph_file = os.path.join(str(_drugbank_path()), 'Similarity', filename)
                
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
                'fullGraphDegrees': full_graph_degrees,
                'view': graph_view,
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
        plots_dir = os.path.join(_results_path(), 'grafos', 'plots')
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
            
        file_path = os.path.join(_results_path(), 'grafos', 'plots', filename)
        
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

def redocking_worker(task_id, target, charge_type, prepare_complex, workspace_root, task_scope):
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
    
    results_path = os.path.join(workspace_root, 'resultados')
    pdb_path = os.path.join(workspace_root, 'datasets', 'PDB')
    out_dir = os.path.join(results_path, 'redocking', target.replace(' ', ''))
    in_dir = os.path.join(pdb_path, target.replace(' ', ''))

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
            **task_scope,
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
            base_input_path=pdb_path,
            target=target,
            base_output_path=os.path.join(results_path, 'redocking'),
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
    if not os.path.exists(PDB_BASE_PATH()):
        return jsonify([])

    targets = []
    for target_dir in os.listdir(PDB_BASE_PATH()):
        target_path = os.path.join(PDB_BASE_PATH(), target_dir)
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

    if not target or any(separator in target for separator in ('..', '/', '\\')):
        return jsonify({'status': 'error', 'message': 'Invalid target'}), 400

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
    workspace_root = str(_get_workspace_path())
    thread = threading.Thread(
        target=redocking_worker,
        args=(
            task_id,
            target,
            charge_type,
            prepare_complex,
            workspace_root,
            {
                '_owner': _get_user()['username'],
                '_workspace': request.headers.get('X-Workspace', '').strip(),
            },
        ),
    )
    thread.start()

    return jsonify({'status': 'success', 'task_id': task_id})


@app.route('/api/redocking/status/<task_id>', methods=['GET'])
def get_redocking_status(task_id):
    status = _task_for_current_scope(task_id)
    if status is None:
        return jsonify({'status': 'not_found', 'message': 'Task not found'})
    return jsonify({**status, 'logs': task_logs.get(task_id, "")})


def finalize_partial_rmsd(target_name):
    """Calculates RMSD for any existing docked .lig.pdbqt partial results and saves into pdb_codes.csv."""
    if not target_name:
        return
    try:
        from kernel.descriptors import Descriptors
        desc = Descriptors()
        target_clean = target_name.replace(' ', '')
        in_dir = os.path.join(_pdb_path(), target_clean)
        out_dir = os.path.join(_results_path(), 'redocking', target_clean)
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
    task = _task_for_current_scope(task_id)
    if task and task.get('status') == 'running':
            task['status'] = 'cancelled'
            task['message'] = 'Stopping redocking and saving partial results...'
            ActiveSubprocesses.kill_by_task_id(task_id)
            ActiveSubprocesses._kill_orphans()
            target_name = task.get('target')
            finalize_partial_rmsd(target_name)
            return jsonify({'success': True, 'message': 'Cancellation requested and partial results saved'})
    return jsonify({'success': False, 'message': 'Task not running or not found'}), 404


@app.route('/api/redocking/results', methods=['GET'])
def list_redocking_results():
    """Lists targets that have redocking results (pdb_codes.csv with RMSD)."""
    results = []
    if not os.path.exists(PDB_BASE_PATH()):
        return jsonify([])

    for target_dir in os.listdir(PDB_BASE_PATH()):
        csv_path = os.path.join(PDB_BASE_PATH(), target_dir, 'pdb_codes.csv')
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
    csv_path = os.path.join(PDB_BASE_PATH(), target, 'pdb_codes.csv')
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
    csv_path = os.path.join(PDB_BASE_PATH(), target, 'pdb_codes.csv')
    if not os.path.exists(csv_path):
        return jsonify({'status': 'error', 'message': 'Results not found'}), 404
    
    return send_file(csv_path, as_attachment=True, download_name=f'redocking_results_{target}.csv')

# ==========================================
# ADMET ROUTES
# ==========================================

# Dictionary to store ADMET task logs
admet_task_logs = {}

def _admet_target_variants(target: str) -> list[str]:
    return list(dict.fromkeys(v for v in (target, target.replace(' ', '')) if v))


def _raw_admet_csvs(base_path: str, category: str, target: str) -> list[str]:
    paths = []
    for variant in _admet_target_variants(target):
        target_dir = os.path.join(base_path, category, variant)
        if not os.path.isdir(target_dir):
            continue
        paths.extend(
            os.path.join(target_dir, name)
            for name in sorted(os.listdir(target_dir))
            if name.lower().endswith('.csv') and os.path.isfile(os.path.join(target_dir, name))
        )
    return list(dict.fromkeys(paths))


def _load_raw_admet_group(paths: list[str]) -> pd.DataFrame:
    frames = []
    for path in paths:
        try:
            frame = pd.read_csv(path)
        except (OSError, ValueError, pd.errors.ParserError):
            continue
        if 'molecule_chembl_id' not in frame.columns:
            continue
        if 'canonical_smiles' not in frame.columns and 'molecule_structures' not in frame.columns:
            continue
        frames.append(frame)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True).drop_duplicates(subset=['molecule_chembl_id'])


def _ensure_admet_group_files(workspace_root: str, target: str) -> bool:
    drugbank_path = os.path.join(workspace_root, 'datasets', 'ChEMBL', 'DrugBank')
    os.makedirs(drugbank_path, exist_ok=True)
    if any(os.path.isfile(os.path.join(drugbank_path, f'{target}_{suffix}.csv'))
           for suffix in ('MOLS', 'SIMS', 'FULL')):
        return True
    chembl_path = os.path.join(workspace_root, 'datasets', 'ChEMBL')
    mols = _load_raw_admet_group(_raw_admet_csvs(chembl_path, 'molecules', target))
    sims = _load_raw_admet_group(_raw_admet_csvs(chembl_path, 'similars', target))
    if mols.empty and sims.empty:
        return False
    if not mols.empty and not sims.empty:
        sims = sims[~sims['molecule_chembl_id'].isin(set(mols['molecule_chembl_id']))]
    groups = {'MOLS': mols, 'SIMS': sims}
    groups['FULL'] = pd.concat([f for f in (mols, sims) if not f.empty], ignore_index=True)
    groups['FULL'] = groups['FULL'].drop_duplicates(subset=['molecule_chembl_id'])
    for suffix, frame in groups.items():
        if frame.empty:
            continue
        destination = os.path.join(drugbank_path, f'{target}_{suffix}.csv')
        fd, temporary = tempfile.mkstemp(prefix=f'.{target}_{suffix}.', suffix='.csv', dir=drugbank_path)
        os.close(fd)
        try:
            frame.to_csv(temporary, index=False)
            os.replace(temporary, destination)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return True


def _admet_available_targets(workspace_root: str) -> list[str]:
    drugbank_path = os.path.join(workspace_root, 'datasets', 'ChEMBL', 'DrugBank')
    chembl_path = os.path.join(workspace_root, 'datasets', 'ChEMBL')
    targets = set()
    if os.path.isdir(drugbank_path):
        for fname in os.listdir(drugbank_path):
            for suffix in ('_MOLS.csv', '_SIMS.csv', '_FULL.csv'):
                if fname.endswith(suffix):
                    targets.add(fname[:-len(suffix)])
                    break
    for category in ('molecules', 'similars'):
        category_path = os.path.join(chembl_path, category)
        if os.path.isdir(category_path):
            targets.update(name for name in os.listdir(category_path)
                           if os.path.isdir(os.path.join(category_path, name)))
    available = []
    for target in sorted(targets):
        if _ensure_admet_group_files(workspace_root, target):
            available.append(target)
    return available


def admet_worker(task_id: str, target: str, workspace_root: str, input_file: str | None = None):
    """Background worker that runs the ADMET pipeline for a given ChEMBL target.

    Reads the three consolidated DrugBank files:
        {DRUGBANK_PATH()}/{target}_MOLS.csv
        {DRUGBANK_PATH()}/{target}_SIMS.csv
        {DRUGBANK_PATH()}/{target}_FULL.csv

    Writes results to {ADMET_BASE_PATH()}/ (= DrugBank/ADMET/).
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

        # Convert imported raw ChEMBL molecule folders when needed.
        drugbank_path = os.path.join(workspace_root, 'datasets', 'ChEMBL', 'DrugBank')
        output_path = os.path.join(drugbank_path, 'ADMET')
        _ensure_admet_group_files(workspace_root, target)
        found_any = any(
            os.path.isfile(os.path.join(drugbank_path, f"{target}_{sfx}.csv"))
            for sfx in ('MOLS', 'SIMS', 'FULL')
        )
        if not found_any:
            raise FileNotFoundError(
                f"No DrugBank group files found for target '{target}'. "
                f"Expected files like '{target}_MOLS.csv' in {drugbank_path}. "
                f"Please download ChEMBL data first."
            )

        wrapper = ADMETWrapper(
            drugbank_path=drugbank_path,
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
    workspace_root = str(_get_workspace_path())
    thread = threading.Thread(
        target=admet_worker,
        args=(task_id, target, workspace_root, None),
    )
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
    if not os.path.isdir(ADMET_BASE_PATH()):
        return jsonify([])

    for fname in os.listdir(ADMET_BASE_PATH()):
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

    if not os.path.isdir(ADMET_BASE_PATH()):
        return jsonify({'status': 'error', 'message': 'No ADMET results found'}), 404

    groups = []
    for suffix in ('MOLS', 'SIMS', 'FULL'):
        csv_path = _find_matching_admet_csv(ADMET_BASE_PATH(), target, suffix)
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

    file_path = os.path.join(ADMET_BASE_PATH(), filename)
    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': 'Plot not found'}), 404

    return send_file(file_path, mimetype='image/png')


@app.route('/api/admet/plots/<target>', methods=['GET'])
def list_admet_plots(target):
    """Lists available BOILED-Egg PNG plots for a given target from DrugBank/ADMET/."""
    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid target'}), 400

    if not os.path.isdir(ADMET_BASE_PATH()):
        return jsonify([])

    plots = sorted([
        f for f in os.listdir(ADMET_BASE_PATH())
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

    csv_path = os.path.join(ADMET_BASE_PATH(), f"{target}_{group}.csv")
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
    DrugBank group file (_MOLS.csv / _SIMS.csv / _FULL.csv) in DRUGBANK_PATH().
    """
    return jsonify(_admet_available_targets(str(_get_workspace_path())))


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
            return str(_zinc_path())
        return str(_admet_path())

    path = custom_base_mols
    if not os.path.isabs(path):
        # Relative selections always belong to the active workspace.
        path = os.path.join(str(_get_workspace_path()), path)

    # Auto-correct if user selected a subdirectory (e.g. .../ADMET/Molecules) where CSV files are in parent directory
    if os.path.exists(path) and os.path.isdir(path):
        has_csv = any(f.endswith('.csv') for f in os.listdir(path))
        if not has_csv:
            parent_dir = os.path.dirname(path)
            if os.path.exists(parent_dir) and os.path.isdir(parent_dir):
                if any(f.endswith('.csv') for f in os.listdir(parent_dir)):
                    path = parent_dir

    return path


def docking_worker(
    task_id: str,
    target: str,
    pdb_code,
    library: str,
    dock_kwargs: dict,
    workspace_root: str,
    task_scope: dict,
):
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

    base_output_path = os.path.join(workspace_root, 'resultados', 'docking')

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
        **task_scope,
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
        base_input_path = os.path.join(workspace_root, 'datasets', 'PDB')

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
            target_dir = target.replace(' ', '')
            if not target_pdb_id:
                best = get_better_complex(os.path.join(base_input_path, target_dir) + '/')
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
            best = get_better_complex(os.path.join(base_input_path, target.replace(' ', '')) + '/')
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
        target_path = os.path.join(PDB_BASE_PATH(), target)

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

    if (not target or any(separator in target for separator in ('..', '/', '\\'))
            or not pdb_code):
        return jsonify({'status': 'error', 'message': 'Invalid target or pdb_code'}), 400

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
    workspace_root = str(_get_workspace_path())
    thread = threading.Thread(
        target=docking_worker,
        args=(
            task_id,
            target,
            pdb_code,
            library,
            {**dock_kwargs, 'mol_filename': mol_filename, 'base_selected_mols': effective_base_mols},
            workspace_root,
            {
                '_owner': _get_user()['username'],
                '_workspace': request.headers.get('X-Workspace', '').strip(),
            },
        ),
        daemon=True
    )
    thread.task_id = task_id
    thread.start()

    return jsonify({'status': 'success', 'task_id': task_id})


@app.route('/api/docking/status/<task_id>', methods=['GET'])
def get_docking_status(task_id):
    """Returns the current status and live logs of a running docking task."""
    status = _task_for_current_scope(task_id)
    if status is None:
        return jsonify({'status': 'not_found', 'message': 'Task not found'})
    return jsonify({**status, 'logs': docking_task_logs.get(task_id, '')})


@app.route('/api/docking/cancel/<task_id>', methods=['POST'])
def cancel_docking_task(task_id):
    """Cancels a running docking task and generates partial results."""
    task = _task_for_current_scope(task_id)
    if task and task.get('status') == 'running':
            task['status'] = 'cancelled'
            task['message'] = 'Stopping docking and saving partial results...'
            ActiveSubprocesses.kill_by_task_id(task_id)
            return jsonify({'success': True, 'message': 'Cancellation requested'})
    return jsonify({'success': False, 'message': 'Task not running or not found'}), 404


@app.route('/api/docking/results', methods=['GET'])
def list_docking_results():
    """Lists targets that have a completed docking consensus CSV."""
    docking_base = os.path.join(_results_path(), 'docking')
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

    csv_path = os.path.join(_results_path(), 'docking', target, f"{target}.csv")
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

    file_path = os.path.join(_results_path(), 'docking', target, 'correlation.png')
    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': 'Plot not found'}), 404

    return send_file(file_path, mimetype='image/png')


@app.route('/api/docking/download/<target>', methods=['GET'])
def download_docking_csv(target):
    """Downloads the consensus docking CSV for a given target."""
    if '..' in target:
        return jsonify({'status': 'error', 'message': 'Invalid target'}), 400

    csv_path = os.path.join(_results_path(), 'docking', target, f"{target}.csv")
    if not os.path.exists(csv_path):
        return jsonify({'status': 'error', 'message': 'Results not found'}), 404

    return send_file(csv_path, as_attachment=True, download_name=f'docking_{target}.csv')


if __name__ == '__main__':
    # Enabled debug mode for development hot-reload
    port = int(os.environ.get('PORT', os.environ.get('FLASK_PORT', 5000)))
    app.run(host="127.0.0.1", port=port, debug=True, use_reloader=True)
