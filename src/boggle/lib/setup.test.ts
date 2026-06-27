import { describe, expect, it } from 'vitest'
import { DEFAULT_BOGGLE_SETUP_COOP, boggleLegalError } from './setup'

describe('boggleLegalError', () => {
  it('accepts the defaults', () => {
    expect(boggleLegalError(DEFAULT_BOGGLE_SETUP_COOP)).toBeNull()
  })
  it('rejects an unknown dice set', () => {
    expect(boggleLegalError({ ...DEFAULT_BOGGLE_SETUP_COOP, dice_set: 'zzz' })).toMatch(/dice set/i)
  })
  it('rejects an out-of-range band', () => {
    expect(boggleLegalError({ ...DEFAULT_BOGGLE_SETUP_COOP, band: 9 })).toMatch(/band/i)
  })
  it('rejects a too-low min word length', () => {
    expect(boggleLegalError({ ...DEFAULT_BOGGLE_SETUP_COOP, min_word_length: 2 })).toMatch(/length/i)
  })
  it('rejects an unknown scoring ladder', () => {
    expect(
      boggleLegalError({ ...DEFAULT_BOGGLE_SETUP_COOP, scoring_ladder: 'nope' as never }),
    ).toMatch(/ladder/i)
  })
})
