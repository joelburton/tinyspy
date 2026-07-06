/**
 * Parse a legacy binary `.puz` file into the same `{ state, solution }`
 * shape `parseIpuzBuffer` returns. Ported from crossplay's `puzzle.ts`.
 * Uses the `puzjs` reader — a dependency-free UMD module that operates on a
 * `Uint8Array`, so it bundles fine in the browser (the in-app upload) as well
 * as running under the Node import CLI. Lives in `lib/parse/` so both consume
 * it (dual-runtime, like `nyt.ts`).
 *
 * `.puz` gotcha (see crossplay): the format is ISO-8859-1 (Latin-1), not
 * UTF-8. Stay in ASCII when touching fixture strings — UTF-8 multi-byte
 * sequences show up as `â`-prefixed garbage.
 *
 * Cell numbering is computed here, not read from puzjs: the library
 * exposes clue *text* keyed by number but doesn't say which cells start a
 * word, so we walk the grid in reading order and assign numbers the
 * standard way (a cell starts a word if its left/up neighbour is a block
 * or edge and its right/down neighbour is open).
 */

import Puz from 'puzjs'
import { IpuzUnsupportedError, MAX_REBUS_LEN, type ParseResult } from './ipuz'
import type { Cell, Clue, GridSnapshot, PuzzleMeta } from '../types'

/**
 * @param id  The puzzle id used in `meta.id`.
 * @param buffer  Raw `.puz` bytes as a `Uint8Array` (a Node `Buffer` from the
 *                CLI is one; the browser upload passes one from `File`).
 */
export function parsePuzBuffer(id: string, buffer: Uint8Array): ParseResult {
  const decoded = Puz.decode(new Uint8Array(buffer))
  const rawGrid = decoded.grid
  const height = rawGrid.length
  const width = rawGrid[0]?.length ?? 0

  // puzjs has a long-standing bug in `getExtension`: it reads the GEXT
  // section length as big-endian instead of little-endian, which makes
  // it overshoot the per-cell markup array and treat trailing file bytes
  // as additional markup. The result is spurious out-of-range indices in
  // both `circles` and `shades`. Filter to in-grid indices before use.
  const cellCount = width * height
  const inGrid = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < cellCount
  const circledSet = new Set<number>(
    (Array.isArray(decoded.circles) ? decoded.circles : []).filter(inGrid),
  )
  const shadedSet = new Set<number>(
    (Array.isArray(decoded.shades) ? decoded.shades : []).filter(inGrid),
  )

  // puzjs returns object cells `{0:"B", solution:"BLOCK"}` for rebus
  // answers, with the full multi-character `solution`. We accept those up
  // to MAX_REBUS_LEN; longer ones get rejected. .puz has no native
  // concept of Schrödinger alternates, so each cell gets a single-element
  // array. ipuz imports can be multi-element.
  const solution: (string[] | null)[][] = rawGrid.map((row, r) =>
    row.map((cell, c) => {
      if (cell === '.') return null
      const letter = typeof cell === 'string' ? cell : cell.solution
      if (typeof letter !== 'string' || letter.length === 0) {
        throw new IpuzUnsupportedError(`solution[${r}][${c}]: empty or invalid solution letter`)
      }
      if (letter.length > MAX_REBUS_LEN) {
        throw new IpuzUnsupportedError(
          `rebus solutions over ${MAX_REBUS_LEN} characters are not supported`,
        )
      }
      return [letter.toUpperCase()]
    }),
  )

  const isBlock = (r: number, c: number) =>
    r < 0 || c < 0 || r >= height || c >= width || rawGrid[r]![c] === '.'

  const numbers: (number | null)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null as number | null),
  )

  const acrossClues: Clue[] = []
  const downClues: Clue[] = []
  let n = 0
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (isBlock(r, c)) continue
      const startsAcross = isBlock(r, c - 1) && !isBlock(r, c + 1)
      const startsDown = isBlock(r - 1, c) && !isBlock(r + 1, c)
      if (startsAcross || startsDown) {
        n += 1
        numbers[r]![c] = n
        if (startsAcross) {
          const text = decoded.clues.across[n]
          if (text != null) acrossClues.push({ number: n, text })
        }
        if (startsDown) {
          const text = decoded.clues.down[n]
          if (text != null) downClues.push({ number: n, text })
        }
      }
    }
  }

  const cells: Cell[][] = rawGrid.map((row, r) =>
    row.map((cell, c): Cell => {
      if (cell === '.') return { kind: 'block' }
      const idx = r * width + c
      const circled = circledSet.has(idx)
      const shaded = shadedSet.has(idx)
      return {
        kind: 'cell',
        number: numbers[r]![c] ?? null,
        fill: null,
        ...(circled ? { circled: true } : {}),
        ...(shaded ? { shaded: true } : {}),
      }
    }),
  )

  const meta: PuzzleMeta = {
    id,
    title: decoded.meta.title ?? '',
    author: decoded.meta.author ?? '',
    copyright: decoded.meta.copyright ?? '',
    note: decoded.meta.description ?? '',
    width,
    height,
    clues: { across: acrossClues, down: downClues },
  }

  const snapshot: GridSnapshot = { version: 0, cells }

  return { state: { meta, snapshot }, solution }
}
