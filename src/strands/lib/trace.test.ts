import { describe, expect, it } from 'vitest'
import { coordKey, type Coord } from './board'
import { clearTrace, clickTile, typeLetter, type Trace } from './trace'

const none: ReadonlySet<string> = new Set()
const consumedOf = (...cells: Coord[]) => new Set(cells.map(coordKey))

/** Click a run of tiles from empty, returning the final result. */
function clicks(cells: Coord[], consumed: ReadonlySet<string> = none) {
  let out = { trace: [] as Trace, submit: false }
  for (const c of cells) out = clickTile(out.trace, c, consumed)
  return out
}

describe('clickTile — building a trace', () => {
  it('starts a trace on the first click', () => {
    expect(clicks([[3, 3]])).toEqual({ trace: [[3, 3]], submit: false })
  })

  it('extends through adjacent tiles, keeping click order', () => {
    const { trace, submit } = clicks([[0, 0], [0, 1], [1, 2]])
    expect(trace).toEqual([[0, 0], [0, 1], [1, 2]])
    expect(submit).toBe(false)
  })

  it('extends DIAGONALLY — the same 8-way rule the boards need', () => {
    expect(clicks([[1, 1], [2, 0]]).trace).toEqual([[1, 1], [2, 0]])
  })
})

describe('clickTile — submitting', () => {
  it('re-clicking the LAST tile submits, leaving the trace intact to send', () => {
    const { trace, submit } = clicks([[0, 0], [0, 1], [0, 1]])
    expect(submit).toBe(true)
    expect(trace).toEqual([[0, 0], [0, 1]])
  })

  it('a single tile can be submitted', () => {
    // Length is the server's call, not the tracer's: only IT knows whether a
    // short path is a theme word, so the reducer must let it through.
    expect(clicks([[2, 2], [2, 2]])).toEqual({ trace: [[2, 2]], submit: true })
  })

  it('does not submit when a DIFFERENT selected tile is clicked', () => {
    expect(clicks([[0, 0], [0, 1], [0, 0]]).submit).toBe(false)
  })
})

describe('clickTile — truncating', () => {
  it('clicking an already-selected non-last tile drops it and everything after', () => {
    expect(clicks([[0, 0], [0, 1], [1, 2], [0, 1]]).trace).toEqual([[0, 0]])
  })

  it('clicking the FIRST tile empties the trace — nothing precedes it', () => {
    expect(clicks([[0, 0], [0, 1], [1, 2], [0, 0]]).trace).toEqual([])
  })

  it('the truncated trace can be extended again from its new end', () => {
    // Undo back to [0,0], then step somewhere else — the adjacency check runs
    // against the tile the truncation left as the end, not the discarded one.
    const back = clicks([[0, 0], [0, 1], [1, 2], [0, 1]])
    expect(clickTile(back.trace, [1, 0], none).trace).toEqual([[0, 0], [1, 0]])
  })

  it('clearTrace() abandons the selection', () => {
    expect(clearTrace()).toEqual({ trace: [], submit: false })
  })
})

describe('clickTile — consumed tiles', () => {
  const consumed = consumedOf([0, 1])

  it('IGNORES a consumed tile rather than clearing the trace', () => {
    // A found theme word's tiles are spent. Clicking one is neither a move nor
    // a mistake, so wiping the player's in-progress trace would punish a
    // misclick — the trace comes back exactly as it was.
    const start = clicks([[0, 0]], consumed)
    expect(clickTile(start.trace, [0, 1], consumed)).toEqual({
      trace: [[0, 0]],
      submit: false,
    })
  })

  it('never starts a trace on a consumed tile', () => {
    expect(clicks([[0, 1]], consumed).trace).toEqual([])
  })

  it('a consumed tile cannot be traced THROUGH', () => {
    // [0,0] → [0,1] → [0,2] looks like a straight run, but [0,1] is spent. The
    // click on it is ignored, so [0,2] is then judged against [0,0] — two apart,
    // not adjacent — and starts a new trace instead of silently bridging the
    // gap. Bridging would let a player trace a word through tiles they no
    // longer own.
    expect(clicks([[0, 0], [0, 1], [0, 2]], consumed).trace).toEqual([[0, 2]])
  })
})

describe('clickTile — a far-away click starts over', () => {
  it('begins a new trace at the clicked tile', () => {
    // The one rule not dictated by the game: a non-adjacent free tile could
    // either be ignored or start fresh. Starting fresh matches what the click
    // plainly means and keeps the board feeling alive; ignoring reads as broken.
    expect(clicks([[0, 0], [0, 1], [5, 5]]).trace).toEqual([[5, 5]])
  })

  it('the abandoned trace is not resubmitted', () => {
    expect(clicks([[0, 0], [0, 1], [5, 5]]).submit).toBe(false)
  })
})

