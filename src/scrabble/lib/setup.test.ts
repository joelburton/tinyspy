// cs-unmet

/**
 * scrabble's Start gate — the AI's two demands, and where each one lands.
 *
 * Worth its own file for one reason the roster has nowhere else: the dictionary
 * rule is about **two controls at once**. A server raise can never say that — a
 * raise stops at the first failure — so this is the case that decides the
 * frontend's half is an object rather than one entry, and the assertions are
 * written to fail if it ever collapses back to naming a single select.
 *
 * It also only rings the selects actually below the band. Reddening a
 * dictionary that is already wide enough would tell the player to change
 * something that is correct.
 */
import { describe, expect, it } from 'vitest'
import { AI_BAND, DEFAULT_SCRABBLE_SETUP, validateScrabbleSetup } from './setup'

const setup = (over: Partial<typeof DEFAULT_SCRABBLE_SETUP> = {}) => ({
  ...DEFAULT_SCRABBLE_SETUP,
  ...over,
})

describe('validateScrabbleSetup — with no AI', () => {
  it('has nothing to say, whatever the dictionaries are', () => {
    // Every rule here is the AI's. A table of humans plays at any band.
    expect(validateScrabbleSetup(setup({ ai_count: 0, dict_2: 1 }), 4)).toEqual({})
    expect(validateScrabbleSetup(setup({ ai_count: 0 }), 1)).toEqual({})
  })
})

describe('validateScrabbleSetup — the headcount', () => {
  it('refuses more than four at the board, under the count you can change', () => {
    // The human count is the club roster's checkboxes; the number this message
    // asks you to lower is the AI's, so that is the field it rings.
    expect(validateScrabbleSetup(setup({ ai_count: 2, ai_level: 'beginner' }), 3)).toEqual({
      ai_count: expect.stringMatching(/3 human \+ 2 AI/),
    })
  })

  it('accepts a table of exactly four', () => {
    expect(validateScrabbleSetup(setup({ ai_count: 1, ai_level: 'beginner' }), 3)).toEqual({})
  })

  it('refuses a race with nobody to race, since an AI needs an opponent', () => {
    expect(validateScrabbleSetup(setup({ ai_count: 1, ai_level: 'beginner' }), 0)).toEqual({
      ai_count: expect.stringMatching(/at least 2 players/),
    })
  })
})

describe('validateScrabbleSetup — the AI needs a dictionary it can play in', () => {
  it('rings BOTH dictionaries when both are too narrow', () => {
    // The multi-field case. Naming one select would leave the other silently
    // wrong, and the player would fix the red one and be refused again.
    const errors = validateScrabbleSetup(
      setup({ ai_count: 1, ai_level: 'strong', dict_2: 1, dict_3plus: 1 }),
      1,
    )
    expect(Object.keys(errors).sort()).toEqual(['dict_2', 'dict_3plus'])
    expect(errors.dict_2).toMatch(/Strong AI/)
    expect(errors.dict_2).toBe(errors.dict_3plus)
  })

  it('rings only the one that is short', () => {
    const band = AI_BAND.intermediate
    expect(
      validateScrabbleSetup(
        setup({ ai_count: 1, ai_level: 'intermediate', dict_2: band, dict_3plus: 1 }),
        1,
      ),
    ).toEqual({ dict_3plus: expect.stringMatching(/Intermediate AI/) })
  })

  it('accepts dictionaries at exactly the level band', () => {
    const band = AI_BAND.casual
    expect(
      validateScrabbleSetup(
        setup({ ai_count: 1, ai_level: 'casual', dict_2: band, dict_3plus: band }),
        1,
      ),
    ).toEqual({})
  })

  it('lets a beginner play at any band, since its floor is the lowest there is', () => {
    expect(
      validateScrabbleSetup(
        setup({ ai_count: 1, ai_level: 'beginner', dict_2: 1, dict_3plus: 1 }),
        1,
      ),
    ).toEqual({})
  })
})
