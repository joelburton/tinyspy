// cs-unmet

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayAreaErrorBoundary } from './PlayAreaErrorBoundary'

/**
 * The play-surface boundary's contract: children render untouched until one
 * throws, then the whole surface is replaced by an `<ErrorPage>` — the thrown
 * message, a diagnostics line, and BOTH ways out — instead of React unmounting
 * to a blank page.
 *
 * Reload is asserted beside "← Back home" rather than instead of it: a crashed
 * render is the one dead end where retrying the same URL is a real fix, and
 * losing that button to a later tidy would leave a stuck player with only the
 * exit (plans/areas/homepage.md → F39 `loading-and-errors`).
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

  it('replaces a throwing child with the error page', () => {
    render(
      <PlayAreaErrorBoundary>
        <Bomb />
      </PlayAreaErrorBoundary>,
    )
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('chunk went missing')).toBeInTheDocument()
    expect(screen.getByText(/key=render-crashed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByText('← Back home')).toBeInTheDocument()
  })
})
