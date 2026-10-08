// cs-unmet

/**
 * crosswords' types — every type this game exports, in one place, so the data
 * the surface slings around can be read side by side. The `G` says a type is
 * this game's and not the shell's (docs/code-conventions.md → A game's types).
 * A component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts
 * stay in the fixture file. The types that reach React — built on an `Action`
 * — are in `reactTypes.ts`.
 *
 * Two layers of a crossword, two kinds of cell. The PUZZLE is frozen at
 * create: its grid of `GPuzzleCell`s (blocks, numbers, circles, shading, the
 * givens), its clues, and the answer key (ported from crossplay's
 * `packages/shared/src/index.ts`, the module its client and server both
 * imported). A seat's BOARD is what the players have written on it: a
 * `GCell` for every open, non-given cell, with its fill and its flags.
 *
 * Two shapes carry the game: `GGameDataRaw` is the two blobs as the builders
 * wrote them (ids, each board packed into flat arrays), and `GGameData` is
 * what `useGame` makes of it for the surface (players, each board's cells
 * keyed by id, the seat rule applied). `GPlayerRaw` / `GPlayer` and
 * `GBoardRaw` / `GBoard` are the same pair, one level down.
 *
 * Loaded by the NYT and Guardian edge functions (through `lib/nyt.ts` and
 * `lib/guardian.ts`) and by the import CLI, so every import is relative and
 * ends in `.ts` (src/guards/edgeFunctionImports.test.ts).
 */

import type {
  FactsApart,
  GameDataRaw,
  GameEnding,
  PlayerRaw,
} from '../common/game-page/gameData.ts'
import type { EndingLabel } from '../common/ending/endingLabel.ts'
import type { SummaryData } from '../common/manifest/summaryData.ts'
import type { TimerMode } from '../common/manifest/types.ts'
import type { SetupOf } from '../common/setup-form/types.ts'

// ─── The puzzle ─────────────────────────────────────────────

export type GDirection = 'across' | 'down'

/** The scope a check / reveal acts on: the single cursor cell, the whole
 *  word under the cursor, or every fillable cell in the grid. */
export type GScope = 'letter' | 'word' | 'puzzle'

/**
 * One cell of the puzzle's grid, as the parsers write it and the template
 * stores it: a block, or an open cell with its number and the author's marks.
 */
export type GPuzzleCell =
  | {
  kind: 'block'
  // Irregular-grid "void" cell — functionally identical to a regular block
  // (terminates words, unclickable, unfillable), but rendered as transparent
  // space instead of a black square with an outline. Used to carve
  // non-rectangular puzzle shapes (.ipuz `null` cells).
  hidden?: boolean
}
  | {
  kind: 'cell'
  number: number | null
  // A given's printed letter; on a non-given cell, a saved fill an uploaded
  // half-finished `.ipuz` carries, which `create_game` seeds into the grid.
  // Null on a blank template.
  fill: string | null
  // A penciled letter: set only on the printers' copy of the grid
  // (`makePrintState`), which carries the board's fills.
  pencil?: boolean
  // Author-defined circle around the cell (common theme marker). Pure
  // presentation: set at parse time, never mutated, ignored by
  // reveal/check/clear/fill.
  circled?: boolean
  // Author-defined background shading (alternative theme marker; ipuz
  // `style.color` / .puz GEXT shade bit). Pure presentation like `circled`: set
  // at parse time, never mutated.
  shaded?: boolean
  // Author-prefilled cell: the `fill` arrived with the puzzle and is part of
  // the template. `set_cell` refuses to mutate it, and the client renders the
  // letter underlined.
  given?: boolean
  // An author-drawn word-break / hyphen on this cell's RIGHT edge — the NYT
  // overlay import writes these — which `create_game` seeds into the grid,
  // where a player's own marks live too.
  markRight?: GMarkType
  // Same as `markRight`, for the BOTTOM edge (boundary with the cell below) —
  // down-entry breaks.
  markBottom?: GMarkType
}

/** Which edge of a cell a mark sits on. `right` = the boundary with the
 *  cell to the right (across breaks); `bottom` = the cell below (down). */
export type GMarkSide = 'right' | 'bottom'

