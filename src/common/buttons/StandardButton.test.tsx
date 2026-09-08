// cs-blessed-buttons

/**
 * The rules that keep `label`, `show` and `tooltip` three separate things
 * rather than one prop doing three jobs.
 *
 * Worth pinning because most of them are invisible in the markup until they go
 * wrong: a button drawing no words still has to BE something (most buttons in
 * the app are icon-only, and the test suite finds buttons by that name), and a
 * button whose words ARE drawn must not also get a bubble repeating them.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StandardButton } from './StandardButton'
import { RestartButton } from './RestartButton'
import { CancelButton } from './CancelButton'
import { BackToClubButton } from './BackToClubButton'
import { IconEndGame } from '../icons/icons'

describe('StandardButton — label, show, tooltip', () => {
  it('show="both" draws the words and the glyph', () => {
    render(<StandardButton label="End" icon={IconEndGame} show="both" />)
    const btn = screen.getByRole('button', { name: 'End' })
    expect(btn).toHaveTextContent('End')
    expect(btn.querySelector('svg')).not.toBeNull()
  })

  it('show="icon" draws no words, and the label survives as the bubble', () => {
    render(<StandardButton label="End" icon={IconEndGame} show="icon" />)
    const btn = screen.getByRole('button', { name: 'End' })
    expect(btn).toHaveTextContent('')
    expect(btn).toHaveAttribute('aria-label', 'End')
    expect(btn).toHaveAttribute('data-tooltip', 'End')
  })

  it('show="label" draws no glyph', () => {
    render(<StandardButton label="End" icon={IconEndGame} show="label" />)
    expect(screen.getByRole('button', { name: 'End' }).querySelector('svg')).toBeNull()
  })

  it('drawn words get NO bubble — one that repeated them would be noise', () => {
    render(<StandardButton label="End" icon={IconEndGame} show="both" />)
    expect(screen.getByRole('button', { name: 'End' })).not.toHaveAttribute('data-tooltip')
  })

  it('an explicit tooltip shows even when the words are drawn — and renames the button', () => {
    render(
      <StandardButton
        label="End"
        icon={IconEndGame}
        show="both"
        tooltip="End the game for everyone"
      />,
    )
    const btn = screen.getByRole('button', { name: 'End the game for everyone' })
    expect(btn).toHaveAttribute('data-tooltip', 'End the game for everyone')
    expect(btn).toHaveTextContent('End')
  })

  it('no tooltip and drawn words: the text names it, with no aria-label repeating it', () => {
    render(<StandardButton label="End" icon={IconEndGame} show="both" />)
    expect(screen.getByRole('button', { name: 'End' })).not.toHaveAttribute('aria-label')
  })

  it('tooltip={null} suppresses the bubble but not the name', () => {
    render(<StandardButton label="End" icon={IconEndGame} show="icon" tooltip={null} />)
    const btn = screen.getByRole('button', { name: 'End' })
    expect(btn).not.toHaveAttribute('data-tooltip')
    expect(btn).toHaveAttribute('aria-label', 'End')
  })

  it('never carries a native title — two bubbles would race', () => {
    render(<StandardButton label="End" icon={IconEndGame} show="icon" />)
    expect(screen.getByRole('button', { name: 'End' })).not.toHaveAttribute('title')
  })
})

describe('purpose buttons', () => {
  it('supply their own label, and stay overridable on every axis', () => {
    const { rerender } = render(<RestartButton show="both" />)
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument()
    rerender(<RestartButton show="both" label="Start over" />)
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument()
  })

  it('an explicitly-passed undefined takes the default, the way omitting it does', () => {
    // What default parameters give us, and why purpose buttons declare their
    // defaults that way rather than spreading over them.
    render(<RestartButton show="both" label={undefined} />)
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument()
  })

  it('a Cancel is a standard button whose glyph is never drawn', () => {
    render(<CancelButton show="label" onClick={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Cancel' })
    expect(btn).toHaveTextContent('Cancel')
    expect(btn.querySelector('svg')).toBeNull()
  })

  it('Back-to-club draws "Club" and stays called "Back to club"', () => {
    // The one button whose drawn words and name differ, in both forms — which
    // is the whole reason `tooltip` is separate from `label`.
    const { rerender } = render(<BackToClubButton show="both" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Back to club' })).toHaveTextContent('Club')
    rerender(<BackToClubButton show="icon" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Back to club' })).toHaveTextContent('')
  })
})
