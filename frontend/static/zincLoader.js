document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const zincForm = document.getElementById('zinc-form');
    const responseElement = document.getElementById('response');
    const loadingOverlay = document.getElementById('loading-overlay');
    const zincListContainer = document.getElementById('zinc-list');

    // --- SHOW NOTIFICATION ---
    const showNotification = (message, type = 'success') => {
        const alertBox = document.createElement('div');
        alertBox.className = 'alert-notification';
        alertBox.classList.add(type);
        alertBox.textContent = message;

        document.body.appendChild(alertBox);

        setTimeout(() => { alertBox.classList.add('show'); }, 10);
        setTimeout(() => {
            alertBox.classList.remove('show');
            alertBox.addEventListener('transitionend', () => { alertBox.remove(); });
        }, 3000);
    };

    // --- LOAD AND DISPLAY ZINC DATA (TABLE) ---
    const loadAndDisplayZincFiles = async () => {
        try {
            // Updated endpoint to get parsed CSV content
            const response = await fetch('/get_zinc_content');
            const data = await response.json();

            zincListContainer.innerHTML = '';

            if (!data || data.length === 0) {
                zincListContainer.innerHTML = '<p class="empty-list-message">No ZINC CSV data found.</p>';
                return;
            }

            // Iterate over each file data (e.g., ZINC2D.csv, ZINC3D.csv)
            data.forEach(fileObj => {
                const fileName = fileObj.filename;
                const rows = fileObj.content;

                // 1. Container for this file's data
                const fileSection = document.createElement('div');
                fileSection.style.marginBottom = '30px';
                fileSection.style.border = '1px solid #ddd';
                fileSection.style.borderRadius = '8px';
                fileSection.style.overflow = 'hidden';

                // 2. Header with Filename + Buttons
                const headerDiv = document.createElement('div');
                headerDiv.style.backgroundColor = '#f7f7f7';
                headerDiv.style.padding = '10px 15px';
                headerDiv.style.borderBottom = '1px solid #ddd';
                headerDiv.style.display = 'flex';
                headerDiv.style.justifyContent = 'space-between';
                headerDiv.style.alignItems = 'center';

                const title = document.createElement('h4');
                title.textContent = fileName;
                title.style.margin = '0';
                title.style.color = '#333';

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'zinc-item-actions'; // Reusing existing class for layout

                // Download Button (for the whole CSV)
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'download-btn';
                downloadBtn.innerHTML = '&#11015;'; // Download icon
                downloadBtn.title = `Download ${fileName}`;
                downloadBtn.style.marginRight = '8px';
                downloadBtn.onclick = () => {
                    window.location.href = `/download_zinc/${fileName}`;
                };

                // Delete Button (for the whole CSV)
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.innerHTML = '&#128465;'; // Trash icon
                deleteBtn.title = `Delete ${fileName}`;
                deleteBtn.onclick = async () => {
                    if (confirm(`Are you sure you want to delete ${fileName}?`)) {
                        await deleteZincFile(fileName);
                        loadAndDisplayZincFiles(); // Reload
                    }
                };

                actionsDiv.appendChild(downloadBtn);
                actionsDiv.appendChild(deleteBtn);
                headerDiv.appendChild(title);
                headerDiv.appendChild(actionsDiv);

                // 3. Table for Data
                const tableContainer = document.createElement('div');
                tableContainer.style.overflowX = 'auto'; // Handle wide tables

                const table = document.createElement('table');
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                table.style.fontSize = '0.9rem';

                // Table Head
                const thead = document.createElement('thead');
                const trHead = document.createElement('tr');
                trHead.style.backgroundColor = '#eaeaea';

                ['ZINC ID', 'SMILE'].forEach(text => {
                    const th = document.createElement('th');
                    th.textContent = text;
                    th.style.padding = '8px';
                    th.style.textAlign = 'left';
                    th.style.borderBottom = '2px solid #ddd';
                    trHead.appendChild(th);
                });
                thead.appendChild(trHead);
                table.appendChild(thead);

                // Table Body
                const tbody = document.createElement('tbody');
                rows.forEach((row, index) => {
                    const tr = document.createElement('tr');
                    tr.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f9f9f9';

                    const tdId = document.createElement('td');
                    tdId.textContent = row.zinc_id;
                    tdId.style.padding = '8px';
                    tdId.style.borderBottom = '1px solid #eee';

                    const tdSmile = document.createElement('td');
                    tdSmile.textContent = row.smile;
                    tdSmile.style.padding = '8px';
                    tdSmile.style.borderBottom = '1px solid #eee';
                    tdSmile.style.fontFamily = 'monospace'; // Better for smiles

                    tr.appendChild(tdId);
                    tr.appendChild(tdSmile);
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                tableContainer.appendChild(table);

                // Combine elements
                fileSection.appendChild(headerDiv);
                fileSection.appendChild(tableContainer);
                zincListContainer.appendChild(fileSection);
            });

        } catch (error) {
            console.error('Error loading ZINC data:', error);
            zincListContainer.innerHTML = '<p class="empty-list-message">Error loading data.</p>';
        }
    };

    const deleteZincFile = async (fileName) => {
        try {
            const response = await fetch('/delete_zinc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: fileName })
            });
            if (response.ok) {
                showNotification(`${fileName} deleted successfully`, 'error');
            } else {
                showNotification('Error deleting file', 'error');
            }
        } catch (e) {
            showNotification('Connection error', 'error');
        }
    };

    // --- FORM SUBMISSION ---
    zincForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        responseElement.textContent = '';
        responseElement.style.display = 'none';
        responseElement.className = '';

        const fileInput = document.getElementById('zinc_file');
        const file = fileInput.files[0];

        if (!file) {
            showNotification("Please select a file.", 'error');
            return;
        }

        const fileName = file.name;
        const has2D = fileName.includes('2D');
        const has3D = fileName.includes('3D');

        // VALIDAÇÃO DO NOME DO ARQUIVO (Requisito do usuário)
        if (!has2D && !has3D) {
            const msg = 'Invalid Model: The filename must contain "2D" or "3D".';
            responseElement.textContent = msg;
            responseElement.style.display = 'block';
            responseElement.classList.add('error');
            showNotification(msg, 'error');
            return;
        }

        // Preparar FormData para envio
        const formData = new FormData(event.target);

        // Ativar Lockscreen
        loadingOverlay.style.display = 'flex';

        try {
            const response = await fetch('/load_zinc', {
                method: 'POST',
                body: formData // Envia como multipart/form-data
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Server error during ZINC processing.');
            }

            responseElement.textContent = result.message;
            responseElement.style.display = 'block';
            responseElement.classList.add('success');
            showNotification('ZINC processing completed successfully!', 'success');

            // Limpar formulário e recarregar lista (agora como tabelas)
            zincForm.reset();
            loadAndDisplayZincFiles();

        } catch (error) {
            console.error(error);
            responseElement.textContent = error.message;
            responseElement.style.display = 'block';
            responseElement.classList.add('error');
            showNotification(error.message, 'error');
        } finally {
            // Desativar Lockscreen
            loadingOverlay.style.display = 'none';
        }
    });

    // Carregamento inicial
    loadAndDisplayZincFiles();
});