/** A cryptic edge mark: a word break or a hyphen. Display-only (ignored by
 *  solve / check / reveal); shared on the coop grid, per player in compete. */
export type GMarkType = 'break' | 'hyphen'

export type GClue = {
  number: number
  text: string
}

export type GPuzzleMeta = {
  id: string
  title: string
  author: string
  copyright: string
  note: string
  width: number
  height: number
  clues: {
    across: GClue[]
    down: GClue[]
  }
}

export type GGridSnapshot = {
  version: number
  cells: GPuzzleCell[][]
}

/** The parser's working shape (meta + a versioned grid snapshot). The
 *  `version` here is always 0 at parse time — a live-game concept that
 *  doesn't belong to the immutable template — so storage flattens it away
 *  into `GPuzzleTemplate`. */
export type GPuzzleState = {
  meta: GPuzzleMeta
  snapshot: GGridSnapshot
}

/** The immutable puzzle template as it lands in `puzzle_content`: the meta
 *  plus the grid's cells (numbers, blocks, circles/shading, givens). A seat's
 *  fills live in its board, never here; the answer key lives beside it,
 *  shielded. This is the shape the import CLI writes and the page reads. */
export type GPuzzleTemplate = GPuzzleMeta & { cells: GPuzzleCell[][] }

/** The answer key: per cell, null for a block, otherwise every accepted
 *  answer — one for a normal cell, more for a Schrödinger cell. Check accepts
 *  any; reveal writes the first, the canonical answer. */
export type GSolution = (string[] | null)[][]

/** The puzzle as the page has it (`gd.puzzle`): the template, frozen at
 *  create, and the answer key, null until the game ends. */
export type GPuzzle = GPuzzleTemplate & {
  solution: GSolution | null
}

// ─── Importing a puzzle ─────────────────────────────────────

/** What a parser makes of a `.puz` / `.ipuz` file: the puzzle and its answer
 *  key. */
export type GParseResult = {
  state: GPuzzleState
  // Per cell: null for a block, otherwise an array of accepted answers.
  // Length 1 for normal cells; length > 1 for Schrödinger cells
  // (multiple valid answers). Check accepts any element; reveal writes
  // element 0 (the canonical answer).
  solution: GSolution
}

/** The inline board `crosswords.create_game`'s `board` arg wants — the same
 *  `{meta, solution}` shape the NYT edge function produces, but parsed
 *  entirely client-side from an uploaded file. */
export type GImportedBoard = {
  meta: GPuzzleTemplate
  solution: GSolution
}

/** One cell of an NYT v6 response (only the fields the converter reads). */
export type GNytCell = {
  type?: number
  answer?: string
  label?: string
  moreAnswers?: { valid?: string[] }
}

/** One clue of an NYT v6 response. */
type NytClue = {
  // string | array | { plain?, formatted? }. `formatted` is the one carrying
  // markup and is present only on clues that need it — see clueText.
  text?: unknown
  direction?: string
  label?: string
}

/** The puzzle body of an NYT v6 response. */
type NytBody = {
  dimensions: { width: number; height: number }
  cells: GNytCell[]
  clues: NytClue[]
  // Present when the puzzle ships a raster overlay (circles-on-shaded and/or
  // word-break bars the per-cell `type` field can't express). `beforeStart`
  // is a 1-based index into the response's `assets` array.
  overlays?: { beforeStart?: number }
}

/** An NYT v6 puzzle response (only the fields the converter reads). */
export type GNytPuzzleResponse = {
  body?: NytBody[]
  // Raster assets (overlay PNGs); indexed 1-based by `body.overlays`.
  assets?: { uri?: string }[]
  title?: string
  publicationDate?: string
  constructors?: string[]
  editor?: string
  copyright?: string
  notes?: { text?: string }[]
}

/** Decoded markings from a NYT overlay PNG.
 *
 *  - `circles`: cells with a theme-marker circle drawn on them (most common
 *    use of the overlay channel — circles-on-shaded cells the per-cell `type`
 *    field can't represent).
 *
 *  - `barsRight` / `barsBottom`: cells with a thick author-drawn line on their
 *    right / bottom edge. NYT uses these in some themed puzzles as a *visual*
 *    separator that doesn't actually break a word (the JSON's `clues` arrays
 *    span across them). Maps directly onto our `markRight` / `markBottom`
 *    "break" marks.
 *
 *  All three sets use `"row,col"` string keys. */
