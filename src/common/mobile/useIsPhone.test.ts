// cs-blessed-mobile

import { describe, expect, it } from 'vitest'
import { readCustomMedia } from './readCustomMedia'
import { PHONE_QUERY } from './useIsPhone'

/**
 * `--phone` is the only two-armed condition of the three (a narrow width OR a
 * short landscape), so a hand-edited copy can lose an arm and still look
 * plausible — phones would keep their tight layout upright and lose it on their
 * side. `readCustomMedia` explains why the copy exists at all.
 */
describe('useIsPhone', () => {
  it('asks the same question as --phone in breakpoints.css', () => {
    expect(PHONE_QUERY).toBe(readCustomMedia('--phone'))
  })
})
