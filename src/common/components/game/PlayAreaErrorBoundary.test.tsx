import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayAreaErrorBoundary } from './PlayAreaErrorBoundary'

/**
 * The play-surface boundary's contract: children render untouched until one
 * throws, then the whole surface is replaced by the what-broke card (message +
 * Reload) instead of React unmounting to a blank page.
 */
function Bomb(): never {
  throw new Error('chunk went missing')
}

describe('PlayAreaErrorBoundary', () => {
  beforeEach(() => {
    // React logs every caught boundary error to console.error; keep the test
    // output clean without hiding unrelated failures from other tests.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders its children when nothing throws', () => {
    render(
      <PlayAreaErrorBoundary>
        <p>the play area</p>
      </PlayAreaErrorBoundary>,
    )
    expect(screen.getByText('the play area')).toBeInTheDocument()
  })

  it('replaces a throwing child with the error card', () => {
    render(
      <PlayAreaErrorBoundary>
        <Bomb />
      </PlayAreaErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('chunk went missing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})
