// cs-blessed-found-words

import { describe, expect, it } from 'vitest'
import type { FoundWordsWord } from './foundWords'
import { buildRevealWords } from './revealWords'

/**
 * The missed set at game over: every legal word nobody found, required and
 * bonus alike.
 *
 * Every word is already on the client — the games ship them at start so the FE
 * can validate and score guesses locally — so this is a pure fold with nothing
 * crossing the wire, and it tests as one.
 */
const w = (word: string, bonus = false): FoundWordsWord => ({ word, points: 1, pangram: false, bonus })

describe('buildRevealWords', () => {
  it('returns every unfound word, required and bonus, each carrying its flag', () => {
    const reveal = buildRevealWords([w('bead'), w('bald'), w('blag', true)], [{ word: 'bead' }])
    expect(reveal.map((x) => [x.word, x.bonus])).toEqual([['bald', false], ['blag', true]])
  })

  it('excludes a found bonus word too, not just a found required one', () => {
    const reveal = buildRevealWords([w('bald'), w('blag', true)], [{ word: 'blag' }])
    expect(reveal.map((x) => x.word)).toEqual(['bald'])
  })
})
