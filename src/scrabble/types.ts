// cs-unmet

/**
 * scrabble's types — every type this game exports, in one place, so the data
 * the surface slings around can be read side by side. The `G` says a type is
 * this game's and not the shell's (docs/code-conventions.md → A game's types).
 * A component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts stay
 * in the fixture file.
 *
 * Two shapes carry the game: `GGameDataRaw` is `game_data` as the builder
 * wrote it (ids, the board as one string), and `GGameData` is what `useGame`
 * makes of it for the surface (players, the board's cells keyed by id, the
 * seat rule applied). `GPlayerRaw` / `GPlayer` and `GEventRaw` / `GEvent` are
 * the same pair, one level down.
 *
 * Loaded by both scrabble edge functions (through `lib/`), so every import is
 * relative and ends in `.ts` (src/guards/edgeFunctionImports.test.ts).
 */

import type { GameDataRaw, PlayerRaw } from '../common/game-page/gameData.ts'
import type { SummaryData } from '../common/manifest/summaryData.ts'
import type { TimerMode } from '../common/manifest/types.ts'
import type { CoopTurnSetup, SetupOf, SetupRow } from '../common/setup-form/types.ts'

/**
 * One cell of the board — a spot a tile is placed onto (docs/naming.md → `cell`
 * vs `tile`): id `"x,y"` (x the column, y the row), and the tile on it, null
 * while it is empty.
 */
export type GCell = {
  id: string
  tile: GTile | null
}

/**
 * A tile placed on the board: its letter in the data's case, and whether it is
 * a blank played as that letter. Its id is its cell's — a tile on the board is
 * named by where it sits. A word's placements in the log are tiles too.
 */
export type GTile = {
  id: string
  letter: string
  blank: boolean
}

/** One tile a player is placing: its cell, the letter it plays as (a
 *  blank's declared letter), and whether it came from a blank, which scores 0
 *  and takes a `?` off the rack. */
export type GPlacement = {
  x: number
  y: number
  letter: string
  blank: boolean
}

/** One cell of a word the play forms, and whether this play placed it. */
export type GWordCell = {
  x: number
  y: number
  letter: string
  blank: boolean
  isNew: boolean
}

/** A word the play forms: its cells, its letters and its score. */
export type GFormedWord = {
  word: string
  score: number
  cells: GWordCell[]
}

/** What a premium cell multiplies: a letter's value or the word's. */
export type GPremiumType = 'none' | 'DL' | 'TL' | 'DW' | 'TW'

/** The game's two dictionary bands, by word length (`dict_2` / `dict_3plus`,
 *  both 1..6). */
export type GBands = {
  dict2: number
  dict3plus: number
}

/** A legal move the suggester ranked: the play, what it forms and scores, and
 *  what the rack it keeps is worth. */
export type GRankedMove = {
  placements: GPlacement[]
  // What the board shows.
  words: GFormedWord[]
  // What the game will award, the bingo included.
  score: number
  // The worth of the tiles kept.
  leave: number
  // `score + leave`: the sort key.
  equity: number
}

/** A bot's strength, weakest to strongest; `lib/policy.ts`'s `LEVELS` says what
 *  each plays like. */
export type GAiLevel = 'beginner' | 'casual' | 'intermediate' | 'strong' | 'best'

/**
 * The levers that make a bot play worse. Each is independent; a level is a
 * combination of them (`lib/policy.ts`'s `LEVELS`). Three are the ranking's own
 * levers; `bingoMissProb` and `equityNoise` model not seeing the best move.
 */
export type GStrengthKnobs = {
  // Play only words whose difficulty is at most this (1..6); undefined is
  // every word. The game's dictionary stays the same at every level; only the
  // bot's willingness to play a word changes.
  vocabCap?: number
  // Aim at this fraction of the best equity instead of the best; undefined
  // takes the best.
  scoreFraction?: number
  // Count the kept rack's worth when ranking. Off, the bot is a greedy scorer
  // whose rack slowly degrades.
  useLeave: boolean
  // The chance of not seeing a chosen bingo and playing the best non-bingo.
  bingoMissProb: number
  // The spread of the noise added to each move's equity before the pick; 0
  // always picks the best.
  equityNoise: number
}