describe('clickTile — purity', () => {
  it('never mutates the trace it was given', () => {
    const before: Coord[] = [[0, 0], [0, 1]]
    const snapshot = JSON.stringify(before)
    clickTile(before, [1, 2], none)
    clickTile(before, [0, 0], none)
    clickTile(before, [0, 1], none)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

/**
 * `typeLetter` — the keyboard twin of a click. The board below is small and
 * hand-shaped so each case is countable by eye; the real boards are 8×6, and
 * the oracle test already covers the geometry these rules lean on.
 *
 *     col   0 1 2 3
 *   row 0   C A T S
 *       1   A A R E
 *       2   B C D A
 */
const TB: readonly string[] = ['CATS', 'AARE', 'BCDA']

describe('typeLetter — starting a word (empty trace)', () => {
  it('extends when exactly one unconsumed cell bears the letter', () => {
    // One T on the board, at [0,2].
    expect(typeLetter([], 't', TB, none)).toEqual({ kind: 'extend', at: [0, 2] })
  })

  it('is ambiguous when several do — and reports every one, to be marked', () => {
    // Four A's: [0,1], [1,0], [1,1], [2,3].
    const r = typeLetter([], 'a', TB, none)
    expect(r.kind).toBe('ambiguous')
    expect(r.kind === 'ambiguous' && r.candidates).toEqual([[0, 1], [1, 0], [1, 1], [2, 3]])
  })

  it('searches the WHOLE board, not just some neighbourhood', () => {
    // B is at [2,0] — nowhere near anything else the tests touch.
    expect(typeLetter([], 'b', TB, none)).toEqual({ kind: 'extend', at: [2, 0] })
  })

  it('says nothing matched when the letter is absent', () => {
    expect(typeLetter([], 'z', TB, none)).toEqual({ kind: 'none' })
  })

  it('ignores consumed cells — a spent tile is not a candidate', () => {
    // Consume three of the four A's and the fourth becomes unambiguous.
    const spent = consumedOf([0, 1], [1, 0], [1, 1])
    expect(typeLetter([], 'a', TB, spent)).toEqual({ kind: 'extend', at: [2, 3] })
  })

  it('is case-insensitive about the key', () => {
    expect(typeLetter([], 'T', TB, none)).toEqual({ kind: 'extend', at: [0, 2] })
  })
})

describe('typeLetter — continuing a word (non-empty trace)', () => {
  it('considers only the last cell’s 8 neighbours', () => {
    // From [0,0] (C), the A's adjacent are [0,1] and [1,0] and [1,1] — three,
    // so ambiguous; the far A at [2,3] is NOT among them.
    const r = typeLetter([[0, 0]], 'a', TB, none)
    expect(r.kind === 'ambiguous' && r.candidates).toEqual([[0, 1], [1, 0], [1, 1]])
  })

  it('resolves to one when only one neighbour bears the letter', () => {
    // From [0,0], the only adjacent R… there is none; use S from [1,3]:
    // neighbours of [1,3] are [0,2] T, [0,3] S, [1,2] R, [2,2] D, [2,3] A.
    expect(typeLetter([[1, 3]], 's', TB, none)).toEqual({ kind: 'extend', at: [0, 3] })
  })

  it('counts DIAGONAL neighbours', () => {
    // [2,2] D is diagonally adjacent to [1,3] E… check the other way round:
    // from [0,0] C, the diagonal [1,1] A is reachable — proven by the ambiguous
    // case above including it. Here: from [2,1] C, the diagonal [1,2] R.
    expect(typeLetter([[2, 1]], 'r', TB, none)).toEqual({ kind: 'extend', at: [1, 2] })
  })

  it('says nothing matched when no neighbour bears the letter', () => {
    // Nothing adjacent to [0,0] is an S.
    expect(typeLetter([[0, 0]], 's', TB, none)).toEqual({ kind: 'none' })
  })

  it('never re-uses a cell already in the trace', () => {
    // Trace C[0,0] → A[0,1]. Typing 'c' would match [0,0], which is already
    // used, and no OTHER adjacent C exists — so nothing matched. (Clicking your
    // own cell still means "undo back to here"; that stays click-only.)
    expect(typeLetter([[0, 0], [0, 1]], 'c', TB, none)).toEqual({ kind: 'none' })
  })

  it('excludes a consumed neighbour', () => {
    // From [1,3] the only S is [0,3]; consume it and nothing is left.
    expect(typeLetter([[1, 3]], 's', TB, consumedOf([0, 3]))).toEqual({ kind: 'none' })
  })

  it('types a whole word once the first letter is anchored', () => {
    // The payoff case: click C[0,0], then "ars" walks itself —
    // A[1,0]? ambiguous. So anchor at [2,1] C instead: R[1,2] → E[1,3].
    let trace: Trace = [[2, 1]]
    for (const ch of 're') {
      const r = typeLetter(trace, ch, TB, none)
      expect(r.kind).toBe('extend')
      if (r.kind === 'extend') trace = [...trace, r.at]
    }
    expect(trace).toEqual([[2, 1], [1, 2], [1, 3]])
  })
})
