/**
 * Read the .ipuz crossword format (http://www.ipuz.org/) into the
 * `{ state, solution }` shape the crosswords import pipeline uses.
 * Ported from crossplay's `ipuz.ts`; the write side (`writeIpuz`) is
 * dropped — we store `meta` + `solution` as jsonb, not a re-serialized
 * ipuz blob.
 *
 * ipuz is the modern, JSON-based, unencumbered counterpart to the legacy
 * binary `.puz` format. Scope is the standard-crossword subset plus basic
 * rebus, circled cells, shaded cells, author-prefilled givens, per-cell
 * Schrödinger alternates, and irregular grids (null cells). Any ipuz
 * feature outside that subset (barred grids, non-crossword `kind`, unknown
 * style keys or cell-object keys, named style references) causes
 * `parseIpuzBuffer` to throw `IpuzUnsupportedError` — a whitelist, not a
 * blacklist, so a new unknown feature surfaces loudly rather than getting
 * silently stripped.
 *
 * The pivot for both `.puz` and `.ipuz` is the same `PuzzleState` +
 * solution grid, so everything downstream sees one shape regardless of
 * the source format.
 */

import {
  MAX_REBUS_LEN,
  type Cell,
  type Clue,
  type GridSnapshot,
  type PuzzleMeta,
  type PuzzleState,
} from '../types'

export { MAX_REBUS_LEN }

export type ParseResult = {
  state: PuzzleState
  /** Per cell: null for a block, otherwise an array of accepted answers.
   *  Length 1 for normal cells; length > 1 for Schrödinger cells
   *  (multiple valid answers). Check accepts any element; reveal writes
   *  element 0 (the canonical answer). */
  solution: (string[] | null)[][]
}

/** Thrown for both malformed ipuz JSON and ipuz features we don't yet
 *  support. Callers should treat it as a 400-class error and surface
 *  `message` to the user. Shared by the `.puz` parser too. */
export class IpuzUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IpuzUnsupportedError'
  }
}

function fail(msg: string): never {
  throw new IpuzUnsupportedError(msg)
}

const CROSSWORD_KIND = /(^|\/)crossword(#|$)/i

type IpuzCellObject = {
  cell?: unknown
  style?: unknown
  value?: unknown
  /** Schrödinger alternates: extra accepted answers, in addition to
   *  `value` (or the bare string in the solution grid). Custom extension
   *  — not in the ipuz spec proper, but a clear shape. */
  alternates?: unknown
}

const ALLOWED_CELL_OBJECT_KEYS = new Set(['cell', 'style', 'value', 'alternates'])

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** Whitelist of ipuz `style` features we render. Everything else is
 *  rejected so unknown features surface loudly rather than as silent
 *  drops — when a real puzzle hits one, that's the signal to decide
 *  whether to support it. */
function parseStyle(style: unknown, where: string): { circled: boolean; shaded: boolean } {
  // Named styles (`style: "themeAccent"`) would need resolution against
  // the top-level `styles` table; we don't read that table, so honoring
  // the reference would be a silent drop.
  if (typeof style === 'string') {
    fail(`${where}: named style references (style: "${style}") are not supported`)
  }
  if (!isPlainObject(style)) fail(`${where}: style must be an object`)
  let circled = false
  let shaded = false
  for (const [key, value] of Object.entries(style)) {
    if (key === 'shapebg') {
      if (value === 'circle') {
        circled = true
      } else {
        fail(`${where}: style.shapebg=${JSON.stringify(value)} is not supported (only "circle")`)
      }
    } else if (key === 'color') {
      // Any cell-background color becomes "shaded" (rendered with our
      // standard light-grey overlay). The author's specific color is
      // intentionally dropped — per-cell color palettes would multiply
      // the design surface for very little gain, and most real puzzles
      // use shading only as a theme marker (same role as circles).
      if (typeof value !== 'string') {
        fail(`${where}: style.color must be a string`)
      }
      shaded = true
    } else {
      fail(`${where}: style.${key} is not supported`)
    }
  }
  return { circled, shaded }
}

/** Reject any keys on a cell object beyond the ones we know how to read.
 *  Catches new ipuz features (marks, clue cross-references, etc.) at
 *  parse time rather than silently dropping them. */
function checkCellObjectKeys(obj: Record<string, unknown>, where: string): void {
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_CELL_OBJECT_KEYS.has(key)) {
      fail(`${where}: unsupported cell-object key '${key}'`)
    }
  }
}

