import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { IpuzUnsupportedError, parseIpuzBuffer } from '../../../src/crosswords/lib/parse/ipuz'
import { parsePuzBuffer } from '../../../src/crosswords/lib/parse/puz'

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const SUNDAY_PUZ = resolve(FIXTURE_DIR, 'sunday-sample.puz')
const SUNDAY_IPUZ = resolve(FIXTURE_DIR, 'sunday-sample.ipuz')

function ipuzOf(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj), 'utf8')
}

const MINIMAL_IPUZ = {
  version: 'http://ipuz.org/v2',
  kind: ['http://ipuz.org/crossword#1'],
  dimensions: { width: 3, height: 3 },
  puzzle: [
    [1, 2, 3],
    [4, 0, 0],
    ['#', 5, 0],
  ],
  solution: [
    ['A', 'B', 'C'],
    ['D', 'E', 'F'],
    ['#', 'G', 'H'],
  ],
  clues: {
    Across: [
      [1, 'first'],
      [4, 'fourth'],
      [5, 'fifth'],
    ],
    Down: [
      [1, 'down 1'],
      [2, 'down 2'],
      [3, 'down 3'],
    ],
  },
}

describe('parseIpuzBuffer (minimal happy path)', () => {
  const { state, solution } = parseIpuzBuffer('toy', ipuzOf(MINIMAL_IPUZ))

  it('uses the provided id', () => {
    expect(state.meta.id).toBe('toy')
  })

  it('preserves dimensions and clue counts', () => {
    expect(state.meta.width).toBe(3)
    expect(state.meta.height).toBe(3)
    expect(state.meta.clues.across).toHaveLength(3)
    expect(state.meta.clues.down).toHaveLength(3)
  })

  it("renders blocks where the puzzle uses '#'", () => {
    expect(state.snapshot.cells[2]![0]).toEqual({ kind: 'block' })
  })

  it('preserves explicit cell numbers from the puzzle grid', () => {
    expect(state.snapshot.cells[0]![0]).toMatchObject({ kind: 'cell', number: 1 })
    expect(state.snapshot.cells[1]![1]).toMatchObject({ kind: 'cell', number: null })
  })

  it('solution is uppercased and aligned with the puzzle grid', () => {
    // Each cell's solution is a single-element array of accepted answers
    // (length > 1 only for Schrödinger cells, which the minimal fixture
    // doesn't exercise).
    expect(solution[0]).toEqual([['A'], ['B'], ['C']])
    expect(solution[2]![0]).toBeNull()
  })

  it('starts at version 0 with no fills', () => {
    expect(state.snapshot.version).toBe(0)
    const fills = state.snapshot.cells.flat().filter((c) => c.kind === 'cell' && c.fill != null)
    expect(fills).toHaveLength(0)
  })
})

