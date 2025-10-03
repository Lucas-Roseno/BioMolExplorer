document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const chemblForm = document.getElementById('chembl-form');
    const responseElement = document.getElementById('response');
    const chemblListContainer = document.getElementById('chembl-list');

    // MOSTRA ALERTA DE EXCLUSÃO
    const showAlert = (message) => {
        const alertBox = document.createElement('div');
        alertBox.className = 'alert-notification'; // Reutiliza o estilo do pdbLoader
        alertBox.textContent = message;
        document.body.appendChild(alertBox);

        setTimeout(() => {
            alertBox.classList.add('show');
        }, 10);

        setTimeout(() => {
            alertBox.classList.remove('show');
            alertBox.addEventListener('transitionend', () => alertBox.remove());
        }, 3000);
    };

    // DELETA UM ARQUIVO ChEMBL
    const deleteChemblFile = async (target, chemblFile, listItemElement) => {
        try {
            const response = await fetch('/delete_chembl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target, chembl_file: chemblFile })
            });

            const result = await response.json();

            if (response.ok) {
                const fileList = listItemElement.parentNode;
                listItemElement.remove();
                showAlert(`Arquivo ${chemblFile} foi excluído.`);

                if (fileList && fileList.children.length === 0) {
                    const container = fileList.parentNode;
                    if (container) {
                        container.remove();
                    }
                }
                // Checa se a lista geral ficou vazia
                if (chemblListContainer.children.length === 0) {
                    chemblListContainer.innerHTML = '<p class="empty-list-message">No ChEMBL files downloaded yet.</p>';
                }

            } else {
                alert(`Error when deleting: ${result.message}`);
            }
        } catch (error) {
            console.error('Error in delete request:', error);
            alert('A communication error with the server occurred.');
        }
    };

    // CARREGA E EXIBE ARQUIVOS ChEMBL
    const loadAndDisplayChemblFiles = async () => {
        try {
            const response = await fetch('/chembl_files'); // Novo endpoint
            const data = await response.json();

            chemblListContainer.innerHTML = '';

            if (Object.keys(data).length === 0) {
                chemblListContainer.innerHTML = '<p class="empty-list-message">No ChEMBL files downloaded yet.</p>';
                return;
            }

            for (const target in data) {
                const collapsibleContainer = document.createElement('div');
                collapsibleContainer.className = 'collapsible-container';

                const header = document.createElement('button');
                header.className = 'collapsible-header';
                header.innerHTML = `<span class="arrow">&#9654;</span> ${target}`;

                const fileList = document.createElement('ul');
                fileList.className = 'pdb-file-list'; // Reutilizando a classe CSS

                data[target].forEach(chemblFile => {
                    const listItem = document.createElement('li');
                    listItem.className = 'pdb-file-item'; // Reutilizando a classe CSS
                    listItem.textContent = chemblFile;

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-btn';
                    deleteBtn.innerHTML = '&#128465;';
                    deleteBtn.title = `Delete ${chemblFile}`;
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        deleteChemblFile(target, chemblFile, listItem);
                    };

                    listItem.appendChild(deleteBtn);
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
                chemblListContainer.appendChild(collapsibleContainer);
            }
        } catch (error) {
            console.error('Error loading ChEMBL list:', error);
            chemblListContainer.innerHTML = '<p class="empty-list-message">Error loading files.</p>';
        }
    };

    // SUBMISSÃO DO FORMULÁRIO
    chemblForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        responseElement.textContent = 'Searching for files to download...';
        responseElement.classList.remove('success', 'error');
        responseElement.classList.add('loading');
        responseElement.style.display = 'block';

        const formData = new FormData(event.target);
        const data = {
            target: formData.get('target'),
            // Adicione outros campos do formulário ChEMBL aqui, se houver
        };

        try {
            const response = await fetch('/load_chembl', { // Endpoint de download do ChEMBL
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

            // Recarrega a lista após o download
            loadAndDisplayChemblFiles();

        } catch (error) {
            responseElement.textContent = error.message;
            responseElement.classList.remove('loading', 'success');
            responseElement.classList.add('error');
        }
    });

    // Carrega a lista de arquivos ao iniciar a página
    loadAndDisplayChemblFiles();
});