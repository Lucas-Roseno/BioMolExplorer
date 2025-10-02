document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('chembl-form');
    const responseElement = document.getElementById('response');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Collect checked values for 'standard_type__in'
        const standardTypes = Array.from(form.querySelectorAll('input[name="standard_type__in"]:checked'))
            .map(checkbox => checkbox.value);

        if (standardTypes.length === 0) {
            responseElement.textContent = 'Error: Please select at least one Standard Type.';
            responseElement.className = 'error';
            responseElement.style.display = 'block';
            return;
        }

        responseElement.textContent = 'Processing request...';
        responseElement.className = 'loading';
        responseElement.style.display = 'block';

        const formData = new FormData(form);
        const payload = {
            target_name: formData.get('target_name'),
            target: {
                organism: formData.get('organism')
            },
            bioactivity: {
                standard_type__in: standardTypes,
                max_value_ref: parseFloat(formData.get('max_value_ref'))
            },
            molecules: {
                natural_product: formData.get('natural_product_molecules') ? 1 : 0
            },
            similarmols: {
                similarity: parseInt(formData.get('similarity'), 10),
                molecule_weight: parseFloat(formData.get('molecule_weight'))
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