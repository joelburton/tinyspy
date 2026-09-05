// cs-met-feedback

import { describe, expect, it } from 'vitest'
import { outOfRacePill, stickyPill, terminalPill } from './localPills'

/**
 * Which MODE each below-board pill is filed under.
 *
 * A mode is a one-word decision at a call site, and nothing at runtime notices
 * a wrong one — the pill still renders, just dismissible when it shouldn't be,
 * or standing when it should have gone. So the three are pinned here.
 *
 * `outOfRacePill` is the one worth the case. "Conceded — race continues" is a
 * standing CONDITION, replaced later by the verdict and never dismissed; built
 * as `sticky` it would advertise a tap that clears the only statement of the
 * player's own status.
 */

describe('below-board pill modes', () => {
  it('an own-move result is a message — sticky', () => {
    expect(stickyPill('error', 'Not a word').mode).toEqual({ kind: 'sticky' })
  })

  it('the terminal verdict is a condition — permanent', () => {
    expect(terminalPill('won', 'Won: covered in 4').mode).toEqual({ kind: 'permanent' })
  })

  it('out-of-race is a condition too — permanent, not sticky', () => {
    // Both spellings: conceded, and simply out of the running.
    expect(outOfRacePill(true).mode).toEqual({ kind: 'permanent' })
    expect(outOfRacePill(false).mode).toEqual({ kind: 'permanent' })
    expect(outOfRacePill(true).text).toMatch(/conceded/i)
  })
})
