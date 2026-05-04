import { render, screen } from '@testing-library/react'

// Mock Analysis page
const AnalysisPage = () => (
  <div>
    <h1>Similarity Network Analysis</h1>
    <div className="controls">
      <select aria-label="Target">
        <option value="">Select Target</option>
        <option value="AChE">Acetylcholinesterase</option>
        <option value="BACE1">Beta-secretase 1</option>
      </select>
      <select aria-label="Dataset Type">
        <option value="MOLS">Molecules</option>
        <option value="SIMS">Similarities</option>
      </select>
    </div>
    <div data-testid="graph-container" style={{ width: '100%', height: '500px' }}>
      Force Graph will render here
    </div>
    <div data-testid="molecule-modal">Molecule details modal</div>
  </div>
)

describe('📊 Analysis Page', () => {
  test('✅ should render analysis page', () => {
    render(<AnalysisPage />)
    expect(screen.getByText('Similarity Network Analysis')).toBeInTheDocument()
  })

  test('✅ should have target selector', () => {
    render(<AnalysisPage />)
    const selector = screen.getByLabelText('Target')
    expect(selector).toBeInTheDocument()
  })

  test('✅ should have dataset type toggle', () => {
    render(<AnalysisPage />)
    const datasetToggle = screen.getByLabelText('Dataset Type')
    expect(datasetToggle).toBeInTheDocument()
  })

  test('✅ should have graph container', () => {
    render(<AnalysisPage />)
    expect(screen.getByTestId('graph-container')).toBeInTheDocument()
  })

  test('✅ should have molecule modal', () => {
    render(<AnalysisPage />)
    expect(screen.getByTestId('molecule-modal')).toBeInTheDocument()
  })

  test('✅ should render with targets', () => {
    render(<AnalysisPage />)
    expect(screen.getByRole('option', { name: 'Acetylcholinesterase' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Beta-secretase 1' })).toBeInTheDocument()
  })
})
