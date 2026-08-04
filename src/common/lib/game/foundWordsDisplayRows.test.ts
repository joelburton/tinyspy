import { describe, expect, it } from 'vitest'
import type { FoundWordRow } from './foundWords'
import { buildDisplayRows } from './foundWordsDisplayRows'
import { buildRevealWords } from './revealWords'

/** A reveal entry. `is_bonus` says which shipped list it came from. */
const rw = (word: string, is_bonus = false, is_pangram = false) =>
  ({ word, points: 1, is_pangram, is_bonus })

function fw(
  user_id: string,
  word: string,
  found_at = '2026-01-01T00:00:00Z',
): FoundWordRow {
  return {
    game_id: 'g',
    user_id,
    word,
    points: 1,
    is_pangram: false,
    is_bonus: false,
    found_at,
  }
}

describe('buildDisplayRows', () => {
  it('dedups a word multiple players found to one row, the FIRST finder', () => {
    // Post-terminal compete: RLS exposes everyone's found_words, so 'bead'
    // arrives twice. It shows once, attributed to whoever found it first
    // (earliest found_at) — that's whose color it renders in.
    const rows = buildDisplayRows(
      [
        fw('bea', 'bead', '2026-01-01T00:00:05Z'),
        fw('ada', 'bead', '2026-01-01T00:00:03Z'),
      ],
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('found')
    if (rows[0].kind === 'found') expect(rows[0].userId).toBe('ada')
  })

  it('keeps EVERY finder, so a per-player filter still matches the later ones', () => {
    // The dot can only carry one color, so attribution is first-finder. But if
    // that were the only finder recorded, filtering the list to 'bea' would hide
    // a word bea genuinely found — ada just got there first.
    const rows = buildDisplayRows(
      [
        fw('bea', 'bead', '2026-01-01T00:00:05Z'),
        fw('ada', 'bead', '2026-01-01T00:00:03Z'),
      ],
      [],
    )
    expect(rows[0].kind === 'found' && rows[0].finderIds).toEqual(['ada', 'bea'])
  })

  it('does not repeat a finder who submitted the same word twice', () => {
    const rows = buildDisplayRows(
      [fw('ada', 'bead', '2026-01-01T00:00:03Z'), fw('ada', 'bead', '2026-01-01T00:00:09Z')],
      [],
    )
    expect(rows[0].kind === 'found' && rows[0].finderIds).toEqual(['ada'])
  })

  it('picks the earliest finder regardless of input order', () => {
    const rows = buildDisplayRows(
      [
        fw('ada', 'bead', '2026-01-01T00:00:03Z'),
        fw('bea', 'bead', '2026-01-01T00:00:05Z'),
      ],
      [],
    )
    expect(rows[0].kind === 'found' && rows[0].userId).toBe('ada')
  })

  it('shadows a reveal entry with a found row of the same word', () => {
    const rows = buildDisplayRows(
      [fw('ada', 'bead')],
      [rw('bead')],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('found')
  })

  it('includes unfound required words as unfound rows', () => {
    const rows = buildDisplayRows([], [rw('zzzz', false, true)])
    expect(rows).toEqual([{ kind: 'unfound', word: 'zzzz', isPangram: true, isBonus: false }])
  })

  it('carries is_bonus onto unfound rows — the reveal covers BOTH lists', () => {
    // Missed bonus words are revealed too (that vocabulary is half the fun of the
    // post-game read), so the row has to say which list it came from or the KIND
    // filter can't tell them apart.
    const rows = buildDisplayRows([], [rw('zzzz'), rw('qqqq', true)])
    expect(rows.map((r) => [r.word, r.isBonus])).toEqual([['qqqq', true], ['zzzz', false]])
  })

  it('sorts alphabetically across found + unfound', () => {
    const rows = buildDisplayRows(
      [fw('ada', 'cead')],
      [rw('aaaa')],
    )
    const words = rows.map((r) => r.word)
    expect(words).toEqual(['aaaa', 'cead'])
  })
})

/**
 * buildRevealWords — the missed set handed to buildDisplayRows. Both shipped
 * lists are already on the client, so this is a pure client-side fold.
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

  it('an empty bonus list reveals only the required half', () => {
    // boggle passes [] when its legal band equals its required band, where
    // "bonus" would mean only the words the clean filter removed.
    const reveal = buildRevealWords([{ word: 'bald', points: 1, is_pangram: false }], [], [])
    expect(reveal.map((w) => w.word)).toEqual(['bald'])
  })
})
