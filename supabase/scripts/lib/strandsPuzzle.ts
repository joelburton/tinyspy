/**
 * The strands puzzle shape + its validator, shared by the two halves of the
 * pipeline: `fetch-strands-puzzles.ts` (NYT → local JSONL) and
 * `import-strands-puzzles.ts` (JSONL → `strands.puzzles`).
 *
 * It lives here rather than in either script because both must agree on what a
 * well-formed puzzle IS. The fetcher validates so bad data never reaches the
 * file; the importer re-validates because a hand-edited or half-written file is
 * exactly the kind of thing that should fail loudly rather than land in a table.
 */

/** `[row, col]`, 0-based — the convention the NYT feed uses throughout. */
export type Coord = [number, number]

/** Board geometry. Fixed by the game, and asserted on every puzzle. */
export const ROWS = 8
export const COLS = 6
export const CELLS = ROWS * COLS

/** The upstream record, narrowed to the fields we keep. */
export type Feed = {
  status: string
  id: number
  printDate: string
  clue: string
  startingBoard: string[]
  themeWords: string[]
  spangram: string
  themeCoords: Record<string, Coord[]>
  spangramCoords: Coord[]
  /** NYT's own valid-non-theme list. Deliberately NOT kept — see the fetcher. */
  solutions?: string[]
}

/** The answer key, as stored in `strands.puzzles.solution`. */
export type Solution = {
  spangram: { word: string; coords: Coord[] }
  themeWords: Array<{ word: string; coords: Coord[] }>
}

/** One JSONL line, and one row of `strands.puzzles`. */
export type PuzzleRow = {
  source_id: string
  puzzle_date: string
  board: string[]
  clue: string
  solution: Solution
}

/**
 * Two cells are adjacent iff they touch on any of the 8 sides or corners —
 * **diagonals included**. Verified against the real archive: every sampled
 * puzzle uses diagonal steps (3–15 of ~40), so a 4-way rule would reject most
 * genuine answers rather than a few exotic ones.
 */
export function adjacent([r1, c1]: Coord, [r2, c2]: Coord): boolean {
  const dr = Math.abs(r1 - r2)
  const dc = Math.abs(c1 - c2)
  return (dr | dc) !== 0 && dr <= 1 && dc <= 1
}

/**
 * Reject anything that isn't a well-formed puzzle, loudly and with the date
 * attached. This is THE import guard — the table's CHECK constraints can only
 * see shape, not whether the coordinates tell the truth.
 *
 * Four things, in increasing order of interestingness:
 *
 *  1. the board is 8 rows of 6;
 *  2. every path is contiguous under 8-way adjacency;
 *  3. every path actually SPELLS its word on this board — the check that would
 *     catch a feed change silently flipping coordinates to `[col,row]`, which
 *     no amount of shape-checking would notice;
 *  4. the theme words plus the spangram TILE the board exactly: all 48 cells,
 *     each covered once. That's the invariant the whole gametype leans on —
 *     winning IS consuming the board, and found tiles lock — so a puzzle
 *     violating it is malformed and must not be stored.
 *
 * All three failure modes were verified by planting them before the guard was
 * trusted on ~900 puzzles.
 */
export function validatePuzzle(f: Feed, label: string): void {
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}`)
  }

  if (!Array.isArray(f.startingBoard) || f.startingBoard.length !== ROWS) {
    bad(`board must be ${ROWS} rows, got ${f.startingBoard?.length}`)
  }
  for (const [i, row] of f.startingBoard.entries()) {
    if (typeof row !== 'string' || row.length !== COLS) {
      bad(`board row ${i} must be ${COLS} letters, got ${JSON.stringify(row)}`)
    }
  }
  if (typeof f.spangram !== 'string' || !f.spangram) bad('missing spangram')
  if (!Array.isArray(f.themeWords) || f.themeWords.length === 0) bad('missing themeWords')
  if (typeof f.clue !== 'string') bad('missing clue')

  const entries: Array<{ word: string; coords: Coord[] }> = [
    { word: f.spangram, coords: f.spangramCoords },
    ...f.themeWords.map((w) => ({ word: w, coords: f.themeCoords?.[w] })),
  ]

  const seen = new Set<string>()
  for (const { word, coords } of entries) {
    if (!Array.isArray(coords)) bad(`no coords for ${word}`)
    if (coords.length !== word.length) {
      bad(`${word}: ${coords.length} coords for ${word.length} letters`)
    }
    coords.forEach(([r, c], i) => {
      if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS) {
        bad(`${word}: coord ${i} out of range: ${JSON.stringify(coords[i])}`)
      }
      if (f.startingBoard[r][c] !== word[i]) {
        bad(`${word}: coord ${i} [${r},${c}] is "${f.startingBoard[r][c]}", expected "${word[i]}"`)
      }
      if (i > 0 && !adjacent(coords[i - 1], coords[i])) {
        bad(`${word}: ${JSON.stringify(coords[i - 1])} → ${JSON.stringify(coords[i])} not adjacent`)
      }
      const key = `${r},${c}`
      if (seen.has(key)) bad(`cell [${r},${c}] used more than once (at ${word}[${i}])`)
      seen.add(key)
    })
  }

  if (seen.size !== CELLS) {
    bad(`theme words cover ${seen.size}/${CELLS} cells — the board must tile exactly`)
  }
}

/** Feed record → the row we store. Validates first; throws if malformed. */
export function toPuzzleRow(f: Feed, label: string): PuzzleRow {
  validatePuzzle(f, label)
  return {
    source_id: String(f.id),
    puzzle_date: f.printDate ?? label,
    board: f.startingBoard,
    clue: f.clue,
    solution: {
      spangram: { word: f.spangram, coords: f.spangramCoords },
      themeWords: f.themeWords.map((w) => ({ word: w, coords: f.themeCoords[w] })),
    },
  }
}

/**
 * A stored row, back in `Feed` shape, so the importer can re-run the SAME
 * validator over the file it is about to load. Keeping one validator and
 * adapting the input beats maintaining a second near-identical checker.
 */
export function rowAsFeed(r: PuzzleRow): Feed {
  return {
    status: 'OK',
    id: Number(r.source_id),
    printDate: r.puzzle_date,
    clue: r.clue,
    startingBoard: r.board,
    themeWords: r.solution.themeWords.map((w) => w.word),
    spangram: r.solution.spangram.word,
    themeCoords: Object.fromEntries(r.solution.themeWords.map((w) => [w.word, w.coords])),
    spangramCoords: r.solution.spangram.coords,
  }
}
