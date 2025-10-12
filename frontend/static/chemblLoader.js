document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const chemblForm = document.getElementById('chembl-form');
    const responseElement = document.getElementById('response');
    const loadingOverlay = document.getElementById('loading-overlay'); // Get the overlay element

    chemblForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        responseElement.textContent = '';
        responseElement.classList.remove('success', 'error', 'loading');
        responseElement.style.display = 'none';

        
        loadingOverlay.style.display = 'flex';

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
            responseElement.style.display = 'block';
            responseElement.classList.add('success');

        } catch (error) {
            responseElement.textContent = error.message;
            responseElement.style.display = 'block';
            responseElement.classList.add('error');
        } finally {
            loadingOverlay.style.display = 'none';
        }
    });
});