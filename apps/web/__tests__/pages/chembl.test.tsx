import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock ChEMBL page
const ChEMBLPage = () => (
  <div>
    <h1>ChEMBL Bioactivity Browser</h1>
    <form>
      <input placeholder="Target name" aria-label="Target" />
      <select aria-label="Bioactivity Type">
        <option value="">Select Type</option>
        <option value="Ki">Ki</option>
        <option value="IC50">IC50</option>
        <option value="EC50">EC50</option>
      </select>
      <button type="submit">Search</button>
    </form>
    <div data-testid="bioactivity-list">Bioactivity data will appear here</div>
  </div>
)

describe('🔬 ChEMBL Page', () => {
  test('✅ should render bioactivity browser', () => {
    render(<ChEMBLPage />)
    expect(screen.getByText('ChEMBL Bioactivity Browser')).toBeInTheDocument()
  })

  test('✅ should have bioactivity type selector', () => {
    render(<ChEMBLPage />)
    const selector = screen.getByLabelText('Bioactivity Type')
    expect(selector).toBeInTheDocument()
  })

  test('✅ should have bioactivity options', () => {
    render(<ChEMBLPage />)
    expect(screen.getByRole('option', { name: 'Ki' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'IC50' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'EC50' })).toBeInTheDocument()
  })

  test('✅ should have bioactivity data container', () => {
    render(<ChEMBLPage />)
    expect(screen.getByTestId('bioactivity-list')).toBeInTheDocument()
  })

  test('✅ should accept target input', async () => {
    render(<ChEMBLPage />)
    const input = screen.getByLabelText('Target') as HTMLInputElement
    await userEvent.type(input, 'Acetylcholinesterase')
    expect(input.value).toBe('Acetylcholinesterase')
  })
})
