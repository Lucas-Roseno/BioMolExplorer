document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const chemblForm = document.getElementById('chembl-form');
    const responseElement = document.getElementById('response');
    const loadingOverlay = document.getElementById('loading-overlay');
    const chemblListContainer = document.getElementById('chembl-list');

    // --- SHOW NOTIFICATION (Copied from pdbLoader.js) ---
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

    // --- TRANSLATE ERROR MESSAGE ---
    const translateErrorMessage = (rawError) => {
        const errorString = String(rawError).toLowerCase();

        // 1. Target errors
        if (errorString.includes("target_chembl_id") ||
            errorString.includes("target not found") ||
            errorString.includes("could not find target") ||
            errorString.includes("target name is required")) {
            return 'Target not found. Please check the name and try again.';
        }

        // 2. Bioactivity errors
        if (errorString.includes("standard_type") || errorString.includes("standard_value")) {
            return 'Invalid Bioactivity. Please select at least one Standard Type and provide a valid Max Value.';
        }

        // 3. Similarity errors
        if (errorString.includes("similarity")) {
            return 'Invalid Similarity. Please provide a valid percentage (0-100).';
        }

        // 4. Molecule weight errors
        if (errorString.includes("molecule_weight") || errorString.includes("mw_freebase")) {
            return 'Invalid Molecule Weight. Please provide a valid number.';
        }

        // 5. Organism errors
        if (errorString.includes("organism")) {
            return 'Invalid Organism. Please check the spelling.';
        }

        // 6. No checkboxes selected
        if (errorString.includes("at least one standard type")) {
            return 'No Standard Type selected. Please check at least one bioactivity type (e.g., Ki, IC50).';
        }

        // Default/Fallback error for debugging
        return `A server error occurred: ${rawError}`;
    };

    // --- DELETE ChEMBL FILE ---
    const deleteChemblFile = async (subDirName, target, csvFile, listItemElement) => {
        try {
            const response = await fetch('/delete_chembl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sub_dir_name: subDirName, target, csv_file: csvFile })
            });
            const result = await response.json();

            if (response.ok) {
                showNotification(`${csvFile} was deleted`, 'error'); // Red notification

                const fileList = listItemElement.parentNode; // ul
                const categoryContainer = fileList.parentNode; // div containing header + ul
                const categoriesListDiv = categoryContainer.parentNode; // div holding categories
                const targetContainer = categoriesListDiv.parentNode; // main container for target

                listItemElement.remove(); // Remove file item

                // If file list is empty, remove the category
                if (fileList.children.length === 0) {
                    categoryContainer.remove();
                }

                // If categories list is empty, remove the target
                if (categoriesListDiv.children.length === 0) {
                    targetContainer.remove();
                }

                // If main container is empty, show message
                if (chemblListContainer.children.length === 0) {
                    chemblListContainer.innerHTML = '<p class="empty-list-message">No ChEMBL files downloaded yet.</p>';
                }

            } else {
                showNotification(`Error: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error in delete request:', error);
            showNotification('A communication error occurred.', 'error');
        }
    };

    // --- Helper function to create file list items (li) ---
    const createFileItem = (subDirName, target, fileName, fileListElement) => {
        const listItem = document.createElement('li');
        listItem.className = 'pdb-file-item'; // Re-use style

        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = fileName;
        listItem.appendChild(fileNameSpan);

        const actionBtnsContainer = document.createElement('div');
        actionBtnsContainer.className = 'pdb-item-actions'; // Re-use style

        // Download button
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'download-btn';
        downloadBtn.innerHTML = '&#11015;'; // Download icon
        downloadBtn.title = `Download ${fileName}`;
        downloadBtn.onclick = async (e) => {
            e.stopPropagation();

            if (loadingOverlay) {
                loadingOverlay.style.display = 'flex';
            }

            try {
                const response = await fetch(`/download_chembl/${subDirName}/${target}/${fileName}`);

                if (!response.ok) {
                    let errorMsg = `HTTP error! status: ${response.status}`;
                    try {
                        const errData = await response.json();
                        errorMsg = errData.message || errorMsg;
                    } catch (jsonError) {
                        // Response was not JSON
                    }
                    throw new Error(errorMsg);
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = fileName; // Use the filename
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();

            } catch (error) {
                console.error('Download error:', error);
                showNotification(`Error downloading ${fileName}: ${error.message}`, 'error');
            } finally {
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
            }
        };

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&#128465;'; // Trash icon
        deleteBtn.title = `Delete ${fileName}`;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteChemblFile(subDirName, target, fileName, listItem);
        };

        actionBtnsContainer.appendChild(downloadBtn);
        actionBtnsContainer.appendChild(deleteBtn);
        listItem.appendChild(actionBtnsContainer);
        fileListElement.appendChild(listItem);
    };

    // --- Helper to create nested category sections (Molecules/Similars) ---
    const createCategorySubSection = (categoryName, targetName, fileArray, parentElement) => {
        if (!fileArray || fileArray.length === 0) return; // Skip if no files

        const categoryContainer = document.createElement('div');
        categoryContainer.className = 'collapsible-container'; // Re-use style

        const categoryHeader = document.createElement('button');
        categoryHeader.className = 'collapsible-header'; // Re-use style
        categoryHeader.innerHTML = `<span class="arrow">&#9654;</span> ${categoryName}`;

        const fileList = document.createElement('ul');
        fileList.className = 'pdb-file-list'; // Re-use style
        fileList.style.backgroundColor = '#fdfdfd'; // Slightly different bg

        // Populate file list
        fileArray.forEach(fileName => {
            createFileItem(categoryName.toLowerCase(), targetName, fileName, fileList);
        });

        // Add click event to toggle
        categoryHeader.onclick = (e) => {
            e.stopPropagation(); // Prevent target header from toggling
            categoryHeader.classList.toggle('active');
            const arrow = categoryHeader.querySelector('.arrow');
            if (fileList.style.display === 'block') {
                fileList.style.display = 'none';
                arrow.style.transform = 'rotate(0deg)';
            } else {
                fileList.style.display = 'block';
                arrow.style.transform = 'rotate(90deg)';
            }
        };

        categoryContainer.appendChild(categoryHeader);
        categoryContainer.appendChild(fileList);
        parentElement.appendChild(categoryContainer);
    };

    // --- LOAD AND DISPLAY ChEMBL FILES ---
    const loadAndDisplayChemblFiles = async () => {
        try {
            const response = await fetch('/chembl_files');
            const data = await response.json();

            chemblListContainer.innerHTML = ''; // Clear current list

            if (Object.keys(data).length === 0) {
                chemblListContainer.innerHTML = '<p class="empty-list-message">No ChEMBL files downloaded yet.</p>';
                return;
            }

            // Level 1: Iterate over Targets
            for (const targetName in data) {
                const targetData = data[targetName];

                const targetCollapsibleContainer = document.createElement('div');
                targetCollapsibleContainer.className = 'collapsible-container';

                // Target Header (e.g., Acetylcholinesterase)
                const targetHeader = document.createElement('button');
                targetHeader.className = 'collapsible-header active'; // Start active/open
                targetHeader.innerHTML = `<span class="arrow" style="transform: rotate(90deg);">&#9654;</span> ${targetName}`;

                // Container for categories (Molecules, Similars)
                const categoriesListDiv = document.createElement('div');
                categoriesListDiv.className = 'pdb-file-list'; // Re-use style
                categoriesListDiv.style.display = 'block'; // Start open
                categoriesListDiv.style.paddingLeft = '10px'; // Indent nested lists

                // Toggle logic for Target Header
                targetHeader.onclick = () => {
                    targetHeader.classList.toggle('active');
                    const arrow = targetHeader.querySelector('.arrow');
                    if (categoriesListDiv.style.display === 'block') {
                        categoriesListDiv.style.display = 'none';
                        arrow.style.transform = 'rotate(0deg)';
                    } else {
                        categoriesListDiv.style.display = 'block';
                        arrow.style.transform = 'rotate(90deg)';
                    }
                };

                targetCollapsibleContainer.appendChild(targetHeader);
                targetCollapsibleContainer.appendChild(categoriesListDiv);
                chemblListContainer.appendChild(targetCollapsibleContainer);

                // Level 2: Create Molecules and Similars sections inside
                createCategorySubSection('Molecules', targetName, targetData.molecules, categoriesListDiv);
                createCategorySubSection('Similars', targetName, targetData.similars, categoriesListDiv);
            }

        } catch (error) {
            console.error('Error loading ChEMBL list:', error);
            chemblListContainer.innerHTML = '<p class="empty-list-message">Error loading files.</p>';
        }
    };


    // --- FORM SUBMISSION ---
    chemblForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        responseElement.textContent = '';
        responseElement.classList.remove('success', 'error', 'loading');
        responseElement.style.display = 'none';


        loadingOverlay.style.display = 'flex';

        const formData = new FormData(event.target);

        const standardTypes = [];
        const checkboxes = document.querySelectorAll('input[name="standard_type__in"]:checked');
        checkboxes.forEach((checkbox) => {
            standardTypes.push(checkbox.value);
        });

        const data = {
            target: {
                target_name: formData.get('target_name'),
                organism: formData.get('organism')
            },
            bioactivity: {
                standard_type__in: standardTypes,
                standard_value__lte: formData.get('max_value_ref')
            },
            molecules: {
                natural_product: formData.has('natural_product_molecules')
            },
            similarmols: {
                similarity: formData.get('similarity'),
                mw_freebase__lte: formData.get('molecule_weight')
            }
        };

        try {
            const response = await fetch('/load_chembl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (!response.ok) {
                // Joga o erro para o bloco catch, vindo do backend
                throw new Error(result.message || 'A server error occurred.');
            }

            responseElement.textContent = result.message;
            responseElement.style.display = 'block';
            responseElement.classList.add('success');

            loadAndDisplayChemblFiles(); // Refresh list on success

        } catch (error) {
            // --- MODIFICATION HERE ---
            // Traduz a mensagem de erro antes de exibir
            const friendlyMessage = translateErrorMessage(error.message);

            // Mostra o erro na caixa de resposta
            responseElement.textContent = friendlyMessage + error;
            responseElement.style.display = 'block';
            responseElement.classList.add('error');

            // Mostra o pop-up de erro vermelho
            showNotification(friendlyMessage, 'error');
            // --- END MODIFICATION ---
        } finally {
            loadingOverlay.style.display = 'none';
        }
    });

    // Initial load of file list
    loadAndDisplayChemblFiles();
});