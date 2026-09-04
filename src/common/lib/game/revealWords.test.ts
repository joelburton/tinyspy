// cs-audited-game-lib

import { describe, expect, it } from 'vitest'
import { buildRevealWords } from './revealWords'

/**
 * The missed set at game over: every required and bonus word nobody found,
 * each tagged with which shipped list it came from.
 *
 * Both lists are already on the client — the games ship them at start so the FE
 * can validate and score guesses locally — so this is a pure fold with nothing
 * crossing the wire, and it tests as one.
 *
 * The second case is the one worth having: passing `[]` for the bonus list is
 * how boggle reveals only the required half when its legal band equals its
 * required band, and that is a real caller rather than a degenerate input.
 */
describe('buildRevealWords', () => {
  it('returns every unfound word from both lists, tagged by which list', () => {
    const reveal = buildRevealWords(
      [{ word: 'bead', points: 1, is_pangram: false }, { word: 'bald', points: 1, is_pangram: false }],
      [{ word: 'blag', points: 1, is_pangram: false }],
      [{ word: 'bead' }],
    )
    expect(reveal.map((w) => [w.word, w.is_bonus])).toEqual([['bald', false], ['blag', true]])
  })

  it('excludes a found word from the BONUS list too, not just the required one', () => {
    // The two filters are separate expressions, so "found" has to be applied
    // twice. Without this the bonus half could ignore the found set entirely
    // and every other case here would still pass — a player would be shown a
    // word they had already found, listed as missed.
    const reveal = buildRevealWords(
      [{ word: 'bald', points: 1, is_pangram: false }],
      [{ word: 'blag', points: 1, is_pangram: false }],
      [{ word: 'blag' }],
    )
    expect(reveal.map((w) => w.word)).toEqual(['bald'])
  })

  it('an empty bonus list reveals only the required half', () => {
    // boggle passes [] when its legal band equals its required band, where
    // "bonus" would mean only the words the clean filter removed.
    const reveal = buildRevealWords([{ word: 'bald', points: 1, is_pangram: false }], [], [])
    expect(reveal.map((w) => w.word)).toEqual(['bald'])
  })
})
