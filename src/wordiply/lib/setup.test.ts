// cs-unmet

import { describe, expect, it } from 'vitest'
import {
  cleanBase,
  customBaseError,
  wordiplySetupError,
  DEFAULT_WORDIPLY_SETUP_COOP,
  DEFAULT_WORDIPLY_SETUP_COMPETE,
  type WordiplySetup,
} from './setup'

const base: WordiplySetup = DEFAULT_WORDIPLY_SETUP_COOP

/** Both of wordiply's frontend refusals name the control they are about, so
 *  the key is asserted with the words: a message under the wrong box reads as
 *  correct on screen and is the failure this shape exists to stop. */
const onBase = { custom_base: expect.any(String) }

describe('wordiplySetupError', () => {
  it('accepts a difficulty within 1..6', () => {
    expect(wordiplySetupError(base)).toEqual({})
    expect(wordiplySetupError({ ...base, difficulty: 1 })).toEqual({})
    expect(wordiplySetupError({ ...base, difficulty: 6 })).toEqual({})
  })

  it('rejects a difficulty outside 1..6, under Dictionary', () => {
    for (const difficulty of [0, 7]) {
      expect(wordiplySetupError({ ...base, difficulty })).toEqual({
        difficulty: expect.any(String),
      })
    }
  })
})

describe('cleanBase', () => {
  it('lowercases, and drops anything that is not a letter', () => {
    expect(cleanBase('MOTH')).toBe('moth')
    expect(cleanBase('  moth ')).toBe('moth')
    expect(cleanBase('mo-th')).toBe('moth')
    expect(cleanBase('mo7h')).toBe('moh')
  })

  it('truncates past 4 — paste does not respect the input maxLength', () => {
    expect(cleanBase('mothball')).toBe('moth')
  })
})

describe('customBaseError', () => {
  it('accepts blank — that is the random-starter default, not an error', () => {
    expect(customBaseError(base)).toEqual({})
    expect(customBaseError({ ...base, custom_base: '' })).toEqual({})
    expect(customBaseError({ ...base, custom_base: '   ' })).toEqual({})
  })

  it('accepts 2..4 letters, in any case or spacing', () => {
    for (const b of ['ar', 'owl', 'moth', 'MOTH', ' Moth ']) {
      expect(customBaseError({ ...base, custom_base: b }), b).toEqual({})
    }
  })

  it('rejects a starter that cleans down to a single letter, under the starter box', () => {
    expect(customBaseError({ ...base, custom_base: 'm' })).toEqual(onBase)
    // Everything but the 'a' is stripped, leaving one letter — the rejection
    // has to follow the CLEANED value, not the raw one.
    expect(customBaseError({ ...base, custom_base: 'a-!' })).toEqual(onBase)
  })

  it('does NOT judge whether the letters yield a board — that is the server call', () => {
    // ING matches 20k words and YAKS has one 6-letter child; both are rejected
    // at Start by the edge function, and both must pass the shape gate to get
    // there. A frontend that guessed here would guess wrong.
    expect(customBaseError({ ...base, custom_base: 'ing' })).toEqual({})
    expect(customBaseError({ ...base, custom_base: 'yaks' })).toEqual({})
  })

  it('is part of the Start gate', () => {
    expect(wordiplySetupError({ ...base, custom_base: 'm' })).toEqual(onBase)
    expect(wordiplySetupError({ ...base, custom_base: 'moth' })).toEqual({})
  })
})

describe('defaults', () => {
  it('both manifests default to difficulty 5, timer off, no target_rank', () => {
    for (const d of [DEFAULT_WORDIPLY_SETUP_COOP, DEFAULT_WORDIPLY_SETUP_COMPETE]) {
      expect(d.difficulty).toBe(5)
      expect(d.timer).toEqual({ kind: 'none' })
      expect('target_rank' in d).toBe(false)
    }
  })

  it('neither seeds custom_base — a starter is opt-in, and blank means random', () => {
    for (const d of [DEFAULT_WORDIPLY_SETUP_COOP, DEFAULT_WORDIPLY_SETUP_COMPETE]) {
      expect('custom_base' in d).toBe(false)
    }
  })
})
