// cs-met-turn-log

/**
 * Tests for <TurnLog> — the shared panel every game's log wears.
 *
 * One behavior, and it is the one a caller can silently break: the panel snaps
 * its box to the newest row when the log GROWS, and leaves the scroll alone on
 * any other render. Six games used to pass the rows array, which is a fresh
 * object every render, so a game with a clock re-snapped the log once a second
 * and scrolling back was impossible. `entryCount` is a number so that an
 * unchanged log compares equal and the effect doesn't run.
 *
 * jsdom does no layout, so `scrollHeight` is 0 — the snap is observable as
 * "scrollTop was put back to 0", which is all this needs to tell the two cases
 * apart.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TurnLog } from './TurnLog'

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => (
    <tr key={i}>
      <td>turn {i + 1}</td>
    </tr>
  ))

/** The scroll box is the panel's only scrollable element. */
const box = (c: HTMLElement) => c.querySelector('section > div') as HTMLDivElement

const panel = (n: number) => (
  <TurnLog heading="Turns" entryCount={n} empty={n === 0}>
    {rows(n)}
  </TurnLog>
)

describe('TurnLog — scrolling to the newest entry', () => {
  it('leaves a scrolled-up box alone when a render adds no entry', () => {
    const { container, rerender } = render(panel(3))
    box(container).scrollTop = 120

    // The same log, rendered again — what a clock tick does once a second.
    rerender(panel(3))

    expect(box(container).scrollTop).toBe(120)
  })

  it('snaps to the bottom when an entry arrives', () => {
    const { container, rerender } = render(panel(3))
    box(container).scrollTop = 120

    rerender(panel(4))

    expect(box(container).scrollTop).toBe(0)
  })

  it('snaps when an entry GROWS, which is what a count bigger than the entries is for', () => {
    // codenamesduet's case: its entry is a turn, and a guess lands inside a turn
    // that already exists — so it counts clues + guesses, and the count moves
    // even though the number of entries does not.
    const { container, rerender } = render(panel(3))
    box(container).scrollTop = 120

    rerender(panel(5))

    expect(box(container).scrollTop).toBe(0)
  })
})