describe('parseIpuzBuffer (fixture cross-check vs the .puz parse)', () => {
  // The .ipuz fixture intentionally carries features the .puz format
  // can't represent (given cells, Schrödinger alternates), so the two
  // are no longer byte-for-byte identical. The shared base (grid shape,
  // clues, meta, and every cell that isn't a feature demonstration) must
  // still agree — that's what catches a divergent parser.
  it('parses the converted Sunday fixture and matches the .puz parse on shared fields', () => {
    const ipuzBuf = readFileSync(SUNDAY_IPUZ)
    const puzBuf = readFileSync(SUNDAY_PUZ)
    const fromIpuz = parseIpuzBuffer('sunday', ipuzBuf)
    const fromPuz = parsePuzBuffer('sunday', puzBuf)

    expect(fromIpuz.state.meta.width).toBe(fromPuz.state.meta.width)
    expect(fromIpuz.state.meta.height).toBe(fromPuz.state.meta.height)
    expect(fromIpuz.state.meta.title).toBe(fromPuz.state.meta.title)
    expect(fromIpuz.state.meta.author).toBe(fromPuz.state.meta.author)
    expect(fromIpuz.state.meta.copyright).toBe(fromPuz.state.meta.copyright)
    expect(fromIpuz.state.meta.note).toBe(fromPuz.state.meta.note)
    expect(fromIpuz.state.meta.clues).toEqual(fromPuz.state.meta.clues)

    // Compare cells/solution element-wise, allowing the ipuz extras to
    // differ at the demo cells. A cell that has `given` in ipuz won't
    // have it in puz; Schrödinger cells carry multi-element solution
    // arrays in ipuz where the puz parse returns a single-element one.
    for (let r = 0; r < fromIpuz.state.snapshot.cells.length; r++) {
      for (let c = 0; c < fromIpuz.state.snapshot.cells[r]!.length; c++) {
        const ic = fromIpuz.state.snapshot.cells[r]![c]!
        const pc = fromPuz.state.snapshot.cells[r]![c]!
        if (ic.kind === 'cell' && ic.given) continue
        // Hidden blocks (ipuz null cells) appear as regular visible
        // blocks in the .puz — same word-boundary behavior, just
        // different rendering. Allow them to differ.
        if (ic.kind === 'block' && ic.hidden) {
          expect(pc.kind).toBe('block')
          continue
        }
        expect(pc).toEqual(ic)
        const is = fromIpuz.solution[r]![c]
        const ps = fromPuz.solution[r]![c]
        if (is && is.length > 1) continue // Schrödinger: alternates only in ipuz
        expect(ps).toEqual(is)
      }
    }
  })
})