export type GOverlayMarkings = {
  circles: Set<string>
  barsRight: Set<string>
  barsBottom: Set<string>
}

/** One entry of a Guardian crossword (only the fields the converter reads). */
export type GGuardianEntry = {
  number?: number
  clue?: string
  direction?: string // 'across' | 'down'
  length?: number
  position?: { x?: number; y?: number } // 0-indexed grid coords
  solution?: string // uppercase answer; absent until published
}

/** A Guardian crossword, as its solver page embeds it (only the fields the
 *  converter reads). */
export type GGuardianData = {
  id?: string // slug, e.g. "crosswords/quick/17529"
  name?: string // "Quick crossword No 17,529"
  date?: number // epoch ms
  creator?: { name?: string } | null
  crosswordType?: string // "quick" | "cryptic" | …
  dimensions?: { rows?: number; cols?: number }
  entries?: GGuardianEntry[]
  // The Guardian's own "the answers are published" flag. False for a Prize /
  // Weekend puzzle before its reveal date.
  solutionAvailable?: boolean
}

// ─── The setup ──────────────────────────────────────────────

/**
 * The setup blob the dialog collects and `crosswords.create_game` /
 * `crosswords-import-nyt` / `crosswords-import-guardian` validate. `mode` is
 * NOT here — it's a top-level manifest/RPC arg (the sibling-pair split).
 * `timer` is the shared `<SetupTimerSection>`'s value, like every other game's
 * setup; a countdown expiring routes to `crosswords.submit_timeout`.
 *
 * Four ways to source the puzzle:
 *   - `source: 'library'` → `puzzle_id` names a `crosswords.puzzles` row;
 *     start goes straight to the `create_game` RPC.
 *
 *   - `source: 'nyt'` → `date` (YYYY-MM-DD) is fetched + imported by the
 *     `crosswords-import-nyt` edge function, which then creates the game.
 *
 *   - `source: 'guardian'` → `series` (quick / cryptic / …) picks the outlet;
 *     the `crosswords-import-guardian` edge function fetches TODAY's puzzle in
 *     that series and creates the game. Public (no auth).
 *
 *   - `source: 'upload'` → the FE parses an uploaded `.puz`/`.ipuz` into
 *     `board` ({meta, solution}) client-side and passes it to `create_game`'s
 *     inline `board` arg (self-contained game, no `puzzles` row — like NYT).
 */
export type GSetupValues = {
  timer: TimerMode
  // WHERE THE PUZZLE COMES FROM, and absent until someone says. A fresh form
  // names no source, and backing out of a picker puts it back here — see
  // `PuzzleSourceField`, whose button row draws the named one as the primary
  // button and so must have nothing to draw when nothing is chosen.
  source?: 'library' | 'nyt' | 'guardian' | 'upload'
  // Library path.
  puzzle_id?: string
  // NYT path: the OVERRIDE — a specific date (YYYY-MM-DD). Wins over
  // `weekday` when set, and filters nothing: a date this club has already
  // played starts a second game on it rather than being refused. Stripped
  // from the club's saved default (an instance, not a preference).
  date?: string
  // NYT path: which weekday to play, 0..6 with Sunday = 0 (Postgres `dow`,
  // JS `getUTCDay`). The normal path — an NYT crossword's day IS its
  // difficulty, so this is a standing club choice and DOES persist as the
  // saved default. The server turns it into a concrete date at Start
  // (`crosswords.next_nyt_date_for_club`): the most recent puzzle of that
  // weekday none of the players has done.
  weekday?: number
  // Guardian path: the series slug (see GUARDIAN_SERIES).
  series?: string
  // Upload path: the parsed board. FE-only — `startGameInClub` passes it as
  // the `board` arg and STRIPS it from the `setup` blob create_game persists,
  // so the solution never lands in the (unshielded) setup or saved default.
  board?: GImportedBoard
  // Upload path: the source filename, for display in the form.
  filename?: string
  // WHO IS PLAYING — a field like any other, and the only one that is not
  // part of the setup blob: `create_game` takes it as its own argument and
  // writes `common.game_players` rows from it.
  player_user_ids: Set<string>
}

