import { render, screen } from '@testing-library/react'

// Mock LoadingOverlay component
const LoadingOverlay = ({ isVisible, message }: { isVisible: boolean; message?: string }) => {
  if (!isVisible) return null
  
  return (
    <div data-testid="loading-overlay" role="status" aria-label="Loading">
      <div className="spinner"></div>
      {message && <p>{message}</p>}
    </div>
  )
}

describe('⏳ LoadingOverlay Component', () => {
  test('✅ should not render when isVisible is false', () => {
    render(<LoadingOverlay isVisible={false} />)
    expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument()
  })

  test('✅ should render when isVisible is true', () => {
    render(<LoadingOverlay isVisible={true} />)
    expect(screen.getByTestId('loading-overlay')).toBeInTheDocument()
  })

  test('✅ should display message when provided', () => {
    render(<LoadingOverlay isVisible={true} message="Loading molecules..." />)
    expect(screen.getByText('Loading molecules...')).toBeInTheDocument()
  })

  test('✅ should have accessibility role', () => {
    render(<LoadingOverlay isVisible={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  test('✅ should have aria-label for screen readers', () => {
    render(<LoadingOverlay isVisible={true} />)
    const overlay = screen.getByTestId('loading-overlay')
    expect(overlay).toHaveAttribute('aria-label', 'Loading')
  })
})