describe('parseIpuzBuffer (rejections + feature acceptance)', () => {
  function expectReject(obj: unknown, match: RegExp | string) {
    expect(() => parseIpuzBuffer('x', ipuzOf(obj))).toThrow(IpuzUnsupportedError)
    expect(() => parseIpuzBuffer('x', ipuzOf(obj))).toThrow(match)
  }

  it('rejects invalid JSON', () => {
    expect(() => parseIpuzBuffer('x', Buffer.from('not json'))).toThrow(IpuzUnsupportedError)
  })

  it('rejects non-crossword kinds', () => {
    expectReject({ ...MINIMAL_IPUZ, kind: ['http://ipuz.org/sudoku#1'] }, /unsupported puzzle kind/)
  })

  it('rejects missing dimensions', () => {
    const rest = { ...MINIMAL_IPUZ } as Record<string, unknown>
    delete rest.dimensions
    expectReject(rest, /missing `dimensions`/)
  })

  it('accepts rebus solutions up to the cap', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    obj.solution[0]![0] = 'block'
    const { solution } = parseIpuzBuffer('x', ipuzOf(obj))
    expect(solution[0]![0]).toEqual(['BLOCK'])
  })

  it('rejects rebus solutions over the cap', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    obj.solution[0]![0] = 'ABCDEFGHI' // 9 > 8
    expectReject(obj, /rebus solutions over 8 characters/)
  })

  it("accepts circled cells (style.shapebg='circle') and sets circled:true", () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    ;(obj.puzzle[0] as unknown[])[0] = { cell: 1, style: { shapebg: 'circle' } }
    const { state } = parseIpuzBuffer('x', ipuzOf(obj))
    const cell = state.snapshot.cells[0]![0]!
    expect(cell.kind).toBe('cell')
    if (cell.kind === 'cell') {
      expect(cell.circled).toBe(true)
      expect(cell.number).toBe(1)
    }
    // Untouched cells stay unmarked.
    const other = state.snapshot.cells[0]![1]!
    if (other.kind === 'cell') expect(other.circled).toBeUndefined()
  })

  it('rejects unsupported shapebg values', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    ;(obj.puzzle[0] as unknown[])[0] = { cell: 1, style: { shapebg: 'diamond' } }
    expectReject(obj, /shapebg.*not supported/)
  })

  it('rejects shaded cells (style.shading)', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    ;(obj.puzzle[0] as unknown[])[0] = { cell: 1, style: { shading: 'lightgrey' } }
    expectReject(obj, /style\.shading is not supported/)
  })

  it('rejects barred grids (style.barred)', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    ;(obj.puzzle[0] as unknown[])[0] = { cell: 1, style: { barred: 'T' } }
    expectReject(obj, /style\.barred is not supported/)
  })

  it('rejects unknown style keys (whitelist)', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    ;(obj.puzzle[0] as unknown[])[0] = { cell: 1, style: { somethingNew: 'x' } }
    expectReject(obj, /style\.somethingNew is not supported/)
  })

  it('rejects named style references', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    ;(obj.puzzle[0] as unknown[])[0] = { cell: 1, style: 'themeAccent' }
    expectReject(obj, /named style references/)
  })

  it('rejects unknown cell-object keys', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    ;(obj.puzzle[0] as unknown[])[0] = { cell: 1, marks: { TL: 'x' } }
    expectReject(obj, /unsupported cell-object key 'marks'/)
  })

  it('accepts null cells (irregular grids) as hidden blocks', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    obj.puzzle[2]![0] = null as unknown as string
    obj.solution[2]![0] = null as unknown as string
    const { state } = parseIpuzBuffer('x', ipuzOf(obj))
    const cell = state.snapshot.cells[2]![0]!
    expect(cell.kind).toBe('block')
    if (cell.kind === 'block') expect(cell.hidden).toBe(true)
  })

  it('rejects mismatched solution shape', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    obj.solution[0] = ['A', 'B']
    expectReject(obj, /solution row 0 must have 3 cells/)
  })

  it('accepts pre-filled cell values (givens)', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    ;(obj.puzzle[0] as unknown[])[0] = { cell: 1, value: 'A' }
    const { state } = parseIpuzBuffer('x', ipuzOf(obj))
    const cell = state.snapshot.cells[0]![0]!
    expect(cell.kind).toBe('cell')
    if (cell.kind === 'cell') {
      expect(cell.given).toBe(true)
      expect(cell.fill).toBe('A')
      expect(cell.number).toBe(1)
    }
  })

  it('accepts shaded cells (style.color)', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    ;(obj.puzzle[0] as unknown[])[0] = { cell: 1, style: { color: '#dddddd' } }
    const { state } = parseIpuzBuffer('x', ipuzOf(obj))
    const cell = state.snapshot.cells[0]![0]!
    expect(cell.kind).toBe('cell')
    if (cell.kind === 'cell') {
      expect(cell.shaded).toBe(true)
      expect(cell.circled).toBeUndefined()
    }
  })

  it('accepts Schrödinger alternates on the solution grid', () => {
    const obj = structuredClone(MINIMAL_IPUZ)
    obj.solution[0]![0] = { value: 'A', alternates: ['E'] } as unknown as string
    const { solution } = parseIpuzBuffer('x', ipuzOf(obj))
    expect(solution[0]![0]).toEqual(['A', 'E'])
  })

  it('accepts rebus saved values up to the cap', () => {
    const obj = structuredClone(MINIMAL_IPUZ) as unknown as Record<string, unknown>
    obj.saved = [
      ['heart', 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]
    const { state } = parseIpuzBuffer('x', ipuzOf(obj))
    const cell = state.snapshot.cells[0]![0]!
    expect(cell.kind).toBe('cell')
    if (cell.kind === 'cell') expect(cell.fill).toBe('HEART')
  })

  it('rejects saved values over the cap', () => {
    const obj = structuredClone(MINIMAL_IPUZ) as unknown as Record<string, unknown>
    obj.saved = [
      ['ABCDEFGHI', 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]
    expectReject(obj, /saved values over 8 characters/)
  })

  it('rejects mismatched saved-grid shape', () => {
    const obj = structuredClone(MINIMAL_IPUZ) as unknown as Record<string, unknown>
    obj.saved = [
      [0, 0, 0],
      [0, 0, 0],
    ]
    expectReject(obj, /saved grid must have 3 rows/)
  })
})
