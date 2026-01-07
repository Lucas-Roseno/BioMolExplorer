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
            const response = await fetch('/get_zinc_content');
            const data = await response.json();

            zincListContainer.innerHTML = '';

            if (!data || data.length === 0) {
                zincListContainer.innerHTML = '<p class="empty-list-message">Nenhum dado ZINC processado encontrado.</p>';
                return;
            }

            // Iterate over each file data
            data.forEach(fileObj => {
                const fileName = fileObj.filename;
                const rows = fileObj.content; // Expecting [{zinc_id: '...', smile: '...'}, ...]

                // 1. Container Section
                const fileSection = document.createElement('div');
                fileSection.className = 'zinc-file-section';

                // 2. Header
                const headerDiv = document.createElement('div');
                headerDiv.className = 'zinc-file-header';

                const title = document.createElement('h4');
                title.textContent = fileName;

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'zinc-item-actions';

                // Download Button
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'download-btn';
                downloadBtn.innerHTML = '&#11015;';
                downloadBtn.title = `Baixar CSV: ${fileName}`;
                downloadBtn.onclick = () => {
                    window.location.href = `/download_zinc/${fileName}`;
                };

                // Delete Button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.innerHTML = '&#128465;';
                deleteBtn.title = `Excluir: ${fileName}`;
                deleteBtn.onclick = async () => {
                    if (confirm(`Tem certeza que deseja excluir ${fileName}?`)) {
                        await deleteZincFile(fileName);
                        loadAndDisplayZincFiles();
                    }
                };

                actionsDiv.appendChild(downloadBtn);
                actionsDiv.appendChild(deleteBtn);
                headerDiv.appendChild(title);
                headerDiv.appendChild(actionsDiv);

                // 3. Table
                const tableContainer = document.createElement('div');
                tableContainer.className = 'zinc-table-wrapper';

                const table = document.createElement('table');
                table.className = 'zinc-table';

                // Table Head
                const thead = document.createElement('thead');
                const trHead = document.createElement('tr');

                const thId = document.createElement('th');
                thId.textContent = 'ZINC ID';
                const thSmile = document.createElement('th');
                thSmile.textContent = 'SMILE'; // Tabela solicitada contendo SMILE

                trHead.appendChild(thId);
                trHead.appendChild(thSmile);
                thead.appendChild(trHead);
                table.appendChild(thead);

                // Table Body
                const tbody = document.createElement('tbody');

                // Limit preview rows for performance if needed, or show all
                rows.forEach((row) => {
                    const tr = document.createElement('tr');

                    const tdId = document.createElement('td');
                    tdId.textContent = row.zinc_id;
                    tdId.className = 'col-zinc-id';

                    const tdSmile = document.createElement('td');
                    tdSmile.textContent = row.smile;
                    tdSmile.className = 'col-smile';

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
            zincListContainer.innerHTML = '<p class="empty-list-message">Erro ao carregar dados.</p>';
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
                showNotification(`${fileName} excluído`, 'success');
            } else {
                showNotification('Erro ao excluir arquivo', 'error');
            }
        } catch (e) {
            showNotification('Erro de conexão', 'error');
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
            showNotification("Por favor selecione um arquivo.", 'error');
            return;
        }

        const fileName = file.name;
        const has2D = fileName.includes('2D');
        const has3D = fileName.includes('3D');

        if (!has2D && !has3D) {
            const msg = 'Modelo Inválido: O nome do arquivo deve conter "2D" ou "3D".';
            responseElement.textContent = msg;
            responseElement.style.display = 'block';
            responseElement.classList.add('error');
            showNotification(msg, 'error');
            return;
        }

        const formData = new FormData(event.target);
        loadingOverlay.style.display = 'flex';

        try {
            const response = await fetch('/load_zinc', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Erro no servidor durante processamento ZINC.');
            }

            responseElement.textContent = result.message;
            responseElement.style.display = 'block';
            responseElement.classList.add('success');
            showNotification('Processamento ZINC concluído!', 'success');

            zincForm.reset();
            // A chamada abaixo recarrega a lista e exibe a tabela com ZINC ID e SMILE
            loadAndDisplayZincFiles();

        } catch (error) {
            console.error(error);
            responseElement.textContent = error.message;
            responseElement.style.display = 'block';
            responseElement.classList.add('error');
            showNotification(error.message, 'error');
        } finally {
            loadingOverlay.style.display = 'none';
        }
    });

    // Carga inicial
    loadAndDisplayZincFiles();
});