/**
 * WHICH PUZZLE — every key the four pickers write, and nothing else.
 *
 * One value rather than seven loose keys, because a picker settles all of them
 * at once: choosing NYT is also "no library id, no uploaded board". Handing the
 * form a complete value makes that a property of the type — whatever the new
 * choice does not name is absent — instead of a rule the caller has to keep.
 *
 * It matters most for `board`: an uploaded solution grid left behind by a
 * source you switched away from would ride into `setup` and leak the answers.
 * That has three guards now (this, the manifest's strip, and create_game's);
 * this is the one that makes it structural.
 */
export type GPuzzleChoice = Pick<
  GSetupValues,
  'source' | 'puzzle_id' | 'date' | 'weekday' | 'series' | 'board' | 'filename'
>

/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds, and what
 *  `PlayArea` reads back. */
export type GSetup = SetupOf<GSetupValues>

// ─── The grid on screen ─────────────────────────────────────

/** Where the cursor is, and which way it reads. */
export type GCursor = {
  row: number
  col: number
  dir: GDirection
}

/** A cell's place on the grid. */
export type GCellPos = { row: number; col: number }

/** The four arrow keys, by their `KeyboardEvent.key`. */
export type GArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

/** One styled run of a clue: plain, or the italic an `<em>` marked. */
export type GClueSeg = { text: string; italic: boolean }

/** The clue the AI explainer is asked about, read off the cursor when asked. */
export type GClueAsked = {
  // How the dialog names it: "12A".
  label: string
  cells: GCellPos[]
  // The plain clue, its emphasis stripped.
  clueText: string
  // `(7)`, `(4,3)`: off the board's edge marks.
  enumeration: string
}

/** The explainer dialog's state — mirrors crossplay's ExplainPopover states,
 *  minus the scratchpad (native thinking is never returned to the client). */
export type GExplainState =
  | { kind: 'loading' }
  | { kind: 'ok'; explanation: string }
  | { kind: 'error'; message: string }

/** Where the cursor goes once a rebus is submitted — Enter advances one cell,
 *  Tab / Shift+Tab jumps to the next / previous clue (mirrors Tab elsewhere).
 * */
export type GRebusAfterSubmit = 'advance' | 'jumpNext' | 'jumpPrev'

/** The live play state the grid's keys act on. PlayArea passes it fresh every
 *  render — there is no ref, because an action is asked what it does at the
 *  moment the key is pressed. */
export type GGridKeysOptions = {
  // May the board be worked at all? False while the game is paused or this
  // player has conceded mid-race — every key below goes disabled, which also
  // leaves the keystroke for whoever else wants it.
  enabled: boolean
  // The board responds to me (the page's `isBoardInteractive`). When false
  // but `enabled` (game ended), the board is still navigable: the movement keys
  // work so the solver can walk the revealed grid, while anything that would
  // WRITE (letters, ⌫, rebus, edge marks) is disabled.
  isBoardInteractive: boolean
  // One of crosswords' OWN overlays has the keyboard — the rebus box or the
  // number-jump popup. Both are focused inputs that `stopPropagation()` their
  // keydowns before the dispatcher sees anything, so this gate is
  // belt-and-braces: it also describes every grid key disabled, so nothing
  // advertises a key the overlay is holding.
  suspended: boolean
  // Null until the puzzle loads; every key is disabled until then.
  grid: GPuzzleCell[][] | null
  cursor: GCursor | null
  pencil: boolean
  setCursor: (c: GCursor) => void
  // Current fill at a cell (null if empty); ⌫'s two-step needs it.
  fillAt: (row: number, col: number) => string | null
  isGiven: (row: number, col: number) => boolean
  setCell: (row: number,
    col: number,
    fill: string | null,
    pencil: boolean,
  ) => void
  // Open the rebus (multi-char) overlay over a cell.
  onRebus: (row: number, col: number) => void
  // Open the jump-to-clue-number popup.
  onNumberJump: () => void
  // Show a read-only zoom-peek of the current cell's fill.
  onPeek: (row: number, col: number) => void
  // Is a peek up right now? While it is, ANY key puts it away (`act-drop-peek`
  // below) — so it can't linger over a cursor that has moved on.
  peeking: boolean
  // Put the peek away.
  clearPeek: () => void
  // Cycle the cryptic edge mark on one side of a cell. The consumer reads the
  // current mark and advances it.
  onMark: (row: number, col: number, side: GMarkSide) => void
}

