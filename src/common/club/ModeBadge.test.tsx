// cs-blessed-club-page

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ModeBadge } from './ModeBadge'

describe('ModeBadge', () => {
  it('shows the mode label on a normal (friend) club', () => {
    const { rerender } = render(<ModeBadge mode="coop" />)
    expect(screen.getByText('Co-op')).toBeInTheDocument()
    rerender(<ModeBadge mode="compete" />)
    expect(screen.getByText('Compete')).toBeInTheDocument()
  })

  it('suppresses the badge for a solo club coop game (mode is noise with one member)', () => {
    const { container } = render(<ModeBadge mode="coop" soloClub />)
    expect(container).toBeEmptyDOMElement()
  })

  it('labels a solo club compete game "AI Compete" ONLY when the manifest seats an AI', () => {
    // scrabble: solo compete = a race vs the bot → labeled.
    render(<ModeBadge mode="compete" soloClub aiOpponent />)
    expect(screen.getByText('AI Compete')).toBeInTheDocument()
  })

  it('suppresses the badge for a solo club compete game WITHOUT an AI ("compete for 1")', () => {
    // bananagrams: nobody to beat when solo — reads as coop, so no badge.
    const { container } = render(<ModeBadge mode="compete" soloClub />)
    expect(container).toBeEmptyDOMElement()
  })
})
