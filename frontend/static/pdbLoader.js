document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const pdbForm = document.getElementById('pdb-form');
    const responseElement = document.getElementById('response');
    const pdbListContainer = document.getElementById('pdb-list');

    // DOWNLOADED PDBs 
    const loadAndDisplayPdbFiles = async () => {
        try {
            const response = await fetch('/pdb_files');
            const data = await response.json();

            pdbListContainer.innerHTML = '';

            if (Object.keys(data).length === 0) {
                pdbListContainer.innerHTML = '<p class="empty-list-message">No PDBs downloaded yet.</p>';
                return;
            }

            for (const target in data) {
                const collapsibleContainer = document.createElement('div');
                collapsibleContainer.className = 'collapsible-container';

                const header = document.createElement('button');
                header.className = 'collapsible-header';
                header.innerHTML = `<span class="arrow">&#9654;</span> ${target}`;

                const fileList = document.createElement('ul');
                fileList.className = 'pdb-file-list';

                data[target].forEach(pdbFile => {
                    const listItem = document.createElement('li');
                    listItem.className = 'pdb-file-item';
                    listItem.textContent = pdbFile;

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-btn';
                    deleteBtn.innerHTML = '&#128465;';
                    deleteBtn.title = `Delete ${pdbFile}`;
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        deletePdbFile(target, pdbFile, listItem);
                    };

                    listItem.appendChild(deleteBtn);
                    fileList.appendChild(listItem);
                });

                header.addEventListener('click', () => {
                    header.classList.toggle('active');
                    if (fileList.style.display === 'block') {
                        fileList.style.display = 'none';
                    } else {
                        fileList.style.display = 'block';
                    }
                });

                collapsibleContainer.appendChild(header);
                collapsibleContainer.appendChild(fileList);
                pdbListContainer.appendChild(collapsibleContainer);
            }
        } catch (error) {
            console.error('Error loading PDB list:', error);
            pdbListContainer.innerHTML = '<p class="empty-list-message">Error loading files.</p>';
        }
    };

    // DELETE A PDB
    const delteMessage = (message) => {
        const alertBox = document.createElement('div');
        alertBox.className = 'alert-notification';
        alertBox.textContent = message;

        document.body.appendChild(alertBox);

        setTimeout(() => {
            alertBox.classList.add('show');
        }, 10);

        setTimeout(() => {
            alertBox.classList.remove('show');
            alertBox.addEventListener('transitionend', () => {
                alertBox.remove();
            });
        }, 3000); 
    };

    const deletePdbFile = async (target, pdbFile, listItemElement) => {
        try {
            const response = await fetch('/delete_pdb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target, pdb_file: pdbFile })
            });

            const result = await response.json();

            if (response.ok) {
                delteMessage(`PDB ${pdbFile} was deleted`);
                const fileList = listItemElement.parentNode;
                listItemElement.remove();
                
                if (fileList.children.length === 0) {
                    fileList.parentNode.remove();
                }

            } else {
                alert(`Error when deleting: ${result.message}`);
            }
        } catch (error) {
            console.error('Error in delete request:', error);
            alert('A communication error with the server occurred.');
        }
    };

    // RESULTS MESSAGES
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