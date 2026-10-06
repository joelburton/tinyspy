// cs-unmet

/**
 * strands' types — every type this game exports, in one place, so the data
 * the surface slings around can be read side by side. The `G` says a type is
 * this game's and not the shell's (docs/code-conventions.md → A game's types).
 * A component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts stay
 * in the fixture file.
 *
 * Two shapes carry the game: `GGameDataRaw` is the two blobs as the builders
 * wrote them (ids), and `GGameData` is what `useGame` makes of it for the
 * surface (players and tiles, the seat rule applied). `GPlayer` /
 * `GPlayerRaw`, `GEvent` / `GEventRaw` and `GPuzzleWord` / `GPuzzleWordRaw` are the same
 * pair, one level down.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { FactsApart, GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/types'
import type { CoopTurnSetup, SetupOf, SetupRow } from '@/common/setup-form/types'

/**
 * A board cell, `[row, col]`, 0-based — the shape the feed, the stored
 * solutions and `submit_path`'s path all speak. The frontend holds tiles; a
 * cell is what a tile turns into at the RPC seam, and what the importer reads.
 */
export type GCoord = [row: number, col: number]

/**
 * One letter of the board: its place as its id ("r,c", the key the server's
 * `_path_key` compares by), the letter on it, and its row and column, 0-based.
 */
export type GTile = {
  id: string
  letter: string
  row: number
  col: number
}

/** A puzzle word, or a seat's find, as the blob carries it: its tiles as ids
 *  in the order it is traced, and whether it is the spangram. */
export type GPuzzleWordRaw = {
  word: string
  tileIds: string[]
  spangram: boolean
}

/** A puzzle word, or a seat's find, as `gd` holds it: its tiles, in the order
 *  it is traced. */
export type GPuzzleWord = Omit<GPuzzleWordRaw, 'tileIds'> & {
  tiles: GTile[]
}

/**
 * strands' `game_data` and `static_game_data`, as its builders write them
 * (supabase/sql/strands.sql → The page blobs): the common part, with the
 * puzzle, the team, the log and strands' facts about each player on top.
 * `useGame` merges the two blobs the page hands down and turns them into
 * `gd`.
 *
 * It carries everything: every player's rows in the log, and every seat's
 * board and hint bar. What a racer may see of a rival mid-race is `useGame`'s
 * rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  // The puzzle, frozen at create.
  puzzle: {
    // The theme prompt — on screen from the first second; not a spoiler.
    title: string
    // All 48 tiles, row by row.
    tiles: GTile[]
    // The puzzle words, spangram first. Null until the game ends.
    puzzleWords: GPuzzleWordRaw[] | null
  }
  // The team's facts, sent once: the words found, the hints the players
  // cashed, summed, the one hint bar and the one board. Null in compete, where
  // there is no team.
  team: GFactsRaw | null
  // The log: every row, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * strands' facts (plans/team-facts.md): the puzzle words found, the hints
 * cashed, the hint bar, and the board. A player carries them twice — spread
 * on, their side's (the team's in coop, their own in compete); under `own`,
 * their own. A coop bar and board are the team's alone, so a coop player's
 * `own` holds the team's; their finds and hints are theirs.
 */
export type GFacts = {
  // Null for a rival mid-race.
  nFoundPuzzleWords: number | null
  nHintsUsed: number
  // The hint bar's points; null for a rival mid-race.
  hintPoints: number | null
  // The finds and the ringed hint; null for a rival mid-race.
  board: GBoard | null
}

/** `GFacts` as the builders write them: nothing is withheld yet. */
export type GFactsRaw = {
  nFoundPuzzleWords: number
  nHintsUsed: number
  hintPoints: number
  board: GBoardRaw
}

/** A traced word's verdict — `submit_path`'s `result`, and a guess row's. */
export type GResult = 'theme' | 'spangram' | 'hint_word' | 'duplicate' | 'too_short' | 'invalid'

