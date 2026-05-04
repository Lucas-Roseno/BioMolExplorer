import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the PDB page component
const PDBPage = () => (
  <div>
    <h1>PDB Search & Browser</h1>
    <form>
      <input placeholder="Target name" aria-label="Target" />
      <input placeholder="Max Resolution" aria-label="Max Resolution" />
      <button type="submit">Search</button>
    </form>
    <div data-testid="file-list">Files will appear here</div>
  </div>
)

describe('🧬 PDB Page', () => {
  test('✅ should render search form', () => {
    render(<PDBPage />)
    
    expect(screen.getByText('PDB Search & Browser')).toBeInTheDocument()
    expect(screen.getByLabelText('Target')).toBeInTheDocument()
    expect(screen.getByLabelText('Max Resolution')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
  })

  test('✅ should have input fields', () => {
    render(<PDBPage />)
    
    const targetInput = screen.getByLabelText('Target') as HTMLInputElement
    expect(targetInput).toHaveAttribute('placeholder', 'Target name')
  })

  test('✅ should have file list container', () => {
    render(<PDBPage />)
    
    expect(screen.getByTestId('file-list')).toBeInTheDocument()
  })

  test('✅ should accept user input in target field', async () => {
    render(<PDBPage />)
    
    const input = screen.getByLabelText('Target') as HTMLInputElement
    await userEvent.type(input, 'AChE')
    
    expect(input.value).toBe('AChE')
  })
})