/** Decode one ipuz clue entry. Accepts `[number, "text"]` and the
 *  longhand `{number, clue}` form. Rejects multi-cell clues (number as
 *  array) and anything else. */
function parseClue(entry: unknown, where: string): Clue {
  if (Array.isArray(entry)) {
    if (entry.length < 2) fail(`${where}: malformed clue tuple`)
    const [num, text] = entry
    if (typeof num !== 'number' || !Number.isInteger(num)) {
      fail(`${where}: clue number must be an integer (got ${JSON.stringify(num)})`)
    }
    if (typeof text !== 'string') {
      fail(`${where}: clue text must be a string`)
    }
    return { number: num, text }
  }
  if (isPlainObject(entry)) {
    const num = entry.number
    const text = entry.clue
    if (Array.isArray(num)) fail(`${where}: multi-number clues are not supported`)
    if (typeof num !== 'number' || !Number.isInteger(num)) {
      fail(`${where}: clue.number must be an integer`)
    }
    if (typeof text !== 'string') {
      fail(`${where}: clue.clue must be a string`)
    }
    return { number: num, text }
  }
  fail(`${where}: unsupported clue entry shape`)
}

function parseClueList(arr: unknown, where: string): Clue[] {
  if (arr === undefined) return []
  if (!Array.isArray(arr)) fail(`${where}: expected an array`)
  return arr.map((entry, i) => parseClue(entry, `${where}[${i}]`))
}

/** Pull the clue list under either capitalization. ipuz spec uses
 *  capitalized "Across"/"Down"; some authoring tools emit lowercase. */
function pickClues(clues: Record<string, unknown>, key: string): unknown {
  return clues[key] ?? clues[key.toLowerCase()]
}

/** Validate one answer string for a solution cell. Returns the
 *  uppercased letter / rebus, or fails with a clear message. */
function validateAnswer(value: unknown, where: string): string {
  if (typeof value !== 'string') {
    fail(`${where}: solution cell must be a letter (got ${JSON.stringify(value)})`)
  }
  if (value.length === 0) {
    fail(`${where}: solution cell is empty`)
  }
  if (value.length > MAX_REBUS_LEN) {
    fail(`${where}: rebus solutions over ${MAX_REBUS_LEN} characters are not supported`)
  }
  return value.toUpperCase()
}

/** Normalize one solution-grid cell to an array of accepted answers
 *  (length 1 for normal cells, > 1 for Schrödinger cells) or null
 *  (block). Accepts a bare string, or an object `{value, alternates}`
 *  where `alternates` is an array of additional accepted answers. */
function parseSolutionCell(
  raw: unknown,
  blockChar: string,
  isBlock: boolean,
  where: string,
): string[] | null {
  if (isBlock) return null
  let value: unknown = raw
  let alternates: unknown = undefined
  if (isPlainObject(raw)) {
    checkCellObjectKeys(raw, where)
    if (raw.style !== undefined) parseStyle(raw.style, where)
    value = 'value' in raw ? raw.value : raw.cell
    alternates = raw.alternates
  }
  if (value === blockChar) {
    fail(`${where}: solution marks block where puzzle marks an open cell`)
  }
  const out: string[] = [validateAnswer(value, where)]
  if (alternates !== undefined) {
    if (!Array.isArray(alternates)) {
      fail(`${where}: alternates must be an array`)
    }
    for (let i = 0; i < alternates.length; i++) {
      const alt = validateAnswer(alternates[i], `${where}.alternates[${i}]`)
      if (!out.includes(alt)) out.push(alt)
    }
  }
  return out
}

