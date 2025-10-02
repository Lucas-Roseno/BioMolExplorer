document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('chembl-form');
    const responseElement = document.getElementById('response');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        responseElement.textContent = 'Processing request...';
        responseElement.className = 'loading';
        responseElement.style.display = 'block';

        const formData = new FormData(form);
        const payload = {
            target_name: formData.get('target_name'),
            target: {
                "type__in": formData.get('type__in').split(',').map(s => s.trim()),
                "relationship_type": formData.get('relationship_type').split(',').map(s => s.trim())
            },
            bioactivity: {
                "molecule_type": formData.get('molecule_type_bioactivity'),
                "standard_units": formData.get('standard_units')
            },
            molecules: {
                "natural_product": formData.get('natural_product') ? 1 : 0
            },
            similarmols: {
                "molecule_type": formData.get('molecule_type_similarmols')
            }
        };

        try {
            const fetchResponse = await fetch('/load_chembl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await fetchResponse.json();
            if (!fetchResponse.ok) throw new Error(result.message);

            responseElement.textContent = result.message;
            responseElement.className = 'success';
        } catch (error) {
            responseElement.textContent = `Error: ${error.message}`;
            responseElement.className = 'error';
        }
    });
});