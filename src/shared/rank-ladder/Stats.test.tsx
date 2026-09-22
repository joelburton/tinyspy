// cs-blessed-rank-ladder

// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stats } from './Stats'
import styles from './Stats.module.css'

/**
 * The stat grid derives nothing, so there is little behavior to pin — but every
 * piece of what it DOES is a decision with a reason, and each was broken or
 * disagreed with at least once before it was written down.
 *
 * A found/total pair is one figure and is written tight; a second grid built on
 * the same stylesheet wrote it with spaces until 2026-09-21. The denominator is
 * muted, which is what makes the pair read as one figure rather than two
 * numbers. And the sizes are RELATIVE, so the whole grid scales with
 * `--font-size-packed` when it lands in the mobile status bar — a rem would
 * have held its size while the figure beside it shrank.
 */
describe('Stats', () => {
  const grid = () =>
    render(
      <Stats
        foundWordsScore={12}
        requiredWordsScore={93}
        foundWordsCount={4}
        requiredWordsCount={30}
      />,
    ).container

  it('writes a found/total pair TIGHT — one figure, not two numbers', () => {
    // No spaces around the slash. In the mobile status bar they cost width
    // nobody has, and the pair stops reading as a single figure.
    expect(grid().textContent).toContain('12/93')
    expect(grid().textContent).toContain('4/30')
    expect(grid().textContent).not.toMatch(/\d\s+\/|\/\s+\d/)
  })

  it('mutes the denominator, so the pair reads as one figure', () => {
    const muted = [...grid().querySelectorAll(`.${styles.muted}`)].map((el) => el.textContent)
    expect(muted).toEqual(['/93', '/30'])
  })

  it('sizes every figure RELATIVELY, so the grid tracks the surface it lands in', () => {
    // Not a render assertion: `css: false` means nothing here computes a size.
    // This reads the stylesheet, the way TooltipHost.test.tsx reads
    // utilities.css for the rule only CSS can carry.
    //
    // The point is the UNIT, not the numbers. In the info column the parent is
    // the page's 1rem; inside <MobileStatusBar> it is `--font-size-packed`, and
    // an em brings the whole grid down with it. A rem — or a step off the type
    // ramp, which is rem — would hold its size while a neighbor shrank, and
    // the grid would half-track.
    const css = readFileSync('src/shared/rank-ladder/Stats.module.css', 'utf8')
    const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]!.trim())
    expect(sizes, 'no font-size in Stats.module.css').not.toHaveLength(0)
    for (const size of sizes) {
      expect(size, `${size} is not relative — the grid would stop tracking`).toMatch(/em$/)
    }
  })
})