/** What a write changes on one cell: the keys it sets, and nothing else. */
export type GCellChanges = Partial<Omit<GCell, 'id' | 'row' | 'col'>>

/**
 * My writes the blob does not carry yet, laid over my board
 * (`usePendingWrites`): the board as it is drawn, and what a trip to the
 * server calls around its RPC.
 */
export type GPendingWrites = {
  // `gd.me.board` with every pending write laid over it, in the order made.
  board: GBoard
  // A write is made: it shows at once. Answers its handle, for the two below.
  add: (cellId: string, changes: GCellChanges) => number
  // Its RPC answered with the revision its rebuild wrote: the write leaves once
  // the blob carries that revision or a later one.
  settle: (handle: number, revision: number) => void
  // Its RPC failed: the write leaves now.
  drop: (handle: number) => void
}

/**
 * Every answer crosswords gives about a move — the whole roster of what this
 * game tells anybody. `lib/answer.ts` says what each one reads as
 * (docs/outcomes.md → How a game does it).
 *
 * A check's red marks and a reveal's letters are their real answers, drawn on
 * the grid; what the slot adds is only that a check passed over penciled
 * cells. A keystroke's refusal is not an answer: it is a race or a fault, and
 * its envelope says so.
 */
export type GAnswer =
  | { answerType: 'checked'; skippedPencil: boolean }
  | { answerType: 'revealed' }

// ─── The page blobs ─────────────────────────────────────────

/**
 * crosswords' `game_data` and `static_game_data`, as its builders write them
 * (supabase/sql/crosswords.sql → The page blobs): the common part, with the
 * puzzle, the revision, coop's grid on the team and each racer's on their
 * player on top. `useGame` merges the two blobs the page hands down and turns
 * them into `gd`. It carries every racer's grid; what a racer
 * may see of a rival's mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  puzzle: GPuzzle
  // Raised by every rebuild, under the game row's lock. `set_cell` and
  // `set_mark` answer the revision their own rebuild wrote, so the page knows
  // when a blob it reads carries its write.
  revision: number
  // The team's facts, sent once: coop's one grid. Null in compete, where
  // there is no team.
  team: GFactsRaw | null
  players: GPlayerRaw[]
}

/**
 * crosswords' facts (docs/common-schema.md → A player's facts): the grid, and
 * nothing else. A player carries it twice — spread on, their side's (the team's
 * in coop, their own in compete); under `own`, their own. A coop grid is
 * nobody's in particular, so a coop player's `own` holds the team's.
 */
export type GFacts = {
  // Null for a rival mid-race.
  board: GBoard | null
}

/** `GFacts` as the builders write them: the grid as stored. */
export type GFactsRaw = {
  board: GBoardRaw
}

/** A player as crosswords' game_data shows them: the common player, with
 *  their own grid in compete. In coop the grid is the team's, and `board` is
 *  null here. */
export type GPlayerRaw = PlayerRaw & {
  board: GBoardRaw | null
}

/**
 * A grid as the blob packs it, since it is rebuilt on every keystroke. A cell's
 * INDEX is its place counted row by row: `row × puzzle.width + col`.
 */
export type GBoardRaw = {
  // One string per cell, by index: "" when empty, a given or a block; a letter
  // (or a rebus) uppercase in pen, lowercase in pencil.
  fills: string[]
  // The indices of the cells a check found wrong.
  wrong: number[]
  // The indices of the cells a reveal filled.
  revealed: number[]
  // The indices of the cells with a word break on the right edge.
  breaksRight: number[]
  // The indices of the cells with a hyphen on the right edge.
  hyphensRight: number[]
  // The indices of the cells with a word break on the bottom edge.
  breaksBottom: number[]
  // The indices of the cells with a hyphen on the bottom edge.
  hyphensBottom: number[]
  // Coop: one digit per cell, by index — 0 nobody, otherwise the writer's
  // 1-based place in `players`. Null in compete, where a grid has one writer.
  writers: string | null
}

