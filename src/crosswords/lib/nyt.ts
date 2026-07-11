/**
 * Pure conversion of an NYT v6 puzzle JSON into our template + solution —
 * ported from crossplay's `nyt.ts` (`nytResponseToPuzzleState` + the clue
 * HTML/text helpers + the meta builders). No fetch, no Deno/Node specifics,
 * so the same code backs the `crosswords-import-nyt` edge function (Deno)
 * AND its vitest tests. Uses `.ts` import specifiers so it resolves under
 * Deno too.
 *
 * This module stays PURE (no fetch). The overlay-PNG connected-component
 * analysis — NYT bakes circles-on-shaded cells and word-break bars into a
 * raster overlay the JSON can't express — lives in `nytOverlay.ts` and is
 * applied by the `crosswords-import-nyt` edge function AFTER conversion (it
 * needs to fetch + decode the PNG). The types below expose the overlay's
 * asset pointer (`body.overlays.beforeStart` → `assets[i].uri`) so the edge
 * fn can find it. Plain circles (type 2) and plain shading (type 3) still come
 * through here directly.
 */

import type { Cell, Clue, PuzzleMeta, PuzzleTemplate } from './types.ts'
import { htmlToText } from './clueHtml.ts'

// ── NYT v6 response shape (only the fields the converter reads) ──────────
export type NytCell = {
  type?: number
  answer?: string
  label?: string
  moreAnswers?: { valid?: string[] }
}
export type NytClue = {
  text?: unknown // string | array | { plain?: string } — HTML
  direction?: string
  label?: string
}
export type NytBody = {
  dimensions: { width: number; height: number }
  cells: NytCell[]
  clues: NytClue[]
  /** Present when the puzzle ships a raster overlay (circles-on-shaded and/or
   *  word-break bars the per-cell `type` field can't express). `beforeStart`
   *  is a 1-based index into the response's `assets` array. */
  overlays?: { beforeStart?: number }
}
export type NytPuzzleResponse = {
  body?: NytBody[]
  /** Raster assets (overlay PNGs); indexed 1-based by `body.overlays`. */
  assets?: { uri?: string }[]
  title?: string
  publicationDate?: string
  constructors?: string[]
  editor?: string
  copyright?: string
  notes?: { text?: string }[]
}

/** Thrown when the v6 JSON is structurally unusable (missing body, cell-count
 *  mismatch). The fetch layer maps this to a legible error. */
export class NytConvertError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NytConvertError'
  }
}

// NYT cell `type` codes (mutually exclusive — hence the overlay for combos).
const NYT_BLOCK = 0
const NYT_CIRCLED = 2
const NYT_GRAY = 3
const NYT_INVISIBLE = 4

/**
 * Convert an NYT v6 puzzle response into `{ meta, solution }`. `meta` is the
 * full template (PuzzleMeta + the initial grid cells; every `fill` null);
 * `solution` is the parallel answer grid (null for blocks, else the accepted
 * answers, Schrödinger alternates included). Never emits `given` cells.
 */
export function convertNytPuzzle(resp: NytPuzzleResponse): {
  meta: PuzzleTemplate
  solution: (string[] | null)[][]
} {
  const body = resp.body?.[0]
  if (!body) throw new NytConvertError('NYT puzzle has no body')
  const width = Number(body.dimensions?.width)
  const height = Number(body.dimensions?.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new NytConvertError(`bad dimensions ${JSON.stringify(body.dimensions)}`)
  }
  const flat = body.cells
  if (!Array.isArray(flat) || flat.length !== width * height) {
    throw new NytConvertError(`cell count ${flat?.length} != ${width}×${height}`)
  }

  const cells: Cell[][] = []
  const solution: (string[] | null)[][] = []
  for (let r = 0; r < height; r++) {
    const cellRow: Cell[] = []
    const solRow: (string[] | null)[] = []
    for (let c = 0; c < width; c++) {
      const nc = flat[r * width + c]!
      const type = nc.type ?? NYT_BLOCK
      const isBlock = type === NYT_BLOCK || type === NYT_INVISIBLE
      const hasAnswer = typeof nc.answer === 'string' && nc.answer.length > 0
      if (isBlock || !hasAnswer) {
        cellRow.push(type === NYT_INVISIBLE ? { kind: 'block', hidden: true } : { kind: 'block' })
        solRow.push(null)
        continue
      }
      const primary = nc.answer!.toUpperCase()
      const alternates = (nc.moreAnswers?.valid ?? [])
        .map((a) => a.toUpperCase())
        .filter((a) => a !== primary)
      const number = nc.label ? Number(nc.label) : NaN
      cellRow.push({
        kind: 'cell',
        number: Number.isInteger(number) && number > 0 ? number : null,
        fill: null,
        ...(type === NYT_CIRCLED ? { circled: true } : {}),
        ...(type === NYT_GRAY ? { shaded: true } : {}),
      })
      solRow.push([primary, ...alternates])
    }
    cells.push(cellRow)
    solution.push(solRow)
  }

  const across: Clue[] = []
  const down: Clue[] = []
  for (const cl of body.clues ?? []) {
    const num = cl.label ? Number(cl.label) : NaN
    if (!Number.isInteger(num) || num <= 0) continue
    const entry: Clue = { number: num, text: clueText(cl.text) }
    const dir = (cl.direction ?? '').toLowerCase()
    if (dir === 'across') across.push(entry)
    else if (dir === 'down') down.push(entry)
  }
  across.sort((a, b) => a.number - b.number)
  down.sort((a, b) => a.number - b.number)

  const meta: PuzzleMeta = {
    id: resp.publicationDate ?? 'nyt',
    title: nytTitle(resp),
    author: nytAuthor(resp),
    copyright: resp.copyright ? `© ${resp.copyright}, The New York Times` : '',
    note: nytNote(resp),
    width,
    height,
    clues: { across, down },
  }
  return { meta: { ...meta, cells }, solution }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function nytTitle(resp: NytPuzzleResponse): string {
  const base = resp.title && resp.title.length > 0 ? resp.title : 'Untitled'
  const date = resp.publicationDate
  if (!date) return `NYT: ${base}`
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return `NYT: ${base}`
  const day = WEEKDAYS[d.getUTCDay()]
  const stamp = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(-2)}`
  return `NYT ${day} ${stamp}: ${base}`
}

function nytAuthor(resp: NytPuzzleResponse): string {
  const makers = (resp.constructors ?? []).filter((s) => typeof s === 'string')
  const base = makers.join(', ')
  return resp.editor ? (base ? `${base} / ${resp.editor}` : resp.editor) : base
}

function nytNote(resp: NytPuzzleResponse): string {
  return (resp.notes ?? [])
    .map((n) => n.text)
    .filter((t): t is string => typeof t === 'string')
    .join('\n\n')
}

/** Unwrap NYT's polymorphic clue text (string | [first, …] | {plain}) then
 *  strip HTML to plain text. */
function clueText(text: unknown): string {
  let raw: unknown = text
  if (Array.isArray(raw)) raw = raw[0]
  if (raw && typeof raw === 'object') raw = (raw as { plain?: string }).plain ?? ''
  if (typeof raw !== 'string') return ''
  return htmlToText(raw)
}
