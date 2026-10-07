// cs-unmet

/**
 * The turn-history replay. Uses the same 21-distinct-letter reference board as
 * colors_test so the expected letters are easy to reason about:
 *   solution = 'abcdef.g.hijklmn.o.pqrstu'  (holes at 6,8,16,18)
 * A deal two swaps from solved lets us check an intermediate state.
 */
import { describe, it, expect } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { ZTest_SOLUTION, ZTest_makeGameDataRaw, ZTest_swap } from './gameData.fixture'
import { replaySwap } from './history'
import { CELLS, HOLE } from './waffle'
import type { GEventRaw, GLetterTile, GTile } from '../types'

/** A replayed board as 25 letters, `.` at each hole, to compare whole. */
function makeBoardString(tiles: readonly GTile[]): string {
  const cells = Array.from({ length: CELLS }, () => HOLE)
  for (const t of tiles) cells[Number(t.id)] = t.letter
  return cells.join('')
}

/** …and its 25 colors. */
function makeColorString(tiles: readonly GTile[]): string {
  const cells = Array.from({ length: CELLS }, () => HOLE)
  for (const t of tiles) cells[Number(t.id)] = t.color
  return cells.join('')
}

// The solution with cells 0↔1 and 2↔3 swapped → two swaps from solved.
const DEALT = 'badcef.g.hijklmn.o.pqrstu'
const DEALT_TILES: GLetterTile[] = [...DEALT].flatMap((letter, i) =>
  letter === '.' ? [] : [{ id: String(i), letter }])
/** The board after the first solving swap, 2↔3: cells 0 and 1 still wrong. */
const HALFWAY = 'bacdef.g.hijklmn.o.pqrstu'

/** The colors of the solved board: every filled cell green, holes '.'. */
const ALL_GREEN = ZTest_SOLUTION.replace(/[a-z]/g, 'g')
/** …and of the board one swap earlier, where cells 0 and 1 are still swapped. */
const TWO_YELLOW = `yy${ALL_GREEN.slice(2)}`

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

/** The log's rows as `gd` holds them: an ended game, so every row is there. */
function makeEvents(mode: 'coop' | 'compete', events: GEventRaw[]) {
  return makeGameData(
    ZTest_makeGameDataRaw({
      mode,
      players: TWO,
      events,
      ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
      outcome: 'neutral',
    }),
    'u1',
  ).events
}

// The solving sequence, in log order: fix cells 2↔3 first, then 0↔1. The ids
// are what the viewer addresses, and are deliberately not 0,1 — a replay that
// still indexed would pass by accident. Each row carries what the board scored
// AFTER it — the server wrote that at submit time, and the replay reads it.
const SOLVING = makeEvents('coop', [
  ZTest_swap(11, 'u1', [2, 3], DEALT, TWO_YELLOW),
  ZTest_swap(12, 'u2', [0, 1], HALFWAY, ALL_GREEN),
])

describe('replaySwap — inclusive replay', () => {
  it('viewing the last swap shows the solved board, all green, with its cells ringed', () => {
    const replayed = replaySwap(DEALT_TILES, SOLVING, 12, 2, false)!
    expect(makeBoardString(replayed.tiles)).toBe(ZTest_SOLUTION)
    // The colors are the ROW's — stored by submit_swap, not derived here.
    expect(makeColorString(replayed.tiles)).toBe(ALL_GREEN)
    expect(replayed.litTileIds).toEqual(new Set(['0', '1']))
    expect(replayed.label).toBe('#2: B (A1) ↔ A (B1)')
    expect(replayed.author.username).toBe('moth')
  })

  it('labels with the number it was GIVEN — the log numbers what it shows', () => {
    // Swap 12 sits second in this list; a log filtered to one player printed it
    // as "#1", and the banner echoes what the reader clicked.
    expect(replaySwap(DEALT_TILES, SOLVING, 12, 1, false)!.label).toBe('#1: B (A1) ↔ A (B1)')
    // No number at all when the opening carried none.
    expect(replaySwap(DEALT_TILES, SOLVING, 12, null, false)!.label).toBe('B (A1) ↔ A (B1)')
  })

  it('viewing an earlier swap shows the board AS OF that swap, with that row’s colors', () => {
    const replayed = replaySwap(DEALT_TILES, SOLVING, 11, 1, false)!
    expect(makeBoardString(replayed.tiles)).toBe(HALFWAY)
    // Picking the latest row's colors would show the finished board's colors
    // under an earlier board's letters.
    expect(makeColorString(replayed.tiles)).toBe(TWO_YELLOW)
    // The ringed cells are the ones THIS swap moved (2 and 3), not 0/1.
    expect(replayed.litTileIds).toEqual(new Set(['2', '3']))
  })

  it('an id the log does not hold replays nothing — the live board shows', () => {
    // A Restart emptied the log while the row was open.
    expect(replaySwap(DEALT_TILES, SOLVING, 99, 1, false)).toBeNull()
  })
})

/**
 * A compete log holds several players' independent sequences interleaved in
 * one game-wide order. Replaying a MIXED list against the deal would apply a
 * rival's swaps to my board and produce a state nobody ever saw — so a compete
 * replay applies the viewed row's author's rows only.
 */
describe('replaySwap — compete: one player’s swaps at a time', () => {
  const MIXED = makeEvents('compete', [
    ZTest_swap(21, 'u1', [2, 3], DEALT, ALL_GREEN),
    ZTest_swap(22, 'u2', [4, 5], DEALT, ALL_GREEN),
    ZTest_swap(23, 'u1', [0, 1], HALFWAY, ALL_GREEN),
    ZTest_swap(24, 'u2', [9, 10], 'badcfe.g.hijklmn.o.pqrstu', ALL_GREEN),
  ])

  it('replays MY two swaps to the solved board, skipping the rival’s between them', () => {
    expect(makeBoardString(replaySwap(DEALT_TILES, MIXED, 23, 2, true)!.tiles)).toBe(ZTest_SOLUTION)
  })

  it('a rival’s log replays independently from the same deal', () => {
    // u2 swapped 4↔5 (e↔f) then 9↔10 (h↔i).
    const replayed = replaySwap(DEALT_TILES, MIXED, 24, 2, true)!
    expect(makeBoardString(replayed.tiles)).toBe('badcfe.g.ihjklmn.o.pqrstu')
    expect(replayed.author.username).toBe('moth')
  })

  it('coop applies every row: one shared board', () => {
    // The same rows read as coop apply the rival's swaps too — a board nobody
    // in a race played, which is why compete filters.
    expect(makeBoardString(replaySwap(DEALT_TILES, MIXED, 23, 3, false)!.tiles)).not.toBe(ZTest_SOLUTION)
  })
})
