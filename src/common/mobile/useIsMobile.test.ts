// cs-met-mobile

import { describe, expect, it } from 'vitest'
import { readCustomMedia } from './readCustomMedia'
import { MOBILE_QUERY } from './useIsMobile'

/**
 * The collapse line is written twice — `--mobile` in breakpoints.css and
 * `MOBILE_QUERY` here — and this is what stops the two drifting; `readCustomMedia`
 * explains why the second copy has to exist. Tuning it in the CSS alone would
 * fold the two-column layouts at one width while the JS-rendered mobile branches
 * (the menu drill-down, the info sheet) switch at another.
 */
describe('useIsMobile', () => {
  it('asks the same question as --mobile in breakpoints.css', () => {
    expect(MOBILE_QUERY).toBe(readCustomMedia('--mobile'))
  })
})
