// cs-unmet

import { describe, expect, it } from 'vitest'
import { DEFAULT_WORDSY_SETUP, wordsySetupError } from './setup'
import { makeSetupRows } from './setupRows'
import type { GSetup } from '../types'

describe('wordsySetupError', () => {
  it('passes the defaults', () => {
    expect(wordsySetupError(DEFAULT_WORDSY_SETUP)).toEqual({})
  })

  it('refuses a band outside 1–6, under its field', () => {
    expect(wordsySetupError({ ...DEFAULT_WORDSY_SETUP, legal_band: 7 })).toEqual({ legal_band: 'Pick a dictionary.' })
    expect(wordsySetupError({ ...DEFAULT_WORDSY_SETUP, legal_band: 0 })).toEqual({ legal_band: 'Pick a dictionary.' })
  })

  it('refuses a round style it does not know, under its field', () => {
    expect(wordsySetupError({ ...DEFAULT_WORDSY_SETUP, round_style: 'fast' as never }))
      .toEqual({ round_style: 'Pick how a round ends.' })
  })

  it('refuses a length other than 7 or 3, under its field', () => {
    expect(wordsySetupError({ ...DEFAULT_WORDSY_SETUP, n_rounds: 5 as never }))
      .toEqual({ n_rounds: 'Pick a length.' })
  })
})

describe('makeSetupRows', () => {
  const rows = (setup: Partial<GSetup>) =>
    Object.fromEntries(makeSetupRows({ ...DEFAULT_WORDSY_SETUP, ...setup }, 'compete', [])
      .filter((r) => r.key !== 'players')
      .map((r) => [r.key, r.value]))

  it('names the length and the round', () => {
    expect(rows({ n_rounds: 3 })).toMatchObject({ n_rounds: '3 rounds, best 2', round_style: '30-second timer' })
  })

  it('says one word in the Round row, in the timer style only', () => {
    expect(rows({ one_word: true }).round_style).toBe('30-second timer, one word')
    expect(rows({ one_word: true, round_style: 'no-timer' }).round_style).toBe('No timer')
  })
})