/** One self-played coop game, as `playSelfGame` reports it to the tuning
 *  script. */
export type GGameResult = {
  // The words' score, with no leftover subtraction.
  score: number
  turns: number
  bingos: number
  exchanges: number
  // The tiles never played: the rack and the bag at the end.
  tilesLeft: number
  // Each word's score, in order.
  turnScores: number[]
  // The kept rack's worth after each turn.
  leaveTrajectory: number[]
}

/**
 * scrabble's `game_data`, as `scrabble._rebuild_data_cols` writes it
 * (supabase/sql/scrabble.sql → The page blobs): the common part, with the
 * version, the bag's count, the board, the team, the log and each player's
 * score and rack on top. What the page is handed in
 * `PlayAreaLoaderProps.gameData`; `useGame` turns it into `gd`. It carries
 * every rack; what a racer may see of a rival's mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  // The move counter every move sends back.
  version: number
  // The tiles still in the bag. The bag's order never leaves the server.
  nBagTiles: number
  // The one board, shared in both modes: 225 characters, row by row, "." an
  // empty cell, "c" a C tile, "C" a blank played as C.
  board: {
    letters: string
  }
  // What the team shares; null in compete, where there is no team.
  team: GTeam | null
  // The log: every row, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/** What the team shares in coop (plans/team-facts.md): the one rack, and the
 *  score — the players' sum, less what the rack held at the end. */
export type GTeam = {
  rack: string[]
  score: number
  nRackTiles: number
}

/**
 * What the state line shows — "Team score: 152 · 7 in bag" in coop; compete's
 * leads with the turn instead, and its score is null. Decided once, in
 * `makeGameData`, so the line draws it and picks nothing.
 */
export type GStateLineData = {
  score: number | null
  nBagTiles: number
}

/**
 * Every answer scrabble gives about a turn — the whole roster of what this game
 * tells anybody. `lib/answer.ts` says what each one reads as
 * (docs/outcomes.md → How a game does it).
 *
 * `word`, `exchange` and `pass` are a turn I took; the `_peer` three are an
 * opponent's, in the header. `invalid` is the dictionary's refusal:
 * `_commit_word` writes no row for it, so it never reaches the log. `leftovers`
 * and `went_out` are the rows an ending writes, read by the log alone. A play
 * whose shape the board turns away is not an answer — it never leaves the
 * client, and its pill is its only surface.
 */
export type GAnswer =
  | { answerType: 'word'; words: string[]; score: number; bingo: boolean }
  | { answerType: 'word_peer'; words: string[]; score: number }
  | { answerType: 'invalid'; badWords: string[] }
  | { answerType: 'exchange'; nTiles: number }
  | { answerType: 'exchange_peer'; nTiles: number }
  | { answerType: 'pass' }
  | { answerType: 'pass_peer' }
  | { answerType: 'leftovers' }
  | { answerType: 'went_out' }

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player and the placements into tiles (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // A `leftovers` row is a rack's value lost at the end (negative); a
  // `went_out` row is the bonus for emptying the rack (positive).
  kind: 'word' | 'exchange' | 'pass' | 'leftovers' | 'went_out'
  // A word's tiles, "x,y:c" under the board's case rule; null otherwise.
  placements: string[] | null
  words: string[] | null
  score: number | null
  // The tiles an exchange swapped, or the tiles a `leftovers` row's rack still
  // held; null otherwise.
  nTiles: number | null
  // A word, an exchange or a pass takes the player's go; the end's rows do not.
  tookTurn: boolean
  at: string
}

/** A player as scrabble's game_data shows them: the common player, with their
 *  own score and, in compete, their rack. */
export type GPlayerRaw = PlayerRaw & {
  // A bot's strength in this game; null for a person.
  aiLevel: GAiLevel | null
  // Own, in every mode; the team's is `team`'s.
  score: number
  // Compete: the player's own. Null in coop, where the rack is the team's.
  rack: string[] | null
  // Compete; null in coop.
  nRackTiles: number | null
}

