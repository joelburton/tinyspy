import { describe, expect, it } from 'vitest'
import {
  wordiplySetupError,
  DEFAULT_WORDIPLY_SETUP_COOP,
  DEFAULT_WORDIPLY_SETUP_COMPETE,
  type WordiplySetup,
} from './setup'

const base: WordiplySetup = DEFAULT_WORDIPLY_SETUP_COOP

describe('wordiplySetupError', () => {
  it('accepts a difficulty within 1..6', () => {
    expect(wordiplySetupError(base)).toBeNull()
    expect(wordiplySetupError({ ...base, difficulty: 1 })).toBeNull()
    expect(wordiplySetupError({ ...base, difficulty: 6 })).toBeNull()
  })

  it('rejects a difficulty outside 1..6', () => {
    expect(wordiplySetupError({ ...base, difficulty: 0 })).not.toBeNull()
    expect(wordiplySetupError({ ...base, difficulty: 7 })).not.toBeNull()
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
})
