document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const chemblForm = document.getElementById('chembl-form');
    const responseElement = document.getElementById('response');

    chemblForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        responseElement.textContent = 'Searching for files to download...';
        responseElement.classList.remove('success', 'error');
        responseElement.classList.add('loading');
        responseElement.style.display = 'block';

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
                throw new Error(result.message || 'A server error occurred.');
            }

            responseElement.textContent = result.message;
            responseElement.classList.remove('loading', 'error');
            responseElement.classList.add('success');

        } catch (error) {
            responseElement.textContent = error.message;
            responseElement.classList.remove('loading', 'success');
            responseElement.classList.add('error');
        }
    });
});