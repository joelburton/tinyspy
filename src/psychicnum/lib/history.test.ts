// cs-blessed-psychicnum

/**
 * Unit test for the psychicnum turn-history replay (lib/history.ts). Pure — no
 * DOM, no supabase. Covers:
 *   1. INCLUSIVE folding — viewing a turn reflects every guess up to and including
 *      it, and NOT any later one.
 *   2. Hint / spoiler turns mark no tile and light nothing.
 *   3. The lit tile — exactly the word the viewed guess decided.
 *   4. Whose board — in compete a turn replays its own author's guesses alone.
 */
import { describe, expect, it } from 'vitest'
import { replayTurn } from './history'
import { ZTest_guess, ZTest_makeGameDataRaw } from './gameData.fixture'
import { makeGameData } from '../hooks/useGame'

const ME = { id: 'u', username: 'me', color: 'red' }
const MOTH = { id: 'v', username: 'moth', color: 'blue' }
const WORDS = ['apple', 'berry', 'cedar']

// Row 11: APPLE is a secret (correct). Row 12: a hint. Row 13: BERRY misses.
// The ids are what the viewer addresses, and they are deliberately NOT 0,1,2 —
// a builder that still indexed would pass these tests by accident. The rows
// come through `makeGameData`, which is what gives each its player.
const EVENTS = makeGameData(
  ZTest_makeGameDataRaw({
    words: WORDS,
    players: [ME],
    events: [
      ZTest_guess(11, 'u', 'apple', true),
      ZTest_guess(12, 'u', 'a fruit', false, { kind: 'hint' }),
      ZTest_guess(13, 'u', 'berry', false),
    ],
  }),
  'u',
).events

describe('replayTurn', () => {
  it('folds only guesses up to and including the viewed turn (inclusive)', () => {
    // At the first row only APPLE is decided; BERRY is not yet on the board.
    const first = replayTurn(EVENTS, 11, false)
    expect(first.tileResults.get('apple')).toBe(true)
    expect(first.tileResults.has('berry')).toBe(false)
    // At the last row both guesses are folded (the hint between adds nothing).
    const last = replayTurn(EVENTS, 13, false)
    expect(last.tileResults.get('apple')).toBe(true)
    expect(last.tileResults.get('berry')).toBe(false)
  })

  it('a hint turn decides no tile and lights nothing', () => {
    const hint = replayTurn(EVENTS, 12, false)
    expect(hint.tileResults.get('apple')).toBe(true)
    expect(hint.tileResults.has('berry')).toBe(false)
    expect(hint.litWord).toBeNull()
    expect(hint.label).toBe('Hint: a fruit')
  })

  it('lights exactly the word the viewed guess decided, and labels it', () => {
    expect(replayTurn(EVENTS, 11, false).litWord).toBe('apple')
    expect(replayTurn(EVENTS, 11, false).label).toBe('APPLE — Correct')
    expect(replayTurn(EVENTS, 13, false).litWord).toBe('berry')
    expect(replayTurn(EVENTS, 13, false).label).toBe('BERRY — Wrong')
  })

  it('names the author of the viewed turn, and nobody for an id not in the log', () => {
    expect(replayTurn(EVENTS, 11, false).author?.username).toBe('me')
    expect(replayTurn(EVENTS, 99, false).author).toBeNull()
    expect(replayTurn(EVENTS, 99, false).label).toBe('This turn')
  })

  it('in compete, replays the author\'s own guesses alone', () => {
    // A finished race, so both racers' rows are in the log.
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        words: WORDS,
        players: [ME, MOTH],
        events: [ZTest_guess(1, 'u', 'apple', true), ZTest_guess(2, 'v', 'berry', false), ZTest_guess(3, 'u', 'cedar', false)],
        ending: { reason: 'stopped', detail: 'stopped', by: 'u', winner: null },
        outcome: 'neutral',
      }),
      'u',
    )
    // moth's turn folds moth's guesses: berry alone, not my apple before it.
    const moths = replayTurn(gd.events, 2, true)
    expect([...moths.tileResults]).toEqual([['berry', false]])
    expect(moths.author).toBe(gd.playersById.v)
    // My later turn folds mine: apple and cedar, not moth's berry between them.
    const mine = replayTurn(gd.events, 3, true)
    expect([...mine.tileResults]).toEqual([['apple', true], ['cedar', false]])
    // Coop folds every row.
    expect([...replayTurn(gd.events, 3, false).tileResults].map(([w]) => w)).toEqual(['apple', 'berry', 'cedar'])
  })
})
