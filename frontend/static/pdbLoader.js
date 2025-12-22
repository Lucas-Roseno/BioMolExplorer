document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const pdbForm = document.getElementById('pdb-form');
    const responseElement = document.getElementById('response');
    const pdbListContainer = document.getElementById('pdb-list');
    const loadingOverlay = document.getElementById('loading-overlay'); // Get the overlay element

    const modal = document.getElementById('viewer-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const viewer2DContainer = document.getElementById('viewer-2d-container');
    const viewer3DContainer = document.getElementById('viewer-3d-container');
    const viewer3DCanvas = document.getElementById('viewer-3d-canvas');
    let viewer3D = $3Dmol.createViewer(viewer3DCanvas); // Inicializa o viewer 3D

    modalCloseBtn.onclick = () => {
        modal.style.display = 'none';
        viewer3D.clear();
    };
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
            viewer3D.clear();
        }
    };

    // Create a dedicated close function
    const closeModal = () => {
        modal.style.display = 'none';
        viewer3DCanvas.innerHTML = ''; // Clear the canvas DOM element to destroy the old viewer
    };

    modalCloseBtn.onclick = closeModal;
    window.onclick = (event) => {
        if (event.target == modal) {
            closeModal();
        }
    };


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

    const openPdbModal = async (target, pdbFile) => {
        loadingOverlay.style.display = 'flex';
        modalTitle.textContent = pdbFile;

    
        viewer2DContainer.style.display = 'none';
        viewer3DContainer.style.display = 'block';

        try {
            const response = await fetch(`/get_pdb_content/${target}/${pdbFile}`);
            if (!response.ok) throw new Error('Could not fetch PDB content');
            const pdbData = await response.text();

            let viewer3D = $3Dmol.createViewer(viewer3DCanvas);

            viewer3D.addModel(pdbData, 'pdb');
            viewer3D.setStyle({}, { cartoon: { color: 'spectrum' } }); // Estilo "cartoon" para proteínas
            viewer3D.zoomTo();
            viewer3D.render();

            modal.style.display = 'flex'; // Mostra o modal

        } catch (error) {
            console.error('Error opening PDB modal:', error);
            showNotification(error.message, 'error');
        } finally {
            loadingOverlay.style.display = 'none';
        }
    };

    // --- OPEN THE TARGET (ENZYME) MODAL ---
    const openTargetModal = async (targetName) => {
        loadingOverlay.style.display = 'flex';
        modalTitle.textContent = targetName; // Set modal title to the enzyme name

        // PDB files (proteins) do not have a simple 2D image,
        // so we hide the 2D container and show the 3D one.
        viewer2DContainer.style.display = 'none';
        viewer3DContainer.style.display = 'block';

        try {
            // Fetch from the NEW backend route
            const response = await fetch(`/get_target_pdb/${targetName}`);
            if (!response.ok) {
                // Try to parse error message from backend
                const errorData = await response.json();
                throw new Error(errorData.message || 'Could not fetch target PDB content');
            }
            const pdbData = await response.text();

            // Create a NEW viewer instance every time
            let viewer3D = $3Dmol.createViewer(viewer3DCanvas);

            viewer3D.addModel(pdbData, 'pdb');
            viewer3D.setStyle({}, { cartoon: { color: 'spectrum' } });
            viewer3D.zoomTo();
            viewer3D.render();

            modal.style.display = 'flex'; // Show modal

        } catch (error) {
            console.error('Error opening target modal:', error);
            showNotification(error.message, 'error');
        } finally {
            loadingOverlay.style.display = 'none';
        }
    };

    // HELPER - fecha todas as pastas abertas de pdb
    function closeAllGroups(container) {
    // Remove "active" from all headers and reset arrow rotation
    container.querySelectorAll('.collapsible-header').forEach(h => {
        h.classList.remove('active');
        const arrow = h.querySelector('.arrow');
        if (arrow) {
            arrow.style.transform = 'rotate(0deg)'; // arrow pointing right/closed
        }
    });

    // Hide all file lists
    container.querySelectorAll('.pdb-file-list').forEach(ul => {
        ul.style.display = 'none';
    });
}


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

            // We use your original 'for...in' loop
            for (const target in data) {
                const collapsibleContainer = document.createElement('div');
                collapsibleContainer.className = 'collapsible-container';

                // --- MODIFICATION IS HERE ---

                // 1. We keep your <button> as the header
                const header = document.createElement('button');
                header.className = 'collapsible-header';

                // 2. Create the arrow span (for collapsing)
                const arrowSpan = document.createElement('span');
                arrowSpan.className = 'arrow';
                arrowSpan.innerHTML = '&#9654;';

                // 3. Create a NEW span just for the target name
                const targetNameSpan = document.createElement('span');
                targetNameSpan.textContent = ` ${target}`; // Add a space before the name
                targetNameSpan.className = 'clickable-filename'; // Reuse your clickable style
                targetNameSpan.title = `Click to view a representative 3D model for ${target}`;

                // 4. Add the click listener FOR THE MODAL only to the NAME span
                targetNameSpan.onclick = (e) => {
                    // This stops the click from also triggering the button's collapse listener
                    e.stopPropagation();

                    // This calls the new function (make sure you added openTargetModal to your file)
                    openTargetModal(target);
                };

                // Download-all ZIP button (right side)
                const downloadAllBtn = document.createElement('button');
                downloadAllBtn.className = 'download-btn download-all-btn';
                downloadAllBtn.innerHTML = '&#11015;';
                downloadAllBtn.title = `Download all PDBs for ${target} as ZIP`;
                downloadAllBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.location.href = `/download_pdb_zip/${encodeURIComponent(target)}`;
                };
                
                // Delete-all button (delete entire target folder)
                const deleteAllBtn = document.createElement('button');
                deleteAllBtn.className = 'delete-btn delete-all-btn';
                deleteAllBtn.innerHTML = '&#128465;';
                deleteAllBtn.title = `Delete all PDBs for ${target}`;
                deleteAllBtn.onclick = (e) => {
                    e.stopPropagation();
                    deletePdbTarget(target, collapsibleContainer);
                };

                // 5. Add both spans to the header button
                header.appendChild(arrowSpan);
                header.appendChild(targetNameSpan);
                header.appendChild(downloadAllBtn);
                header.appendChild(deleteAllBtn);
                
                // --- END OF MODIFICATION ---


                const fileList = document.createElement('ul');
                fileList.className = 'pdb-file-list';

                // This is your original code for the files, which is correct
                data[target].forEach(pdbFile => {
                    const listItem = document.createElement('li');
                    listItem.className = 'pdb-file-item';

                    // Add file name as text
                    const fileNameSpan = document.createElement('span');
                    fileNameSpan.textContent = pdbFile;
                    fileNameSpan.className = 'clickable-filename'; // Adiciona a classe CSS
                    fileNameSpan.onclick = (e) => { // Adiciona o evento de clique
                        e.stopPropagation();
                        openPdbModal(target, pdbFile);
                    };
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

                // This is your original collapse listener. It's perfect.
                // It listens for clicks on the whole <button>
                header.addEventListener('click', () => {
                    const alreadyOpen = header.classList.contains('active');

                    closeAllGroups(pdbListContainer);

                    if (alreadyOpen) {
                        return;
                    }

                    // Abre só esse
                    header.classList.add('active');
                    fileList.style.display = 'block';

                    const arrow = header.querySelector('.arrow');
                    if (arrow) {
                        arrow.style.transform = 'rotate(90deg)'; // arrow pointing down/open
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

    // DELETE AN ENTIRE TARGET FOLDER (all PDBs for that target)
    const deletePdbTarget = async (target, containerElement) => {
        try {
            const response = await fetch('/delete_pdb_target', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target })
            });

            const result = await response.json();

            if (response.ok) {
                // Show red notification (same style as deleting a file)
                showNotification(`All PDBs for "${target}" were deleted`, 'error');

                // Remove the entire collapsible container from the UI
                containerElement.remove();

                // If list is now empty, show "No PDBs downloaded yet."
                if (!pdbListContainer.hasChildNodes()) {
                    pdbListContainer.innerHTML = '<p class="empty-list-message">No PDBs downloaded yet.</p>';
                }
            } else {
                showNotification(`Error when deleting target: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error in delete target request:', error);
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

            if (result.warnings && result.warnings.length > 0) {
                result.warnings.forEach(warning => {
                    // Exibe uma notificação vermelha para cada aviso
                    showNotification(warning, 'error');
                });
            }

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