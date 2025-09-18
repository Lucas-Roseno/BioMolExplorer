document.addEventListener('DOMContentLoaded', () => {

    // Elementos do DOM
    const pdbForm = document.getElementById('pdb-form');
    const responseElement = document.getElementById('response');
    const pdbListWrapper = document.getElementById('pdb-list-wrapper');

    const loadAndDisplayPdbFiles = async () => {
        try {
            const response = await fetch('/pdb_files');
            const data = await response.json();

            pdbListWrapper.innerHTML = '';

            if (Object.keys(data).length === 0) {
                pdbListWrapper.innerHTML = '<p class="empty-list-message">Nenhum PDB baixado ainda.</p>';
                return;
            }

            const table = document.createElement('table');
            table.className = 'pdb-table';
            const tbody = document.createElement('tbody');

            for (const target in data) {
                const targetRow = tbody.insertRow();
                targetRow.className = 'target-header-row';
                const targetCell = targetRow.insertCell();
                targetCell.colSpan = 2;
                targetCell.textContent = target;

                data[target].forEach(pdbFile => {
                    const pdbRow = tbody.insertRow();
                    pdbRow.className = 'pdb-file-row';
                    const nameCell = pdbRow.insertCell();
                    const actionCell = pdbRow.insertCell();

                    nameCell.textContent = pdbFile;
                    actionCell.style.textAlign = 'right';

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-btn';
                    deleteBtn.innerHTML = '&#128465;'; // Ícone de lixeira
                    deleteBtn.title = `Deletar ${pdbFile}`;

                    deleteBtn.addEventListener('click', () => deletePdbFile(target, pdbFile));

                    actionCell.appendChild(deleteBtn);
                });
            }

            table.appendChild(tbody);
            pdbListWrapper.appendChild(table);

        } catch (error) {
            console.error('Erro ao carregar lista de PDBs:', error);
            pdbListWrapper.innerHTML = '<p class="empty-list-message">Erro ao carregar arquivos.</p>';
        }
    };

    const deletePdbFile = async (target, pdbFile) => {
        // if (!confirm(`Tem certeza que deseja deletar o arquivo ${pdbFile}?`)) {
        //     return;
        // }

        try {
            const response = await fetch('/delete_pdb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target, pdb_file: pdbFile })
            });

            const result = await response.json();

            if (response.ok) {
                loadAndDisplayPdbFiles();
            } else {
                alert(`Erro ao deletar: ${result.message}`);
            }
        } catch (error) {
            console.error('Erro na requisição para deletar:', error);
            alert('Ocorreu um erro de comunicação com o servidor.');
        }
    };


    pdbForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        responseElement.textContent = 'Procurando arquivos para baixar...';
        responseElement.classList.remove('success', 'error');
        responseElement.classList.add('loading');
        responseElement.style.display = 'block';

        const formData = new FormData(event.target);
        const data = {
            target: formData.get('target'),
            pdb_ec: formData.get('pdb_ec'),
            PolymerEntityTypeID: [formData.get('polymer_entity_type')],
            ExperimentalMethodID: [formData.get('experimental_method')],
            max_resolution: parseFloat(formData.get('max_resolution')),
            must_have_ligand: formData.get('must_have_ligand') === 'on'
        };

        try {
            const response = await fetch('/load_pdb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Ocorreu um erro no servidor.');
            }

            responseElement.textContent = result.message;
            responseElement.classList.remove('loading', 'error');
            responseElement.classList.add('success');

            loadAndDisplayPdbFiles();

        } catch (error) {
            responseElement.textContent = error.message;
            responseElement.classList.remove('loading', 'success');
            responseElement.classList.add('error');
        }
    });

    loadAndDisplayPdbFiles();
});