/**
 * crosswords' `summary_data`: the common part, with how much of coop's grid is
 * filled, for the club line's "60% filled".
 */
export type GSummaryData = SummaryData & {
  // The cells a player fills: every open, non-given cell.
  nCells: number
  // Coop's filled cells; null in compete, where each racer has their own grid.
  team: { nFilledCells: number } | null
}

/*
 * The shape of `gd` (`GGameData`): the game_data blob with its links turned
 * into players, each board unpacked into its cells, and the seat rule applied
 * (plans/seat-view.md).
 *
 * gd:
 *   id
 *   gametype
 *   brand
 *   club: {handle}
 *   mode
 *   coop
 *   compete
 *   title
 *   setup
 *   puzzle                            # the template, frozen at create, and the solution, null until the game ends
 *   revision
 *   turns: null                       # no turn order
 *   ending: {reason, detail, by, winners}  # null while playing; by and winners are players; winners is every player ranked first
 *   ended
 *   outcome                           # null until the game ends
 *   players: [player, …]
 *   playersById
 *   me                                # same object as playersById[auth.user.id]
 *
 * player:
 *   the common player
 *   board: {cells, cellsById}         # the side's grid: coop's one on every player; a rival's null mid-race
 *   own: {board}                      # this player's own; in coop the team's
 *   endingLabel: {labelType, word, long, pill, outcome, endedBy}
 *                                     # how they came out; null while they play
 *
 * cell:
 *   id                                # "r,c"
 *   row
 *   col
 *   fill                              # null when empty
 *   pencil
 *   wrong
 *   revealed
 *   markRight                         # break / hyphen / null
 *   markBottom
 *   writer                            # a player; null in compete and on an empty cell
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players, each board unpacked,
 * coop's grid put on every seat and a rival's grid withheld mid-race. No setup
 * rows: crosswords has never had them (src/guards/setupRows.test.ts →
 * NO_SETUP_ROWS). Read-only: `useGame` builds it and nothing else writes it.
 */
export type GGameData =
  Omit<GGameDataRaw, 'turns' | 'ending' | 'team' | 'players'>
  & {
  turns: { holder: GPlayer } | null
  ending: GameEnding<GPlayer> | null
  // The players by username, and the same objects keyed by id.
  players: GPlayer[]
  playersById: Record<string, GPlayer>
  // My entry in `playersById`: the same object. My own grid is always mine
  // to see.
  me: GPlayer & { board: GBoard }
}

/**
 * A player as `gd` holds them: the common player with crosswords' facts twice
 * — spread on, their side's; under `own`, their own (docs/common-schema.md → A
 * player's facts). The grid unpacked: coop's one grid on every player, a
 * racer's own in compete, a rival's null while the race is on.
 */
export type GPlayer = PlayerRaw & FactsApart<GFacts> & {
  own: GFacts
  // How they came out (`lib/endingLabel.ts`): of the game once it has ended,
  // or of their own play while the others go on. Null while they still play.
  endingLabel: EndingLabel | null
}

/** A seat's grid as `gd` holds it: a cell for every open, non-given cell, in
 *  reading order, and the same objects keyed by id. */
export type GBoard = {
  cells: GCell[]
  cellsById: Record<string, GCell>
}

/** One open, non-given cell of a seat's grid, as the players have left it. Its
 *  printed number, its circle and the rest of the author's are its
 *  `GPuzzleCell`, at the same place in `gd.puzzle.cells`. */
export type GCell = {
  // "row,col"
  id: string
  row: number
  col: number
  // A letter or a rebus, uppercase; null when empty.
  fill: string | null
  pencil: boolean
  wrong: boolean
  revealed: boolean
  markRight: GMarkType | null
  markBottom: GMarkType | null
  // Who last filled it, in coop; null in compete and on an empty cell.
  writer: GPlayer | null
}
