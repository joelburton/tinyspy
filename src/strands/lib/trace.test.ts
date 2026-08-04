import { describe, expect, it } from 'vitest'
import { coordKey, type Coord } from './board'
import { clearTrace, clickTile, type Trace } from './trace'

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

describe('clickTile — clearing', () => {
  it('clicking an already-selected non-last tile scraps the whole trace', () => {
    expect(clicks([[0, 0], [0, 1], [1, 2], [0, 0]]).trace).toEqual([])
  })

  it('clears from the middle too, not just the first tile', () => {
    expect(clicks([[0, 0], [0, 1], [1, 2], [0, 1]]).trace).toEqual([])
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
