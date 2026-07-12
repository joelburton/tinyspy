/**
 * Pure conversion of a Guardian crossword's embedded JSON into our template +
 * solution — the twin of `nyt.ts`, and simpler: the Guardian data is
 * ENTRY-based (each clue carries its start position, direction, length,
 * numbering, and answer), so the grid + numbering + split clue lists fall out
 * directly with none of NYT's cell-type enum or overlay-PNG analysis. No
 * fetch, no Deno/Node specifics (`.ts` specifiers) — the same code backs the
 * `crosswords-import-guardian` edge function (Deno) and its vitest tests.
 *
 * The Guardian JSON lives on the solver page inside a
 * `<gu-island name="CrosswordComponent" props="…">` web-component tag; the
 * edge function scrapes + un-escapes it and hands the `.data` object here.
 * Auth-free — Guardian crosswords are public (unlike the NYT path's cookie).
 *
 * Not ported (deliberate v1 scope): `separatorLocations` → grid word-break
 * BARS (the cryptic enumeration is already in each clue's text, e.g. "(6,5)",
 * so the bars are cosmetic). Recorded in docs/games/crosswords.md.
 */

import type { Cell, Clue, PuzzleMeta, PuzzleTemplate } from './types.ts'
import { htmlToText } from './clueHtml.ts'

// ── Guardian response shape (only the fields the converter reads) ──────────
export type GuardianEntry = {
  number?: number
  clue?: string
  direction?: string // 'across' | 'down'
  length?: number
  position?: { x?: number; y?: number } // 0-indexed grid coords
  solution?: string // uppercase answer; absent until published
}
export type GuardianData = {
  id?: string // slug, e.g. "crosswords/quick/17529"
  name?: string // "Quick crossword No 17,529"
  date?: number // epoch ms
  creator?: { name?: string } | null
  crosswordType?: string // "quick" | "cryptic" | …
  dimensions?: { rows?: number; cols?: number }
  entries?: GuardianEntry[]
  /** The Guardian's own "the answers are published" flag. False for a Prize /
   *  Weekend puzzle before its reveal date. */
  solutionAvailable?: boolean
}

/** Thrown when the Guardian JSON is structurally unusable or the solution
 *  hasn't been published yet. The fetch layer maps this to a legible error. */
export class GuardianConvertError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GuardianConvertError'
  }
}

/**
 * Convert a Guardian crossword `data` object into `{ meta, solution }` — the
 * same target shape `convertNytPuzzle` produces. `meta` is the full template
 * (PuzzleMeta + the initial grid cells, every `fill` null); `solution` is the
 * parallel answer grid (null for blocks, else a one-element `[LETTER]` per
 * fillable cell). Never emits `given` cells.
 *
 * Requires published answers: a puzzle whose solutions are still withheld
 * (`solutionAvailable === false`, or any entry missing its `solution`) can't
 * back a playable game (our check/reveal/terminal flow needs the answer key),
 * so it throws rather than seeding an unsolvable board.
 */
export function convertGuardianPuzzle(data: GuardianData): {
  meta: PuzzleTemplate
  solution: (string[] | null)[][]
} {
  const width = Number(data.dimensions?.cols)
  const height = Number(data.dimensions?.rows)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new GuardianConvertError(`bad dimensions ${JSON.stringify(data.dimensions)}`)
  }
  const entries = data.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new GuardianConvertError('Guardian puzzle has no entries')
  }
  if (data.solutionAvailable === false) {
    throw new GuardianConvertError(
      "this puzzle's answers aren't published yet (Prize/Weekend puzzles reveal later)",
    )
  }

  // Start every cell a block; entries carve out the fillable cells. Numbers
  // are placed at each entry's START cell — an across + a down entry that
  // begin at the same cell share one number (Guardian gives them the same
  // value, so the second write is idempotent).
  const cells: Cell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Cell => ({ kind: 'block' })),
  )
  const solution: (string[] | null)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): string[] | null => null),
  )

  const across: Clue[] = []
  const down: Clue[] = []

  for (const e of entries) {
    const dir = (e.direction ?? '').toLowerCase()
    if (dir !== 'across' && dir !== 'down') {
      throw new GuardianConvertError(`entry ${e.number} has bad direction "${e.direction}"`)
    }
    const len = Number(e.length)
    const sx = Number(e.position?.x)
    const sy = Number(e.position?.y)
    const answer = (e.solution ?? '').toUpperCase()
    if (!Number.isInteger(len) || len <= 0 || !Number.isInteger(sx) || !Number.isInteger(sy)) {
      throw new GuardianConvertError(`entry ${e.number} has bad geometry`)
    }
    if (answer.length !== len) {
      throw new GuardianConvertError(
        `entry ${e.number} ${dir}: solution "${answer}" (${answer.length}) ≠ length ${len}`,
      )
    }

    const num = Number.isInteger(e.number) && (e.number as number) > 0 ? (e.number as number) : null
    for (let i = 0; i < len; i++) {
      const x = dir === 'across' ? sx + i : sx
      const y = dir === 'across' ? sy : sy + i
      if (x < 0 || x >= width || y < 0 || y >= height) {
        throw new GuardianConvertError(`entry ${e.number} runs off the ${width}×${height} grid`)
      }
      const existing = cells[y]![x]!
      // The start cell owns the number; interior cells keep number null unless
      // a crossing entry starts there (handled when THAT entry's loop hits i=0).
      const cellNumber = i === 0 ? num : existing.kind === 'cell' ? existing.number : null
      cells[y]![x] = { kind: 'cell', number: cellNumber, fill: null }
      // A crossing cell must agree between its across + down entries. If a
      // (corrupt) feed disagrees, fail loudly at import — silently keeping the
      // later write would ship a puzzle that check() marks wrong and no one can
      // solve.
      const prevSolution = solution[y]![x]
      const letter = answer[i]!
      if (prevSolution && prevSolution[0] !== letter) {
        throw new GuardianConvertError(
          `crossing conflict at (${x},${y}): "${prevSolution[0]}" vs "${letter}" (entry ${e.number})`,
        )
      }
      solution[y]![x] = [letter]
    }

    const clue: Clue = { number: num ?? 0, text: htmlToText(e.clue ?? '') }
    ;(dir === 'across' ? across : down).push(clue)
  }

  across.sort((a, b) => a.number - b.number)
  down.sort((a, b) => a.number - b.number)

  const meta: PuzzleMeta = {
    id: data.id || 'guardian',
    title: data.name || 'Guardian crossword',
    author: data.creator?.name ?? '',
    copyright: '© Guardian News & Media',
    note: '',
    width,
    height,
    clues: { across, down },
  }
  return { meta: { ...meta, cells }, solution }
}
