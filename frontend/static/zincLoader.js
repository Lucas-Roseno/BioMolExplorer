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

    // --- LOAD AND DISPLAY ZINC FILES ---
    const loadAndDisplayZincFiles = async () => {
        try {
            const response = await fetch('/zinc_files');
            const data = await response.json();

            zincListContainer.innerHTML = '';

            if (!data || data.length === 0) {
                zincListContainer.innerHTML = '<p class="empty-list-message">No ZINC files found.</p>';
                return;
            }

            const ul = document.createElement('ul');
            ul.className = 'pdb-file-list';
            ul.style.display = 'block';
            ul.style.maxHeight = 'none';

            data.forEach(fileName => {
                const listItem = document.createElement('li');
                listItem.className = 'zinc-file-item';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = fileName;
                listItem.appendChild(nameSpan);

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'zinc-item-actions';

                // Delete Button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.innerHTML = '&#128465;';
                deleteBtn.title = `Delete ${fileName}`;
                deleteBtn.onclick = async () => {
                    deleteZincFile(fileName);
                    loadAndDisplayZincFiles();
                };

                actionsDiv.appendChild(deleteBtn);
                listItem.appendChild(actionsDiv);
                ul.appendChild(listItem);
            });

            zincListContainer.appendChild(ul);

        } catch (error) {
            console.error('Error loading ZINC list:', error);
            zincListContainer.innerHTML = '<p class="empty-list-message">Error loading files.</p>';
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

            // Limpar formulário e recarregar lista
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