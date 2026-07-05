/**
 * The canonical crossword data shapes — ported from crossplay's
 * `packages/shared/src/index.ts` (the module both its client and server
 * imported). This is the single source of truth for what a puzzle *is*:
 * the grid model, the clue lists, and the server-only solution shape.
 *
 * Keep this file dependency-free — no Node, no DOM, no framework — so
 * both the frontend (`cursor.ts`, the Grid components) and the Node
 * import scripts (`supabase/scripts/crosswords/`) can pull it in.
 *
 * Deliberately dropped from the crossplay original (see the crosswords
 * plan → "Feature scope"):
 *   - The cryptic edge marks (`markRight` / `markBottom`) and their
 *     `MarkSide` / `MarkType` unions — cryptic-crossword apparatus that
 *     NYT dailies don't need. Nothing in the port sets or reads them.
 *   - The whole `ClientMessage` / `ServerMessage` WebSocket protocol —
 *     crossplay's transport. Our model is RPCs + Postgres CDC, so the
 *     wire protocol doesn't port at all.
 */

/** Cap on a single cell's fill / solution length, in characters.
 *  Single letters are 1; rebus answers up to MAX_REBUS_LEN. The parsers
 *  and the server's `set_cell` enforce it; the rebus input uses it to
 *  size itself. */
export const MAX_REBUS_LEN = 8

export type Direction = 'across' | 'down'

/** The scope a check / reveal acts on: the single cursor cell, the whole
 *  word under the cursor, or every fillable cell in the grid. */
export type Scope = 'letter' | 'word' | 'puzzle'

export type Cell =
  | {
      kind: 'block'
      /** Irregular-grid "void" cell — functionally identical to a
       *  regular block (terminates words, unclickable, unfillable),
       *  but rendered as transparent space instead of a black square
       *  with an outline. Used to carve non-rectangular puzzle shapes
       *  (.ipuz `null` cells). */
      hidden?: boolean
    }
  | {
      kind: 'cell'
      number: number | null
      fill: string | null
      revealed?: boolean
      wrong?: boolean
      pencil?: boolean
      /** Author-defined circle around the cell (common theme marker).
       *  Pure presentation: set at parse time, never mutated, ignored
       *  by reveal/check/clear/fill. */
      circled?: boolean
      /** Author-defined background shading (alternative theme marker;
       *  ipuz `style.color` / .puz GEXT shade bit). Pure presentation
       *  like `circled`: set at parse time, never mutated. */
      shaded?: boolean
      /** Author-prefilled cell: the `fill` arrived with the puzzle and
       *  is part of the template. `set_cell` refuses to mutate it, and
       *  the client renders the letter underlined. */
      given?: boolean
    }

export type Clue = {
  number: number
  text: string
}

export type PuzzleMeta = {
  id: string
  title: string
  author: string
  copyright: string
  note: string
  width: number
  height: number
  clues: {
    across: Clue[]
    down: Clue[]
  }
}

export type GridSnapshot = {
  version: number
  cells: Cell[][]
}

/** The parser's working shape (meta + a versioned grid snapshot). The
 *  `version` here is always 0 at parse time — a live-game concept that
 *  doesn't belong to the immutable template — so storage flattens it away
 *  into `PuzzleTemplate`. */
export type PuzzleState = {
  meta: PuzzleMeta
  snapshot: GridSnapshot
}

/** The immutable puzzle template as it lands in one `meta` jsonb column
 *  (crosswords plan → decision 9): PuzzleMeta plus the initial grid cells
 *  (numbers, blocks, circles/shading, givens). The live per-cell fills
 *  live in the separate `cells` table, never here; the solution lives in
 *  its own shielded column. This is the shape the import CLI writes and
 *  the frontend reads back. */
export type PuzzleTemplate = PuzzleMeta & { cells: Cell[][] }