/**
 * Every answer strands gives about a move — the whole roster of what this game
 * tells anybody. `lib/answer.ts` says what each one reads as
 * (docs/outcomes.md → How a game does it). The words are `submit_path`'s
 * `result`s, and a hint row's `kind`.
 *
 * No teammate's line: strands narrates nobody's move — a teammate's find lands
 * on the board, and their row in the log. The frontend's own refusals (a typed
 * letter that matches nothing, a hint asked of an unfilled bar) write no row,
 * so they are not here: the pill is their only surface.
 */
export type GAnswer =
  // A puzzle word found: a theme word, or the spangram, which names the theme.
  | { answerType: 'theme'; word: string }
  | { answerType: 'spangram'; word: string }
  // A hint word: a point on the hint bar, and whether it filled it.
  | { answerType: 'hint_word'; word: string; filledBar: boolean }
  // Moves the rules turn away: a hint word already credited, or one shorter
  // than the setup's shortest.
  | { answerType: 'duplicate'; word: string }
  | { answerType: 'too_short'; word: string }
  // Not in the dictionary at the setup's band.
  | { answerType: 'invalid'; word: string }
  // A cashed hint, which rings a word's tiles and says no word.
  | { answerType: 'hint' }

/** What a log row is: a guess, with its word and verdict, or a cashed hint,
 *  which says no word and has no verdict. Discriminated, so `word` reads as a
 *  string only once the row is known to be a guess. */
type GEventKind =
  | { kind: 'guess'; word: string; result: GResult }
  | { kind: 'hint'; word: null; result: null }

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player and `tileIds` into tiles (`GEvent`). */
export type GEventRaw = GEventKind & {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // A guess's trace, in the order traced; a hint's ringed word.
  tileIds: string[]
  // Whether it took the player's go: a trace that found something does; a
  // miss and a hint do not.
  tookTurn: boolean
  at: string
}

/** A seat's board as the blob carries it: its found words, in the order
 *  found, and its ringed hint, null when none shows. */
export type GBoardRaw = {
  foundPuzzleWords: GPuzzleWordRaw[]
  hintTileIds: string[] | null
}

/** A player as strands' game_data shows them: the common player, with their
 *  own facts. */
export type GPlayerRaw = PlayerRaw & Pick<GFactsRaw, 'nFoundPuzzleWords' | 'nHintsUsed'> & {
  // A racer's own bar and board; null in coop, whose one bar and board are
  // `team`'s.
  hintPoints: number | null
  board: GBoardRaw | null
}

/*
 * The shape of `gd` (`GGameData`): the game_data blob with its links turned into
 * players and tiles and the seat rule applied (plans/seat-view.md).
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
 *   setupRows
 *   puzzle:                                  # frozen at create
 *     title                                  # the theme prompt
 *     tiles: [tile, …]                       # all 48, row by row
 *     tilesById
 *     puzzleWords: [puzzleWord, …]           # spangram first; null until the game ends
 *   turns: {holder}                          # null: no turn order; holder is a player
 *   ending: {reason, detail, by, winner}     # null while playing; by and winner are players
 *   ended
 *   outcome                                  # null until the game ends
 *   events: [event, …]                       # my rows only, mid-race
 *   players: [player, …]                     # seat order
 *   playersById
 *   me                                       # same object as playersById[auth.user.id]
 *
 * player:
 *   the common player
 *   nFoundPuzzleWords                        # the side's: the team's in coop, their own in compete; null for a rival mid-race
 *   nHintsUsed
 *   hintPoints                               # null for a rival mid-race
 *   board: {foundPuzzleWords, hintTiles}     # coop's one board on every player; null for a rival mid-race
 *   own: {nFoundPuzzleWords, nHintsUsed, hintPoints, board}
 *                                            # this player's own; in coop the bar and board are the team's
 *
 * tile:                                      # GTile
 *   id                                       # "r,c"
 *   letter
 *   row
 *   col
 *
 * puzzleWord:                                # GPuzzleWord, in puzzle.puzzleWords and board.foundPuzzleWords
 *   word
 *   tiles: [tile, …]                         # in trace order
 *   spangram
 *
 * event:
 *   id
 *   by
 *   kind                                     # guess / hint
 *   word                                     # null for a hint
 *   result                                   # null for a hint
 *   tiles: [tile, …]                         # a guess's trace in order, or a hint's ringed word
 *   tookTurn
 *   at
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players and tiles, the setup
 * rows built, and the seat rule applied: what I may not see yet is not here.
 * Read-only: `useGame` builds it and nothing else writes it.
 */