/*
 * The shape of `gd` (`GGameData`): the game_data blob with its links turned
 * into players, the board's string into cells keyed by id, and the seat rule
 * applied (plans/seat-view.md).
 *
 * gd:
 *   id
 *   gametype
 *   brand
 *   club: {handle}
 *   mode
 *   coop
 *   compete
 *   oneBoard
 *   title
 *   setup
 *   setupRows
 *   version                                  # the move counter every move sends back
 *   nBagTiles
 *   board:                                   # the one board, shared in both modes
 *     cells: [cell, …]                       # 225, row by row
 *     cellsById
 *   team: {rack, score, nRackTiles}          # null in compete
 *   turns: {holder}                          # null: no turn order; holder is a player
 *   ending: {reason, detail, by, winner}     # null while playing; by and winner are players
 *   ended
 *   outcome                                  # null until the game ends
 *   events: [event, …]                       # every row, every player's
 *   players: [player, …]                     # seat order
 *   playersById
 *   me                                       # same object as playersById[auth.user.id]
 *   stateLineData: {score, nBagTiles}        # score: the team's in coop; null in compete
 *
 * player:
 *   the common player
 *   aiLevel                                  # a bot's strength in this game; null for a person
 *   score                                    # own, in every mode
 *   rack                                     # compete: own; a rival's null mid-race; coop: null
 *   nRackTiles                               # compete; null in coop
 *
 * cell:                                      # GCell: a spot a tile is placed onto
 *   id                                       # "x,y"
 *   tile                                     # null while the cell is empty
 *
 * tile:                                      # GTile: a tile placed on a cell
 *   id                                       # its cell's
 *   letter
 *   blank
 *
 * event:
 *   id
 *   by
 *   kind                                     # word / exchange / pass / leftovers / went_out
 *   placements: [tile, …]                    # a word's; null otherwise
 *   words
 *   score
 *   nTiles
 *   tookTurn
 *   at
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players, the board's string
 * into cells keyed by id, a rival's rack withheld mid-race, the setup rows
 * built and the state line decided. Read-only: `useGame` builds it and nothing
 * else writes it.
 */
export type GGameData = Omit<GGameDataRaw, 'board' | 'turns' | 'ending' | 'events' | 'players'> & {
  board: {
    // The 225 cells, row by row: a cell's index is `y * 15 + x`.
    cells: GCell[]
    // The same cells, keyed by id.
    cellsById: Record<string, GCell>
  }
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  turns: { holder: GPlayer } | null
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
  // My entry in `playersById`: the same object.
  me: GPlayer
  stateLineData: GStateLineData
}

/** A player as `gd` holds them: the blob's, with a rival's rack null while
 *  the race is on. */
export type GPlayer = GPlayerRaw

export type GEvent = Omit<GEventRaw, 'userId' | 'placements'> & {
  // Who did it.
  by: GPlayer
  placements: GTile[] | null
}

/** A tile staged on the board this turn, tied to the rack slot it came from. */
export type GStagedTile = GPlacement & {
  rackIdx: number
}

/** The rack slots a move of mine took — played or swapped — and how long the
 *  rack was before it: what the next rack order is rebuilt from. */
export type GMoveSlots = {
  removed: Set<number>
  oldLen: number
}

/** A tile a player has placed this turn but not yet committed. */
export type GTentative = {
  letter: string
  blank: boolean
}

/** The AI suggest-a-move box's state (owned by PlayArea, rendered by InfoCol).
 *  `idle` renders NOTHING — the box claims no space until there's something
 *  to show (a deliberate exception to the pre-claim-space rule; see the render
 *  site). `ready` remembers the board `version` the moves were computed
 *  against, so PlayArea can derive staleness at render (a teammate may have
 *  played). */
export type GSuggestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; moves: GRankedMove[]; version: number }
  | { status: 'error'; message: string }

