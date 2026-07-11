/**
 * The ActionButton tooltip contract: every purpose button gets the styled
 * `data-tooltip` bubble (rendered by TooltipHost) — the fast replacement for the native
 * `title`, which some browsers delay past the point users notice it.
 * Defaults to the label; an explicit `tooltip` prop overrides; the native
 * `title` is gone (two bubbles would race).
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActionButton } from './ActionButton'
import { RestartButton } from './RestartButton'
import { IconEnd } from '../icons'

describe('ActionButton — styled tooltip', () => {
  it('defaults the tooltip to the label', () => {
    render(<ActionButton icon={IconEnd} label="End" />)
    const btn = screen.getByRole('button', { name: 'End' })
    expect(btn).toHaveAttribute('data-tooltip', 'End')
    expect(btn).not.toHaveAttribute('title')
  })

  it('an explicit tooltip prop overrides the label', () => {
    render(<ActionButton icon={IconEnd} label="End" tooltip="End the game for everyone" />)
    expect(screen.getByRole('button', { name: 'End' })).toHaveAttribute(
      'data-tooltip',
      'End the game for everyone',
    )
  })

  it('iconOnly keeps the aria-label and the tooltip', () => {
    render(<ActionButton icon={IconEnd} label="End" iconOnly />)
    const btn = screen.getByRole('button', { name: 'End' })
    expect(btn).toHaveAttribute('aria-label', 'End')
    expect(btn).toHaveAttribute('data-tooltip', 'End')
  })

  it('purpose buttons pass tooltip through (and default it to their label)', () => {
    render(<RestartButton />)
    expect(screen.getByRole('button', { name: 'Restart' })).toHaveAttribute(
      'data-tooltip',
      'Restart',
    )
  })
})
