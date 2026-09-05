// cs-unmet

import { describe, expect, it } from 'vitest'
import type { FoundWordRow } from '../bee-games/foundWords'
import { buildDisplayRows } from './foundWordsDisplayRows'

/**
 * One row per word in the found-words list, whoever found it and whether
 * anybody did.
 *
 * **Most of these cases are about compete after the game ends**, which is the
 * only time the input is interesting: RLS opens at terminal, so every player's
 * finds arrive at once and the same word turns up more than once. The rules
 * that follow — one row per word, attributed to the earliest finder, with every
 * finder kept for the WHO filter, and a found word shadowing its reveal entry —
 * only ever bite there. In coop `submit_word` rejects a word anyone already
 * found, so each of them is a no-op.
 *
 * The dedup is deliberately BY WORD and not per player: the row carries one
 * identity disc, so it can show one color. Keeping every finder anyway is what
 * stops filtering the list to a player from hiding a word they genuinely found
 * but were second to.
 */

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
    expect(rows).toEqual([{ kind: 'unfound', word: 'zzzz', isPangram: true, isBonus: false, points: 1 }])
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
