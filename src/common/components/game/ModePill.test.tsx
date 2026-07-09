import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ModePill } from './ModePill'

describe('ModePill', () => {
  it('shows the mode label on a normal (friend) club', () => {
    const { rerender } = render(<ModePill mode="coop" />)
    expect(screen.getByText('Co-op')).toBeInTheDocument()
    rerender(<ModePill mode="compete" />)
    expect(screen.getByText('Compete')).toBeInTheDocument()
  })

  it('suppresses the pill for a solo club coop game (mode is noise with one member)', () => {
    const { container } = render(<ModePill mode="coop" soloClub />)
    expect(container).toBeEmptyDOMElement()
  })

  it('labels a solo club compete game "AI Compete" (a race vs the bot)', () => {
    render(<ModePill mode="compete" soloClub />)
    expect(screen.getByText('AI Compete')).toBeInTheDocument()
  })
})
