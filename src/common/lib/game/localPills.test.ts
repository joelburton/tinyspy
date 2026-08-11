import { describe, expect, it } from 'vitest'
import { outOfRacePill, stickyPill, terminalPill } from './localPills'

/**
 * Which MODE each below-board pill is filed under.
 *
 * This is the thing that was wrong: `outOfRacePill` — "Conceded — race
 * continues" — was built as `sticky`, so a keystroke wiped the only statement of
 * the player's own status, and (once tap-to-dismiss shipped) it advertised a tap
 * that couldn't work. It's a standing CONDITION, replaced later by the verdict,
 * never dismissed. Categories are a one-word decision at a call site and there's
 * nothing at runtime to notice a wrong one, so they're pinned here.
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
