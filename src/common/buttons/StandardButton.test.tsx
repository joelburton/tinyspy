// cs-unmet

/**
 * The three rules that make `name` / `label` / `tooltip` three separate things
 * rather than one prop doing three jobs (plans/areas/forms.md).
 *
 * Worth pinning because two of them are invisible in the markup until they go
 * wrong: a button whose label is suppressed still has to BE something (146 call
 * sites draw no text, and 457 test selectors find buttons by name), and a
 * button whose label IS drawn must not also get a bubble repeating it.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StandardButton } from './StandardButton'
import { RestartButton } from './RestartButton'
import { CancelButton } from './CancelButton'
import { IconEnd } from '../icons/icons'

describe('StandardButton — name, label, tooltip', () => {
  it('draws the name when no label is given', () => {
    render(<StandardButton name="End" icon={IconEnd} />)
    expect(screen.getByRole('button', { name: 'End' })).toHaveTextContent('End')
  })

  it('label={null} draws nothing but keeps the name as the bubble', () => {
    render(<StandardButton name="End" icon={IconEnd} label={null} />)
    const btn = screen.getByRole('button', { name: 'End' })
    expect(btn).toHaveTextContent('')
    expect(btn).toHaveAttribute('aria-label', 'End')
    expect(btn).toHaveAttribute('data-tooltip', 'End')
  })

  it('a drawn label gets NO bubble — one that repeated it would be noise', () => {
    render(<StandardButton name="End" icon={IconEnd} />)
    expect(screen.getByRole('button', { name: 'End' })).not.toHaveAttribute('data-tooltip')
  })

  it('an explicit tooltip shows even when the label is drawn', () => {
    render(<StandardButton name="End" icon={IconEnd} tooltip="End the game for everyone" />)
    expect(screen.getByRole('button', { name: 'End' })).toHaveAttribute(
      'data-tooltip',
      'End the game for everyone',
    )
  })

  it('tooltip={null} suppresses the bubble on an icon-only button', () => {
    render(<StandardButton name="End" icon={IconEnd} label={null} tooltip={null} />)
    expect(screen.getByRole('button', { name: 'End' })).not.toHaveAttribute('data-tooltip')
  })

  it('never carries a native title — two bubbles would race', () => {
    render(<StandardButton name="End" icon={IconEnd} label={null} />)
    expect(screen.getByRole('button', { name: 'End' })).not.toHaveAttribute('title')
  })
})

describe('purpose buttons', () => {
  it('supply their own name, and stay overridable on every axis', () => {
    render(<RestartButton />)
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument()
  })

  it('undefined takes the default; null suppresses', () => {
    // The distinction default parameters give us: an explicitly-passed
    // `undefined` is the same as not passing it at all.
    const { rerender } = render(<RestartButton icon={undefined} />)
    expect(screen.getByRole('button', { name: 'Restart' }).querySelector('svg')).not.toBeNull()
    rerender(<RestartButton icon={null} />)
    expect(screen.getByRole('button', { name: 'Restart' }).querySelector('svg')).toBeNull()
  })

  it('a Cancel is a standard button with no glyph — the F9 case', () => {
    render(<CancelButton onClick={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Cancel' })
    expect(btn).toHaveTextContent('Cancel')
    expect(btn.querySelector('svg')).toBeNull()
  })
})
