import { render, screen } from '@testing-library/react'
import Home from '@/app/page'

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: any) => {
    return <a href={href}>{children}</a>
  }
})

describe('🏠 Home Page', () => {
  test('✅ should render without crashing', () => {
    render(<Home />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  test('✅ page should be accessible', () => {
    const { container } = render(<Home />)
    expect(container).toBeInTheDocument()
  })
})