export type GGameData = Omit<GGameDataRaw, 'puzzle' | 'team' | 'turns' | 'ending' | 'events' | 'players'> & {
  puzzle: {
    title: string
    tiles: GTile[]
    // The same tiles, keyed by id.
    tilesById: Record<string, GTile>
    puzzleWords: GPuzzleWord[] | null
  }
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  turns: { holder: GPlayer } | null
  // The log, by player; mid-race in compete, my rows only.
  events: GEvent[]
  ending: {
    reason: NonNullable<GGameDataRaw['ending']>['reason']
    detail: string
    by: GPlayer | null
    winner: GPlayer | null
  } | null
  // The players in seat order, and the same objects keyed by id.
  players: GPlayer[]
  playersById: Record<string, GPlayer>
  // My entry in `playersById`: the same object. My own board, count and bar
  // are always mine to see.
  me: GPlayer & { board: GBoard; nFoundPuzzleWords: number; hintPoints: number }
}

/**
 * One player of this game, as `gd` holds them: the common player with
 * strands' facts twice — spread on, their side's; under `own`, their own
 * (plans/team-facts.md). A rival's found-word count, bar and board are null
 * mid-race.
 */
export type GPlayer = PlayerRaw & FactsApart<GFacts> & {
  own: GFacts
}

/** What one seat sees: its found words, in the order found, and its ringed
 *  hint, null when none shows. */
export type GBoard = {
  foundPuzzleWords: GPuzzleWord[]
  hintTiles: GTile[] | null
}

/** One row of the log, as `gd` holds it: the blob's row, with its player and
 *  its tiles. */
export type GEvent = GEventKind & Omit<GEventRaw, 'userId' | 'tileIds' | keyof GEventKind> & {
  // Who did it.
  by: GPlayer
  // A guess's trace, in the order traced; a hint's ringed word.
  tiles: GTile[]
}

/**
 * The word being traced (`hooks/useTrace.ts`): the tiles in the order they
 * were picked, and the ways to change them. Held as tile ids, handed out as the
 * live tiles.
 */
export type GTrace = {
  // The tiles traced, in order; empty when nothing is. A teammate's find that
  // takes one of them empties it, since the trace would run through tiles no
  // longer mine to use.
  tiles: GTile[]
  // The tiles spent on my board's finds: they take no trace.
  consumedTileIds: ReadonlySet<string>
  // A click's rule (`lib/trace.ts` → clickTile): extend, back up, or start over.
  click: (tile: GTile) => void
  // Add a tile a typed letter resolved to.
  extend: (tile: GTile) => void
  // Take back the last tile.
  dropLast: () => void
  clear: () => void
}

/**
 * The turn-history view (`hooks/useHistoryView.ts`): which past turn is open
 * on the board, and the board as it stood then.
 */
export type GHistoryView = {
  // A past turn is open on the board (`viewedEventId` is set): the board and
  // the entry take no move while it is.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a turn — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The board as it stood after the viewed turn — its finds, and the word a
  // viewed hint rang — or null when live.
  board: GBoard | null
  // The viewed guess's trace, ringed; empty when live or on a hint turn.
  litTiles: GTile[]
  // The banner's words for the viewed turn, or null when live.
  label: string | null
  // Whose board is on screen, when it is not mine — only a compete game's end
  // opens a rival's.
  actor: GPlayer | undefined
}

