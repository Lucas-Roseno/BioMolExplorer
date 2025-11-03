document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const pdbForm = document.getElementById('pdb-form');
    const responseElement = document.getElementById('response');
    const pdbListContainer = document.getElementById('pdb-list');
    const loadingOverlay = document.getElementById('loading-overlay'); // Get the overlay element


    // --- SHOW NOTIFICATION (Função do Pop-up) ---
    const showNotification = (message, type = 'success') => {
        const alertBox = document.createElement('div');
        alertBox.className = 'alert-notification'; // Base class
        alertBox.classList.add(type); // Add type class (success or error)
        alertBox.textContent = message;

        document.body.appendChild(alertBox);

        // Show animation
        setTimeout(() => {
            alertBox.classList.add('show');
        }, 10);

        // Hide and remove after 3 seconds
        setTimeout(() => {
            alertBox.classList.remove('show');
            alertBox.addEventListener('transitionend', () => {
                alertBox.remove();
            });
        }, 3000);
    };


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

                    // Add file name as text
                    const fileNameSpan = document.createElement('span');
                    fileNameSpan.textContent = pdbFile;
                    listItem.appendChild(fileNameSpan);

                    // Create container for action buttons
                    const actionBtnsContainer = document.createElement('div');
                    actionBtnsContainer.className = 'pdb-item-actions';

                    // Download button
                    const downloadBtn = document.createElement('button');
                    downloadBtn.className = 'download-btn';
                    downloadBtn.innerHTML = '&#11015;'; // Download icon
                    downloadBtn.title = `Download ${pdbFile}`;
                    downloadBtn.onclick = (e) => {
                        e.stopPropagation();
                        // Trigger download by hitting the new backend endpoint
                        window.location.href = `/download_pdb/${target}/${pdbFile}`;
                    };

                    // Delete button
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-btn';
                    deleteBtn.innerHTML = '&#128465;'; // Trash icon
                    deleteBtn.title = `Delete ${pdbFile}`;
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        deletePdbFile(target, pdbFile, listItem);
                    };

                    // Append buttons to their container
                    actionBtnsContainer.appendChild(downloadBtn);
                    actionBtnsContainer.appendChild(deleteBtn);

                    // Append button container to list item
                    listItem.appendChild(actionBtnsContainer);
                    fileList.appendChild(listItem);
                });

                header.addEventListener('click', () => {
                    header.classList.toggle('active');
                    const arrow = header.querySelector('.arrow');
                    if (fileList.style.display === 'block') {
                        fileList.style.display = 'none';
                        arrow.style.transform = 'rotate(0deg)';
                    } else {
                        fileList.style.display = 'block';
                        arrow.style.transform = 'rotate(90deg)';
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
    const deletePdbFile = async (target, pdbFile, listItemElement) => {
        try {
            const response = await fetch('/delete_pdb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target, pdb_file: pdbFile })
            });

            const result = await response.json();

            if (response.ok) {
                // Show red error message
                showNotification(`PDB ${pdbFile} was deleted`, 'error');
                const fileList = listItemElement.parentNode;
                listItemElement.remove();

                if (fileList.children.length === 0) {
                    fileList.parentNode.remove();
                }

            } else {
                showNotification(`Error when deleting: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error in delete request:', error);
            showNotification('A communication error with the server occurred.', 'error');
        }
    };

    // --- FORM SUBMISSION ---
    pdbForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        responseElement.textContent = '';
        responseElement.classList.remove('success', 'error', 'loading');
        responseElement.style.display = 'none';

        // Show loading overlay
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }

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
            responseElement.style.display = 'block';

            loadAndDisplayPdbFiles();

        } catch (error) {
            // Mostrar o erro no pop-up vermelho e na caixa de resposta
            responseElement.textContent = error.message;
            responseElement.classList.remove('loading', 'success');
            responseElement.classList.add('error');
            responseElement.style.display = 'block';
            showNotification(error.message, 'error'); // <-- Pop-up de erro vermelho
        } finally {
            // Hide loading overlay
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
        }
    });

    loadAndDisplayPdbFiles();
});