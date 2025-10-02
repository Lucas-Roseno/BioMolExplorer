document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const pdbForm = document.getElementById('pdb-form');
    const responseElement = document.getElementById('response');
    const pdbListWrapper = document.getElementById('pdb-list-wrapper');

    const loadAndDisplayPdbFiles = async () => {
        try {
            const response = await fetch('/pdb_files');
            const data = await response.json();

            const tabButtonsContainer = document.getElementById('tab-buttons');
            const tabContentWrapper = document.getElementById('tab-content-wrapper');
            tabButtonsContainer.innerHTML = '';
            tabContentWrapper.innerHTML = '';

            if (Object.keys(data).length === 0) {
                tabContentWrapper.innerHTML = '<p class="empty-list-message">No PDBs downloaded yet.</p>';
                return;
            }

            let firstTarget = true;
            for (const target in data) {
                // Cria o botão da aba
                const button = document.createElement('button');
                button.className = 'tablinks';
                button.textContent = target;
                button.onclick = (event) => openTab(event, target);
                tabButtonsContainer.appendChild(button);

                // Cria o conteúdo da aba
                const contentDiv = document.createElement('div');
                contentDiv.id = target;
                contentDiv.className = 'tabcontent';

                const table = document.createElement('table');
                table.className = 'pdb-table'; // Reutilizando a classe da tabela
                const tbody = document.createElement('tbody');

                data[target].forEach(pdbFile => {
                    const row = tbody.insertRow();
                    const nameCell = row.insertCell();
                    const actionCell = row.insertCell();

                    nameCell.textContent = pdbFile;
                    actionCell.style.textAlign = 'right';

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-btn';
                    deleteBtn.innerHTML = '&#128465;';
                    deleteBtn.title = `Delete ${pdbFile}`;
                    deleteBtn.onclick = () => deletePdbFile(target, pdbFile);

                    actionCell.appendChild(deleteBtn);
                });

                table.appendChild(tbody);
                contentDiv.appendChild(table);
                tabContentWrapper.appendChild(contentDiv);

                // Abre a primeira aba por padrão
                if (firstTarget) {
                    button.classList.add('active');
                    contentDiv.style.display = 'block';
                    firstTarget = false;
                }
            }
        } catch (error) {
            console.error('Error loading PDB list:', error);
            document.getElementById('tab-content-wrapper').innerHTML = '<p class="empty-list-message">Error loading files.</p>';
        }
    };

    // Função auxiliar para controlar as abas
    function openTab(evt, targetName) {
        const tabcontent = document.getElementsByClassName('tabcontent');
        for (let i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = 'none';
        }

        const tablinks = document.getElementsByClassName('tablinks');
        for (let i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(' active', '');
        }

        document.getElementById(targetName).style.display = 'block';
        evt.currentTarget.className += ' active';
    }

    const deletePdbFile = async (target, pdbFile) => {
        // if (!confirm(`Are you sure you want to delete the file ${pdbFile}?`)) {
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
                alert(`Error when deleting: ${result.message}`);
            }
        } catch (error) {
            console.error('Error in delete request:', error);
            alert('A communication error with the server occurred.');
        }
    };


    pdbForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        responseElement.textContent = 'Searching for files to download...';
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
                throw new Error(result.message || 'A server error occurred.');
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