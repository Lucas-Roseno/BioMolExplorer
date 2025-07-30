document.addEventListener('DOMContentLoaded', () => {
    
    
    const num1Input = document.getElementById('num1');
    const num2Input = document.getElementById('num2');
    const operationSelect = document.getElementById('operation');
    const calculateButton = document.getElementById('calculateButton');
    const resultDisplay = document.getElementById('resultDisplay');

    calculateButton.addEventListener('click', async () => {
        const num1 = num1Input.value;
        const num2 = num2Input.value;
        const operation = operationSelect.value;

        if (num1 === '' || num2 === '') {
            resultDisplay.textContent = 'Erro: Por favor, preencha ambos os números.';
            resultDisplay.style.color = 'red';
            return;
        }

        try {
            const response = await fetch('http://127.0.0.1:5000/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ num1, num2, operation })
            });
            const data = await response.json();
            if (response.ok) {
                resultDisplay.textContent = `O resultado é: ${data.result}`;
                resultDisplay.style.color = 'green';
            } else {
                resultDisplay.textContent = `Erro: ${data.error}`;
                resultDisplay.style.color = 'red';
            }
        } catch (error) {
            console.error('Erro ao chamar a API de cálculo:', error);
            resultDisplay.textContent = 'Erro de conexão com o servidor.';
            resultDisplay.style.color = 'red';
        }
    });

    
    const fileResultsDisplay = document.getElementById('fileResultsDisplay');

    async function loadCalculationsFromFile() {
        try {
            const response = await fetch('http://127.0.0.1:5000/calculations_from_file');
            const data = await response.json();

            if (response.ok) {
                fileResultsDisplay.innerHTML = ''; 
                if (data.length === 0) {
                    fileResultsDisplay.innerHTML = '<p>Nenhum cálculo encontrado no arquivo.</p>';
                    return;
                }
                const ul = document.createElement('ul');
                data.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = item.calculation;
                    ul.appendChild(li);
                });
                fileResultsDisplay.appendChild(ul);
            } else {
                fileResultsDisplay.textContent = `Erro: ${data.error}`;
                fileResultsDisplay.style.color = 'red';
            }
        } catch (error) {
            console.error('Erro ao chamar a API de arquivo:', error);
            fileResultsDisplay.textContent = 'Erro de conexão com o servidor ao buscar dados do arquivo.';
            fileResultsDisplay.style.color = 'red';
        }
    }

    
    loadCalculationsFromFile();
});