/**
 * What read-only overlay is open on the board — the shared history viewer's id,
 * widened for scrabble to carry BOTH kinds of read-only board it can show:
 *   - **`turn`** — a past turn's committed board (the history viewer).
 *   - **`peerPreview`** — a coop teammate's in-progress move (their staged tiles
 *     laid on the live board), received over Broadcast (see useSharedMove).
 * Both wear the same viewer chrome (frame + banner + frozen input) and the same
 * exits (click / keystroke / ✕ / a new move) — so they ride one
 * `useHistoryViewer<GHistoryTarget>`, and BoardCol switches on `kind` to render.
 */
export type GHistoryTarget =
  | { kind: 'turn'; id: number }
  | { kind: 'peerPreview'; placements: GPlacement[]; sharerId: string; words: string[]; score: number }

/** A teammate's shown move, as the board viewer draws it: their staged tiles
 *  over my live board. */
export type GPeerMove = {
  sharer: GPlayer
  placements: GPlacement[]
  words: string[]
  score: number
}

/**
 * What the board viewer has open — a past turn, a teammate's shown move, or
 * nothing — and the board it draws (`useHistoryView`). Both overlays freeze
 * the move and wear the same chrome; a new move, a click or a key exits
 * either.
 */
export type GHistoryView = {
  // A past turn or a shown move is open: the board takes no move while it is.
  isViewing: boolean
  // What is open, read at event time by the board's drag handler, which is
  // registered once.
  targetRef: { readonly current: GHistoryTarget | null }
  // The log row open on the board (`events.id`), or null.
  viewedEventId: number | null
  // A teammate's shown move, or null.
  peerMove: GPeerMove | null
  // Open a turn — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Open a teammate's shown move, unless my board has moved on since.
  showPeerMove: (payload: GSharedMovePayload) => void
  // Back to the live board.
  exit: () => void
  // The board just after the viewed turn; null when live, and for a shown
  // move, which is drawn on the live board.
  cells: GCell[] | null
  // The viewed turn's tiles, or the shown move's, ringed; empty when live.
  litCellIds: string[]
  // The banner's words for a viewed turn ("#1 moth: +10 APPLE"); null when
  // live, and for a shown move, whose banner names the sharer with their dot.
  label: string | null
}

/**
 * A coop "show a move" broadcast: the sharer's staged tiles, so a teammate can
 * see it read-only on their own live board.
 */
export type GSharedMovePayload = {
  // The sharer's staged tiles, not yet committed.
  placements: GPlacement[]
  sharerId: string
  // The sharer's board `version` when they shared; a receiver whose board has
  // moved on since drops it.
  baseVersion: number
  // The play's words and score, for the banner; empty and 0 for a play that
  // is not yet legal.
  words: string[]
  score: number
}

export type GSetupValues = CoopTurnSetup & {
  // The dictionary bands that gate a word, by its length (both 1..6,
  // `common.words.difficulty`): 2-letter words are a thin vocabulary of their
  // own. They ARE the acceptance bar — a lower band makes a stricter game. The
  // server bounds them.
  dict_2: number
  dict_3plus: number
  // A `countdown` ends the game when it runs out (`scrabble.submit_timeout`).
  timer: TimerMode
  // Compete only: this many bots (0..3), all at `ai_level`. Ignored in coop.
  ai_count: number
  ai_level: GAiLevel
  // WHO IS PLAYING — a field like any other, and the only one that is not
  // part of the setup blob: `create_game` takes it as its own argument and
  // writes `common.game_players` rows from it.
  player_user_ids: Set<string>
}

/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds. */
export type GSetup = SetupOf<GSetupValues>

/**
 * `common.games.summary_data`, as `scrabble._rebuild_data_cols` writes it
 * (supabase/sql/scrabble.sql): the common part, and scrabble's keys beside it.
 * Every key is always present, null when it has no value. The summary
 * (`manifest.ts`'s `summaryFor`) reads it as written.
 *
 * `team` is the team's score, null in compete. `winnerIds` is every player
 * ranked first — a compete tie shares rank 1 — and `winnerScore` the score
 * they share; both null in coop, or with no winner.
 */
export type GSummaryData = SummaryData & {
  team: { score: number } | null
  nBagTiles: number
  winnerIds: string[] | null
  winnerScore: number | null
}
