// cs-met-rank-ladder

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RANKS } from './rankLadder'
import { RankBar } from './RankBar'
import styles from './RankBar.module.css'

/**
 * The rank ladder is a READOUT, and these pin the one thing that makes it one:
 * **nothing in it is focusable.**
 *
 * The tiers carried `tabIndex={0}` until 2026-08-16 and it trapped the player.
 * Clicking a square parked focus on it (no ring yet — `:focus-visible` is
 * correctly false for a mouse click), then the NEXT keystroke promoted it,
 * because the browser re-evaluates focus-visible on any keyboard interaction
 * even when it acts on nothing. The ring and the tooltip then stuck: the pointer
 * leaving didn't clear them, and Tab couldn't move focus away either, since a
 * play surface's tab ring is empty by design. Just resuming play lit a square
 * up and left it lit.
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
    // button (common/core-css/utilities.css → `.definable` names the same escape hatch),
    // not a tabIndex back on the list item.
    expect(container.querySelectorAll('button, a[href], input')).toHaveLength(0)
  })

  it('fills every square up to the current rank, and no further', () => {
    // The component's whole job, and nothing pinned it: making `.achieved`
    // unreachable left all 20 tests green.
    //
    // Selected through the stylesheet's own export rather than a literal class
    // name — the build hashes these (`_achieved_f92464`), so a literal would
    // pass only by accident. What this pins is the WIRING, which tiers get
    // marked at a given score; that the class paints anything is the
    // stylesheet's business and no render test can see it.
    const filled = (score: number, total: number) =>
      render(<RankBar score={score} total={total} />).container.querySelectorAll(
        `.${styles.achieved}`,
      ).length

    // Start is index 0 and is reached by definition, so the bar is never empty.
    expect(filled(0, 40)).toBe(1)
    // Mid-ladder: 12/40 is 30% of the max, which is Solid — the same score the
    // case below reads the label for.
    expect(filled(12, 40)).toBe(3)
    // A full clear fills the lot. NOT the clamp, though it reads like it:
    // `i <= idx` caps at seven whatever `idx` is, because there are seven
    // squares — planting an unclamped index still passes this. The clamp is
    // `currentRankIndex`'s and `rankLadder.test.ts` pins it there.
    expect(filled(40, 40)).toBe(RANKS.length)
  })

  it('still says everything it needs to in text', () => {
    const { container } = render(<RankBar score={12} total={40} targetIdx={6} />)
    // The current rank as the label above the track…
    expect(screen.getByText('Solid')).toBeInTheDocument()
    // …and every tier naming itself for the shared tooltip host, which is what
    // draws the bubble — so what this component owes is the ATTRIBUTE, and
    // whether a bubble appears from it is TooltipHost.test.tsx's.
    const tips = [...container.querySelectorAll('[data-tooltip]')].map((el) =>
      el.getAttribute('data-tooltip'),
    )
    expect(tips).toHaveLength(RANKS.length)
    for (const [i, name] of RANKS.entries()) {
      expect(tips[i]).toMatch(new RegExp(`^${name} · \\d+ pts`))
    }
    // The target tier says so in its bubble, which is where that fact lives
    // besides the outline.
    expect(tips.filter((t) => t?.endsWith('· target'))).toHaveLength(1)
    // And it asks as a READOUT, which is what buys the instant reveal and the
    // tap: a square's only purpose is the bubble.
    expect(container.querySelectorAll('[data-tooltip-on="readout"]')).toHaveLength(RANKS.length)
  })
})
