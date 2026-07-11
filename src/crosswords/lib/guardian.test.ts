import { describe, expect, it } from 'vitest'
import { convertGuardianPuzzle, GuardianConvertError, type GuardianData, type GuardianEntry } from './guardian'

/** Assemble a minimal Guardian `data` object from a list of entries. */
function makeData(opts: {
  rows?: number
  cols?: number
  entries?: GuardianEntry[]
  name?: string
  creator?: { name?: string } | null
  solutionAvailable?: boolean
  id?: string
}): GuardianData {
  return {
    id: opts.id ?? 'crosswords/quick/1',
    name: opts.name,
    date: 1_700_000_000_000,
    creator: opts.creator,
    crosswordType: 'quick',
    dimensions: { rows: opts.rows ?? 3, cols: opts.cols ?? 3 },
    solutionAvailable: opts.solutionAvailable ?? true,
    entries: opts.entries ?? [],
  }
}

const across = (number: number, x: number, y: number, solution: string, clue = 'c'): GuardianEntry => ({
  number, direction: 'across', position: { x, y }, length: solution.length, solution, clue,
})
const down = (number: number, x: number, y: number, solution: string, clue = 'c'): GuardianEntry => ({
  number, direction: 'down', position: { x, y }, length: solution.length, solution, clue,
})

/**
 * A 3×3 puzzle with three crossing entries:
 *   1-across CAT (0,0)→(2,0)   1-down COD (0,0)→(0,2)   3-down TOE (2,0)→(2,2)
 * so (0,0) starts both 1a+1d (shared number 1) and (2,0) starts 3d while being
 * the interior end of 1a (number 3). The centre column stays blocks.
 */
const crossing = () =>
  makeData({ entries: [across(1, 0, 0, 'CAT'), down(1, 0, 0, 'COD'), down(3, 2, 0, 'TOE')] })

describe('convertGuardianPuzzle — grid', () => {
  it('carves fillable cells from entries; everything else is a block', () => {
    const { meta, solution } = convertGuardianPuzzle(crossing())
    const kinds = meta.cells.map((row) => row.map((c) => (c.kind === 'cell' ? '.' : '#')).join(''))
    // Row 0 full (CAT); rows 1-2 keep only col 0 (COD) and col 2 (TOE) — the
    // centre column has no entry through it.
    expect(kinds).toEqual(['...', '.#.', '.#.'])
    expect(meta.cells[1]![0]!.kind).toBe('cell') // 1-down O
    expect(meta.cells[1]![1]!.kind).toBe('block') // centre — no entry
    expect(meta.cells[1]![2]!.kind).toBe('cell') // 3-down O
    // Solution letters land row-major.
    expect(solution[0]).toEqual([['C'], ['A'], ['T']])
    expect(solution[2]).toEqual([['D'], null, ['E']])
  })

  it('numbers a shared start once, and is independent of entry order', () => {
    const { meta } = convertGuardianPuzzle(crossing())
    expect(meta.cells[0]![0]!).toMatchObject({ kind: 'cell', number: 1 }) // 1a + 1d share 1
    expect(meta.cells[0]![2]!).toMatchObject({ kind: 'cell', number: 3 }) // 3d starts on 1a's last cell
    expect(meta.cells[0]![1]!).toMatchObject({ kind: 'cell', number: null }) // interior, no start

    // Reverse the entry order → identical numbering (the interior-vs-start merge
    // preserves a number written by either pass).
    const reversed = makeData({ entries: [down(3, 2, 0, 'TOE'), down(1, 0, 0, 'COD'), across(1, 0, 0, 'CAT')] })
    const r = convertGuardianPuzzle(reversed)
    expect(r.meta.cells[0]![2]!).toMatchObject({ number: 3 })
    expect(r.meta.cells[0]![0]!).toMatchObject({ number: 1 })
  })

  it('uppercases lowercase solutions', () => {
    const { solution } = convertGuardianPuzzle(makeData({ entries: [across(1, 0, 0, 'cat')] }))
    expect(solution[0]![0]).toEqual(['C'])
  })
})

describe('convertGuardianPuzzle — clues', () => {
  it('splits by direction, sorts by number, decodes HTML entities', () => {
    const { meta } = convertGuardianPuzzle(
      makeData({
        entries: [
          across(3, 0, 0, 'CAT', 'later across'),
          across(1, 0, 1, 'DOG', 'Fruit &amp; nuts (3)'),
          down(2, 0, 0, 'CD', 'a down'),
        ],
        rows: 3,
      }),
    )
    expect(meta.clues.across.map((c) => c.number)).toEqual([1, 3]) // sorted
    expect(meta.clues.across[0]!.text).toBe('Fruit & nuts (3)') // &amp; → &
    expect(meta.clues.down.map((c) => c.number)).toEqual([2])
  })
})

describe('convertGuardianPuzzle — meta', () => {
  it('reads title + author (creator.name), blank author when creator is null', () => {
    const withSetter = convertGuardianPuzzle(
      makeData({ name: 'Cryptic No 30,055', creator: { name: 'Brockwell' }, entries: [across(1, 0, 0, 'CAT')] }),
    )
    expect(withSetter.meta.title).toBe('Cryptic No 30,055')
    expect(withSetter.meta.author).toBe('Brockwell')

    const noSetter = convertGuardianPuzzle(makeData({ creator: null, entries: [across(1, 0, 0, 'CAT')] }))
    expect(noSetter.meta.author).toBe('')

    expect(withSetter.meta.width).toBe(3)
    expect(withSetter.meta.height).toBe(3)
    expect(withSetter.meta.copyright).toContain('Guardian')
  })
})

describe('convertGuardianPuzzle — errors', () => {
  it('throws when the answers are not yet published', () => {
    expect(() =>
      convertGuardianPuzzle(makeData({ solutionAvailable: false, entries: [across(1, 0, 0, 'CAT')] })),
    ).toThrow(GuardianConvertError)
  })

  it('throws when a solution length disagrees with the entry length', () => {
    const bad = makeData({ entries: [{ number: 1, direction: 'across', position: { x: 0, y: 0 }, length: 4, solution: 'CAT', clue: 'c' }] })
    expect(() => convertGuardianPuzzle(bad)).toThrow(/≠ length/)
  })

  it('throws on an entry that runs off the grid', () => {
    expect(() => convertGuardianPuzzle(makeData({ cols: 2, rows: 2, entries: [across(1, 0, 0, 'CAT')] }))).toThrow(
      /off the/,
    )
  })

  it('throws on missing entries and bad dimensions', () => {
    expect(() => convertGuardianPuzzle(makeData({ entries: [] }))).toThrow(/no entries/)
    expect(() => convertGuardianPuzzle({ dimensions: { rows: 0, cols: 3 }, entries: [across(1, 0, 0, 'CAT')] })).toThrow(
      /bad dimensions/,
    )
  })
})
