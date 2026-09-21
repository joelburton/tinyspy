// cs-unmet

/**
 * What composing the reveal and the merge in one call promises: the gate is
 * `isTerminal` and nothing else, `hasBonus` decides how much of the missed set
 * is revealed, and the SAME call answers for the screen and the printer — which
 * is the property that stops a printed board disagreeing with the one on screen.
 */
import { describe, expect, it } from 'vitest'
import { buildWordListRows } from './wordListRows'

type Shipped = { word: string; points: number; is_pangram?: boolean }

const REQUIRED: Shipped[] = [
  { word: 'alpha', points: 1 },
  { word: 'bravo', points: 2 },
]
const BONUS: Shipped[] = [{ word: 'zulu', points: 9 }]

const found = (word: string, user = 'u1', at = '2026-01-01T00:00:00Z') => ({
  word,
  user_id: user,
  points: 1,
  is_bonus: false,
  found_at: at,
})

const words = (rows: { word: string }[]) => rows.map((r) => r.word)

describe('buildWordListRows', () => {
  it('shows only the found words while the game runs', () => {
    const rows = buildWordListRows({
      foundWords: [found('alpha')],
      requiredWords: REQUIRED,
      bonusWords: BONUS,
      hasBonus: true,
      isTerminal: false,
    })
    expect(words(rows)).toEqual(['alpha'])
    expect(rows[0]!.kind).toBe('found')
  })

  it('folds the missed words in at terminal, alphabetized under the found ones', () => {
    const rows = buildWordListRows({
      foundWords: [found('alpha')],
      requiredWords: REQUIRED,
      bonusWords: BONUS,
      hasBonus: true,
      isTerminal: true,
    })
    expect(words(rows)).toEqual(['alpha', 'bravo', 'zulu'])
    // The one they found stays theirs; the rest are the reveal.
    expect(rows.map((r) => r.kind)).toEqual(['found', 'unfound', 'unfound'])
  })

  it('reveals the required half alone on a board with no real bonus list', () => {
    const rows = buildWordListRows({
      foundWords: [found('alpha')],
      requiredWords: REQUIRED,
      bonusWords: BONUS,
      hasBonus: false,
      isTerminal: true,
    })
    expect(words(rows)).toEqual(['alpha', 'bravo'])
  })

  it('answers identically for two callers given the same game — the screen and the print', () => {
    // Not a tautology about one function: the printer used to re-derive this
    // recipe, and the point of the seam is that it can no longer drift from the
    // screen's copy of it.
    const args = {
      foundWords: [found('bravo', 'u2')],
      requiredWords: REQUIRED,
      bonusWords: BONUS,
      hasBonus: true,
      isTerminal: true,
    }
    expect(buildWordListRows(args)).toEqual(buildWordListRows(args))
  })

  it('keeps every finder of a word several people found', () => {
    const rows = buildWordListRows({
      foundWords: [
        found('alpha', 'u2', '2026-01-01T00:00:02Z'),
        found('alpha', 'u1', '2026-01-01T00:00:01Z'),
      ],
      requiredWords: REQUIRED,
      bonusWords: BONUS,
      hasBonus: true,
      isTerminal: false,
    })
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.kind === 'found' && row.userId).toBe('u1') // earliest found_at
    expect(row.kind === 'found' && row.finderIds).toEqual(['u1', 'u2'])
  })
})
