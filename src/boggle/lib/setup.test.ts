import { describe, expect, it } from 'vitest'
import { DEFAULT_BOGGLE_SETUP_COOP, legalError } from './setup'

describe('legalError', () => {
  it('accepts the defaults', () => {
    expect(legalError(DEFAULT_BOGGLE_SETUP_COOP)).toBeNull()
  })
  it('rejects an unknown dice set', () => {
    expect(legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, dice_set: 'zzz' })).toMatch(/dice set/i)
  })
  it('rejects an out-of-range band', () => {
    expect(legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, band: 9 })).toMatch(/band/i)
  })
  it('rejects a too-low min word length', () => {
    expect(legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, min_word_length: 2 })).toMatch(/length/i)
  })
  it('rejects an unknown scoring ladder', () => {
    expect(
      legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, scoring_ladder: 'nope' as never }),
    ).toMatch(/ladder/i)
  })
})
