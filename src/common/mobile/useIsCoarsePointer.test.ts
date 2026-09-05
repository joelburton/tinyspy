// cs-met-mobile

import { describe, expect, it } from 'vitest'
import { readCustomMedia } from './readCustomMedia'
import { COARSE_QUERY } from './useIsCoarsePointer'

/**
 * `--touch` decides whether a panel is draggable at all, so a copy that drifts
 * from the CSS hands the drag binding back to the devices that can't use it —
 * and with it the bug where react-draggable's `preventDefault` eats the tap on
 * the close button. `readCustomMedia` explains why the copy exists at all.
 */
describe('useIsCoarsePointer', () => {
  it('asks the same question as --touch in breakpoints.css', () => {
    expect(COARSE_QUERY).toBe(readCustomMedia('--touch'))
  })
})
