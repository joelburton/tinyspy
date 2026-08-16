// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RANKS } from '../../lib/game/rankLadder'
import { RankBar } from './RankBar'

/**
 * The rank ladder is a READOUT, and these pin the one thing that makes it one:
 * **nothing in it is focusable.**
 *
 * The tiers carried `tabIndex={0}` until 2026-08-16 and it trapped the player.
 * Clicking a square parked focus on it (no ring yet — `:focus-visible` is
 * correctly false for a mouse click), then the NEXT keystroke promoted it,
 * because the browser re-evaluates focus-visible on any keyboard interaction
 * even when it acts on nothing. The ring and the tooltip then stuck: the pointer
 * leaving didn't clear them, and Tab couldn't move focus away either, since the
 * capture-entry games swallow Tab by design. Just resuming play lit a square up
 * and left it lit.
 *
 * The bar renders TWICE per game (info column + mobile status bar) in both
 * spellingbee and wordwheel, so that was fourteen dead tab stops ahead of every
 * real control.
 */
describe('RankBar — a readout, not a control', () => {
  it('puts nothing in the tab order', () => {
    const { container } = render(<RankBar score={12} total={40} targetIdx={4} />)
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0)
    // No implicitly-focusable element either — a tier is an <li>, never a
    // <button>. If a tooltip ever needs real keyboard reach, it gets a proper
    // button (common/theme.css → `.definable` names the same escape hatch),
    // not a tabIndex back on the list item.
    expect(container.querySelectorAll('button, a[href], input')).toHaveLength(0)
  })

  it('still says everything it needs to in text', () => {
    render(<RankBar score={12} total={40} targetIdx={6} />)
    // The current rank as the label above the track…
    expect(screen.getByText('Solid')).toBeInTheDocument()
    // …and every tier's own tooltip text, present in the DOM and revealed by
    // hover (or, on a phone, by the sticky :hover a tap leaves behind).
    for (const name of RANKS) {
      expect(screen.getByText(new RegExp(`^${name} · \\d+ pts`))).toBeInTheDocument()
    }
    // The target tier says so in its bubble, which is where that fact lived
    // besides the outline.
    expect(screen.getByText(/· target$/)).toBeInTheDocument()
  })
})
