import { describe, expect, it } from 'vitest'
import { convertNytPuzzle, NytConvertError, type NytCell, type NytPuzzleResponse } from './nyt'

/** Assemble a minimal v6-shaped response (ported from crossplay's `makeResp`). */
function makeResp(opts: {
  width?: number
  height?: number
  cells?: NytCell[]
  clueList?: { text?: unknown; direction?: string; label?: string }[]
  title?: string
  publicationDate?: string
  constructors?: string[]
  editor?: string
  copyright?: string
  notes?: { text?: string }[]
}): NytPuzzleResponse {
  const width = opts.width ?? 2
  const height = opts.height ?? 1
  const cells = opts.cells ?? Array.from({ length: width * height }, (_, i) => ({
    type: 1,
    answer: String.fromCharCode(65 + i),
    label: String(i + 1),
  }))
  return {
    body: [{ dimensions: { width, height }, cells, clues: opts.clueList ?? [] }],
    title: opts.title,
    publicationDate: opts.publicationDate,
    constructors: opts.constructors,
    editor: opts.editor,
    copyright: opts.copyright,
    notes: opts.notes,
  }
}

describe('convertNytPuzzle — cells', () => {
  it('maps type 0 and answer-less cells to blocks, open cells to cells', () => {
    const { meta, solution } = convertNytPuzzle(
      makeResp({
        width: 3,
        height: 1,
        cells: [
          { type: 0 },
          { type: 1, answer: 'A', label: '1' },
          { type: 1 }, // open type but no answer → block
        ],
      }),
    )
    expect(meta.cells[0]![0]).toEqual({ kind: 'block' })
    expect(meta.cells[0]![1]).toMatchObject({ kind: 'cell', number: 1 })
    expect(meta.cells[0]![2]).toEqual({ kind: 'block' })
    expect(solution[0]).toEqual([null, ['A'], null])
  })

  it('type 4 (invisible) is a hidden block', () => {
    const { meta } = convertNytPuzzle(
      makeResp({ width: 1, height: 1, cells: [{ type: 4 }] }),
    )
    expect(meta.cells[0]![0]).toEqual({ kind: 'block', hidden: true })
  })

  it('type 2 → circled, type 3 → shaded', () => {
    const { meta } = convertNytPuzzle(
      makeResp({
        width: 2,
        height: 1,
        cells: [
          { type: 2, answer: 'A', label: '1' },
          { type: 3, answer: 'B', label: '2' },
        ],
      }),
    )
    expect(meta.cells[0]![0]).toMatchObject({ kind: 'cell', circled: true })
    expect(meta.cells[0]![1]).toMatchObject({ kind: 'cell', shaded: true })
  })

  it('uppercases answers; a multi-char answer is a rebus', () => {
    const { solution } = convertNytPuzzle(
      makeResp({ width: 1, height: 1, cells: [{ type: 1, answer: 'pie', label: '1' }] }),
    )
    expect(solution[0]![0]).toEqual(['PIE'])
  })

  it('Schrödinger alternates (moreAnswers.valid), deduped against primary', () => {
    const { solution } = convertNytPuzzle(
      makeResp({
        width: 1,
        height: 1,
        cells: [{ type: 1, answer: 'M', label: '1', moreAnswers: { valid: ['M', 'F'] } }],
      }),
    )
    expect(solution[0]![0]).toEqual(['M', 'F'])
  })

  it('takes cell numbers from label, not geometry; bad labels → null', () => {
    const { meta } = convertNytPuzzle(
      makeResp({
        width: 2,
        height: 1,
        cells: [
          { type: 1, answer: 'A', label: '7' },
          { type: 1, answer: 'B' }, // no label
        ],
      }),
    )
    expect(meta.cells[0]![0]).toMatchObject({ number: 7 })
    expect(meta.cells[0]![1]).toMatchObject({ number: null })
  })

  it('never emits given cells (NYT path has no givens)', () => {
    const { meta } = convertNytPuzzle(makeResp({}))
    for (const row of meta.cells) {
      for (const cell of row) {
        if (cell.kind === 'cell') expect(cell.given).toBeUndefined()
      }
    }
  })
})

describe('convertNytPuzzle — clues + html', () => {
  it('splits across/down by direction, sorts by number, strips HTML', () => {
    const { meta } = convertNytPuzzle(
      makeResp({
        clueList: [
          { text: 'Down two', direction: 'Down', label: '2' },
          { text: 'Across one', direction: 'across', label: '1' },
          { text: 'no label', direction: 'across' },
        ],
      }),
    )
    expect(meta.clues.across).toEqual([{ number: 1, text: 'Across one' }])
    expect(meta.clues.down).toEqual([{ number: 2, text: 'Down two' }])
  })

  it('html→text: italics, subscript, em-dash, numeric entity', () => {
    const { meta } = convertNytPuzzle(
      makeResp({
        clueList: [
          { text: '<i>Tilted</i>: KNO<sub>3</sub> &mdash; &#65;', direction: 'across', label: '1' },
        ],
      }),
    )
    expect(meta.clues.across[0]!.text).toBe('_Tilted_: KNO3 — A')
  })

  it('unwraps array / {plain} clue text shapes', () => {
    const { meta } = convertNytPuzzle(
      makeResp({
        clueList: [
          { text: ['first', 'ignored'], direction: 'across', label: '1' },
          { text: { plain: 'plainish' }, direction: 'down', label: '2' },
        ],
      }),
    )
    expect(meta.clues.across[0]!.text).toBe('first')
    expect(meta.clues.down[0]!.text).toBe('plainish')
  })
})

describe('convertNytPuzzle — meta', () => {
  it('builds the dated title (UTC weekday) + author + copyright', () => {
    const { meta } = convertNytPuzzle(
      makeResp({
        title: 'Theme Day',
        publicationDate: '2026-07-05', // a Sunday
        constructors: ['Ada', 'Bea'],
        editor: 'Will',
        copyright: '2026',
      }),
    )
    expect(meta.title).toBe('NYT Sun 7/5/26: Theme Day')
    expect(meta.author).toBe('Ada, Bea / Will')
    expect(meta.copyright).toBe('© 2026, The New York Times')
  })

  it('falls back to an undated title without publicationDate', () => {
    const { meta } = convertNytPuzzle(makeResp({ title: 'Solo' }))
    expect(meta.title).toBe('NYT: Solo')
  })
})

describe('convertNytPuzzle — rejections', () => {
  it('throws on a missing body', () => {
    expect(() => convertNytPuzzle({} as NytPuzzleResponse)).toThrow(NytConvertError)
  })
  it('throws on a cell-count mismatch', () => {
    expect(() =>
      convertNytPuzzle(makeResp({ width: 3, height: 3, cells: [{ type: 0 }] })),
    ).toThrow(/cell count/)
  })
})