/**
 * Every command the play surface binds (`hooks/useActionsAndMenu.ts`): the info
 * column's action row places them and the menu lists them, so a button, its menu
 * row and its key cannot drift apart. The hint bar's `act-hint` and the
 * entry's two keys are the board column's own.
 */
export type GActions = {
  // Each key is spelled as its action's id (`act-reveal` → `actReveal`), so a
  // grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Show the unfound words — or put them away again. A local display toggle, no
  // RPC.
  actReveal: Action
  // Restart THIS puzzle from scratch — same board, everything the players did
  // wiped.
  actRestart: Action
  // Start the next puzzle nobody at the table has played.
  actNewGame: Action
  // Drop out of a race while the others play on — hidden in coop, and once
  // you are out, when Stop takes its place.
  actConcede: Action
  // The whole table stops, with no result.
  actStopGame: Action
  // Print the board as it stands.
  actPrintBoard: Action
  // Leave for the club — the shell's own action, off `menu`.
  actBackToClub: Action
}

/**
 * strands' per-game setup — collected by the start-game dialog, persisted to
 * `common.games.setup`, and validated server-side by `strands.create_game`
 * (the authority for what is accepted).
 */
export type GSetupValues = CoopTurnSetup & {
  // Which archived puzzle to play — OPTIONAL, because the dialog does not
  // collect it. Absence is how `create_game` is told to derive the next
  // puzzle none of the selected players has played
  // (`strands.next_puzzle_for_club`). It stays in the type because the RPC
  // still honors an explicit id, which is what the pgTAP and e2e fixtures
  // pin their assertions to.
  puzzle_id?: string
  // Dictionary ceiling for HINT words (1..6). A HIGHER band makes strands
  // EASIER: more words qualify, so hints come faster — the same direction as
  // spellingbee's `legal_band` and the opposite of waffle's tier, which is why
  // the field's copy says so out loud. Gated on difficulty alone (the
  // may-enter tier in docs/common.md).
  band: number
  // Hint words needed per hint. NYT plays 3.
  hint_cost: number
  // Shortest word that can earn a hint point. Does NOT gate puzzle words:
  // those are matched first and unconditionally, so raising this never makes a
  // real answer unfindable.
  min_word_length: number
  // `countdown` ends the game via `strands.submit_timeout`; the timer is a
  // LOSS in coop.
  timer: TimerMode
  // WHO IS PLAYING — a field like any other, and the only one that is not
  // part of the setup blob: `create_game` takes it as its own argument and
  // writes `common.game_players` rows from it.
  player_user_ids: Set<string>
}

/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds, and what
 *  `gd.setup` and the setup rows read back. */
export type GSetup = SetupOf<GSetupValues>

/**
 * What both puzzle pickers answer — `next_puzzle_for_club` and
 * `puzzle_for_date`. One `ok`; "there isn't one" is a `form-validation`
 * naming `puzzle_id`, not an empty success (PN416 / PN417). The setup dialog
 * and the in-game New game both ask.
 */
export type GPuzzleAnswer = {
  result: 'found'
  puzzle: { id: string; puzzle_date: string; label: string }
}

/**
 * `common.games.summary_data`, as `strands._rebuild_data_cols` writes it
 * (supabase/sql/strands.sql): the common part, and strands' keys beside it.
 * Every key is always present, null when it has no value, so no key here is
 * optional. The summary (`manifest.ts`'s `summaryFor`) reads it as written.
 *
 * `team` is the team's counts and bar in coop, null in compete, whose summary
 * shows no progress mid-race; `nWinnerHints` is the hints a race was won on,
 * null in coop and with no winner.
 */
export type GSummaryData = SummaryData & {
  team: Omit<GFactsRaw, 'board'> | null
  nWinnerHints: number | null
}
