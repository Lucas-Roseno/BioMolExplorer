document.getElementById('pdb-form').addEventListener('submit', function (event) {
    event.preventDefault();

    const responseElement = document.getElementById('response');

    responseElement.style.display = 'none';
    responseElement.classList.remove('success', 'error');

    responseElement.textContent = 'Baixando...';
    responseElement.classList.add('loading'); // Adiciona uma classe para o estilo
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

    fetch('/load_pdb', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
        .then(response => {
            // Converte a resposta em JSON, independentemente do status (erro ou sucesso).
            return response.json().then(body => {
                // Se a resposta HTTP não for 'ok' (ex: status 400), rejeita a promessa.
                // Isso acionará o bloco .catch() abaixo.
                if (!response.ok) {
                    // Cria um novo erro, usando a mensagem que veio do backend.
                    throw new Error(body.message || 'Ocorreu um erro no servidor.');
                }
                // Se a resposta for 'ok', passa os dados para o próximo .then().
                return body;
            });
        })
        .then(result => {
            // Este bloco agora só executa para respostas de SUCESSO.
            const responseElement = document.getElementById('response');
            responseElement.textContent = result.message;
            responseElement.classList.remove('success', 'error');
            responseElement.classList.add('success');
            responseElement.style.display = 'block';
        })
        .catch(error => {
            // Este bloco agora captura erros de rede E erros enviados pelo backend.
            const responseElement = document.getElementById('response');
            // A mensagem de erro será a que definimos no "throw new Error" acima.
            responseElement.textContent = error.message;
            responseElement.classList.remove('success');
            responseElement.classList.add('error');
            responseElement.style.display = 'block';
        });
});