/**
 * Parse an ipuz JSON buffer into `{ state, solution }`. Throws
 * `IpuzUnsupportedError` on any unsupported feature; the caller is
 * expected to surface the message.
 *
 * @param id  Puzzle id used in `meta.id`.
 * @param buffer  Raw file bytes (UTF-8 JSON; BOM tolerated).
 */
export function parseIpuzBuffer(id: string, buffer: Uint8Array): ParseResult {
  // TextDecoder works in both Node and the browser (a Node Buffer is a
  // Uint8Array, so the CLI path decodes fine too).
  let text = new TextDecoder('utf-8').decode(buffer)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    fail(`invalid JSON: ${(err as Error).message}`)
  }
  if (!isPlainObject(data)) fail('ipuz root must be an object')

  const kinds = data.kind
  if (!Array.isArray(kinds) || kinds.length === 0) {
    fail('missing `kind` (expected http://ipuz.org/crossword#1)')
  }
  if (!kinds.some((k) => typeof k === 'string' && CROSSWORD_KIND.test(k))) {
    fail(`unsupported puzzle kind: ${JSON.stringify(kinds)} (only crossword is supported)`)
  }

  const dims = data.dimensions
  if (!isPlainObject(dims)) fail('missing `dimensions`')
  const width = Number(dims.width)
  const height = Number(dims.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    fail(`invalid dimensions: ${JSON.stringify(dims)}`)
  }

  const blockChar = typeof data.block === 'string' ? data.block : '#'
  const emptyMarker = data.empty === undefined ? 0 : data.empty

  const puzzleGrid = data.puzzle
  if (!Array.isArray(puzzleGrid) || puzzleGrid.length !== height) {
    fail(`puzzle grid must have ${height} rows`)
  }
  const solutionGrid = data.solution
  if (!Array.isArray(solutionGrid) || solutionGrid.length !== height) {
    fail(`solution grid must have ${height} rows (we don't yet support solver-only ipuz files)`)
  }

  const cells: Cell[][] = []
  const solution: (string[] | null)[][] = []
  for (let r = 0; r < height; r++) {
    const puzRow = puzzleGrid[r]
    const solRow = solutionGrid[r]
    if (!Array.isArray(puzRow) || puzRow.length !== width) {
      fail(`puzzle row ${r} must have ${width} cells`)
    }
    if (!Array.isArray(solRow) || solRow.length !== width) {
      fail(`solution row ${r} must have ${width} cells`)
    }
    const cellRow: Cell[] = []
    const solOut: (string[] | null)[] = []
    for (let c = 0; c < width; c++) {
      const where = `puzzle[${r}][${c}]`
      const raw = puzRow[c]
      let cellValue: unknown = raw
      let circled = false
      let shaded = false
      let given: string | undefined
      if (isPlainObject(raw)) {
        const obj = raw as IpuzCellObject
        checkCellObjectKeys(raw, where)
        if (obj.style !== undefined) {
          ;({ circled, shaded } = parseStyle(obj.style, where))
        }
        if (obj.value !== undefined) {
          // Pre-filled (given) cells: the author seeds a letter the
          // player can't edit. Stored as `fill` + `given: true`;
          // `set_cell` refuses to mutate it and the client renders it
          // underlined.
          given = validateAnswer(obj.value, `${where}.value`)
        }
        cellValue = obj.cell ?? emptyMarker
      }

      if (cellValue === null) {
        // Irregular-grid void cell: same word-boundary / unfillable
        // behavior as a block, but rendered as transparent space.
        // Decoration / value flags are nonsensical here — reject so a
        // typo in the puzzle file surfaces clearly.
        if (circled) fail(`${where}: circled null cells are not supported`)
        if (shaded) fail(`${where}: shaded null cells are not supported`)
        if (given !== undefined) fail(`${where}: null cells cannot have a value`)
        cellRow.push({ kind: 'block', hidden: true })
        solOut.push(parseSolutionCell(solRow[c], blockChar, true, `solution[${r}][${c}]`))
        continue
      }
      if (cellValue === blockChar) {
        if (circled) fail(`${where}: circled blocks are not supported`)
        if (shaded) fail(`${where}: shaded blocks are not supported`)
        if (given !== undefined) fail(`${where}: blocks cannot have a value`)
        cellRow.push({ kind: 'block' })
        solOut.push(parseSolutionCell(solRow[c], blockChar, true, `solution[${r}][${c}]`))
        continue
      }

      let number: number | null = null
      if (typeof cellValue === 'number' && Number.isInteger(cellValue) && cellValue > 0) {
        number = cellValue
      } else if (cellValue !== emptyMarker && cellValue !== 0 && typeof cellValue !== 'string') {
        // Strings that aren't the block char (e.g. "A1" cross-references) aren't in our subset.
        fail(`${where}: unrecognized cell value ${JSON.stringify(cellValue)}`)
      }

      cellRow.push({
        kind: 'cell',
        number,
        fill: given ?? null,
        ...(circled ? { circled: true } : {}),
        ...(shaded ? { shaded: true } : {}),
        ...(given !== undefined ? { given: true } : {}),
      })
      solOut.push(parseSolutionCell(solRow[c], blockChar, false, `solution[${r}][${c}]`))
    }
    cells.push(cellRow)
    solution.push(solOut)
  }

  // Optional `saved` grid: in-progress player fills, parallel to
  // `solution`. Absent on freshly-authored puzzles. We apply letters
  // into the snapshot but ignore the revealed/wrong/pencil flags (ipuz
  // has no concept of them). Given cells already carry their
  // author-prefilled fill and are skipped — `saved` is for player typing.
  const savedGrid = data.saved
  if (savedGrid !== undefined) {
    if (!Array.isArray(savedGrid) || savedGrid.length !== height) {
      fail(`saved grid must have ${height} rows`)
    }
    for (let r = 0; r < height; r++) {
      const row = savedGrid[r]
      if (!Array.isArray(row) || row.length !== width) {
        fail(`saved row ${r} must have ${width} cells`)
      }
      for (let c = 0; c < width; c++) {
        const cell = cells[r]![c]!
        if (cell.kind === 'block') continue
        if (cell.given) continue
        const raw = row[c]
        let value: unknown = raw
        if (isPlainObject(raw)) {
          checkCellObjectKeys(raw, `saved[${r}][${c}]`)
          if (raw.style !== undefined) parseStyle(raw.style, `saved[${r}][${c}]`)
          value = 'value' in raw ? raw.value : raw.cell
        }
        if (value === emptyMarker || value === 0 || value === null || value === '') continue
        if (typeof value !== 'string') {
          fail(`saved[${r}][${c}]: expected a letter (got ${JSON.stringify(value)})`)
        }
        if (value.length > MAX_REBUS_LEN) {
          fail(`saved[${r}][${c}]: saved values over ${MAX_REBUS_LEN} characters are not supported`)
        }
        cells[r]![c] = { ...cell, fill: value.toUpperCase() }
      }
    }
  }

  const cluesRaw = data.clues
  if (!isPlainObject(cluesRaw)) fail('missing `clues`')
  const acrossClues = parseClueList(pickClues(cluesRaw, 'Across'), 'clues.Across')
  const downClues = parseClueList(pickClues(cluesRaw, 'Down'), 'clues.Down')

  const meta: PuzzleMeta = {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    author: typeof data.author === 'string' ? data.author : '',
    copyright: typeof data.copyright === 'string' ? data.copyright : '',
    note: typeof data.notes === 'string' ? data.notes : '',
    width,
    height,
    clues: { across: acrossClues, down: downClues },
  }

  const snapshot: GridSnapshot = { version: 0, cells }
  return { state: { meta, snapshot }, solution }
}
