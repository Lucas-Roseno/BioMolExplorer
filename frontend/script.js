document.getElementById('pdb-form').addEventListener('submit', function(event) {
    event.preventDefault();

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
    .then(response => response.json())
    .then(result => {
        const responseDiv = document.getElementById('response');
        if (result.status === 'success') {
            responseDiv.innerHTML = `<p>${result.message}</p>`;
        } else {
            responseDiv.innerHTML = `<p>Error: ${result.message}</p>`;
        }
    })
    .catch(error => {
        document.getElementById('response').innerHTML = `<p>Error: ${error.toString()}</p>`;
    });
});