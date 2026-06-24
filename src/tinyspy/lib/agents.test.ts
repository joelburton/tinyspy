import { describe, expect, it } from 'vitest'
import { agentsAllContacted } from './agents'
import type { KeyLabel } from './labels'

// A tiny board: positions 0..4. The `key` array is one seat's view; the
// `words` carry the global reveal state. Only positions matter, so the
// word text / neutral flags are omitted.
const word = (position: number, revealed_as: string | null) => ({ position, revealed_as })

describe('agentsAllContacted', () => {
  it('is false when some of the seat\'s agents are still uncontacted', () => {
    const key: KeyLabel[] = ['G', 'N', 'G', 'A', 'N']
    // Only position 0 (a 'G') is contacted; position 2 (also 'G') is not.
    const words = [word(0, 'G'), word(1, null), word(2, null), word(3, null), word(4, null)]
    expect(agentsAllContacted(key, words)).toBe(false)
  })

  it('is true once every \'G\' on the key is globally revealed green', () => {
    const key: KeyLabel[] = ['G', 'N', 'G', 'A', 'N']
    // Both agents (0 and 2) contacted; the non-agent cells are irrelevant.
    const words = [word(0, 'G'), word(1, null), word(2, 'G'), word(3, null), word(4, null)]
    expect(agentsAllContacted(key, words)).toBe(true)
  })

  it('ignores reveals on non-agent cells (a neutral going green elsewhere)', () => {
    const key: KeyLabel[] = ['G', 'N', 'A', 'N', 'N']
    // Position 0 is the only agent and it IS contacted; a green on
    // position 1 (a neutral on THIS key — the partner's agent) is not
    // this seat's business.
    const words = [word(0, 'G'), word(1, 'G'), word(2, null), word(3, null), word(4, null)]
    expect(agentsAllContacted(key, words)).toBe(true)
  })

  it('is false for an empty (not-yet-loaded) key', () => {
    expect(agentsAllContacted([], [word(0, 'G')])).toBe(false)
  })

  it('is false at the start of a game (no reveals yet)', () => {
    const key: KeyLabel[] = ['G', 'G', 'N', 'A', 'N']
    const words = [word(0, null), word(1, null), word(2, null), word(3, null), word(4, null)]
    expect(agentsAllContacted(key, words)).toBe(false)
  })
})
