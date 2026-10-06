// cs-unmet

/**
 * bananagrams' types — every type this game exports, in one place, so the data
 * the surface slings around can be read side by side. The `G` says a type is
 * this game's and not the shell's (docs/code-conventions.md → A game's types).
 * A component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts stay
 * in `lib/gameData.fixture.ts`. The types that reach React — the board editor
 * and its input, built on an `Action` and a drag — are in `reactTypes.ts`.
 *
 * Two shapes carry the game: `GGameDataRaw` is `game_data` as the builder
 * wrote it (ids, every seat's letters), and `GGameData` is what `useGame` makes
 * of it for the surface (players, the seat rule applied). `GPlayerRaw` /
 * `GPlayer` and `GEventRaw` / `GEvent` are the same pair, one level down.
 *
 * A tile is a letter here, and the player acts on a cell or a hand slot, never
 * on a tile with an identity, so there is no `GTile` (plans/seat-view.md → A
 * tile is an instance the builder writes).
 */

import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/types'
import type { SetupOf, SetupRow } from '@/common/setup-form/types'

/**
 * How strictly the board's words are checked (`GSetupValues.word_check`):
 * `'off'` never, `'win'` on the winning peel, `'strict'` on every peel.
 */
export type GWordCheck = 'off' | 'win' | 'strict'

/**
 * bananagrams' per-game setup — the choices the start-game dialog collects,
 * persisted to `common.games.setup`, and validated server-side in
 * `bananagrams.create_game` (the canonical authority for what shapes are
 * accepted). A countdown that reaches 0 ends the race as a collective loss
 * (`bananagrams.submit_timeout`): time's up with nobody out.
 */
export type GSetupValues = {
  // How many tiles each player is dealt to start. 21 is the Bananagrams
  // 2–4-player default; 15 is a quicker game. The union mirrors the SQL check.
  hand_size: 15 | 21
  // How many tiles the bunch holds for this game, 1..144. The full set is 144;
  // a smaller bunch (a random subset) makes a shorter game. MUST be ≥
  // `playerCount × hand_size` so the deal is possible — `bunchSizeError`
  // enforces it in the dialog, and `create_game` re-checks.
  bunch_size: number
  // How strictly real words are enforced (`bananagrams._win_blockers`; the
  // offending cells are painted red). `'off'` is classic trust-the-friends
  // Bananagrams. Board GEOGRAPHY (one connected grid) is always required to
  // win, whatever this says: it is structural, not a matter of taste.
  word_check: GWordCheck
  // The obscurity ceiling for 2-letter words, 2..6 (`common.words` difficulty):
  // a thin, separate vocabulary, so it gets its own band, and band 1 is too
  // sparse to be fun. Meaningful only when `word_check` is not `'off'`.
  dict_2: number
  // The obscurity ceiling for longer words, 1..6. Meaningful only when
  // `word_check` is not `'off'`.
  dict_3plus: number
  // Where a dumped tile goes: `false` back into the bunch (it may be drawn
  // again); `true` to the out-of-play bag, so the bunch depletes and the game
  // ends sooner — though a dump tops up from the bag when the bunch is short.
  dump_to_bag: boolean
  // `none` and `countup` are display-only; a `countdown` that hits 0 ends the
  // game as a loss for everyone. Validated by `common._require_valid_timer`.
  timer: TimerMode
  // WHO IS PLAYING — a field like any other, and the only one that is not
  // part of the setup blob: `create_game` takes it as its own argument and
  // writes `common.game_players` rows from it.
  player_user_ids: Set<string>
}

/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds, and what
 *  `setupRows.ts` and `PlayArea` read back. */
export type GSetup = SetupOf<GSetupValues>

/**
 * bananagrams' `game_data`, as `bananagrams._rebuild_data_cols` writes it
 * (supabase/sql/bananagrams.sql → The page blobs): the common part, with the
 * two piles' counts, the log and each player's letters on top. What the page is
 * handed in `PlayAreaLoaderProps.gameData`; `useGame` turns it into `gd`. It
 * carries every seat's `tiles` and `board`; what a racer may see of a rival's
 * mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  // The draw pile's count. Its order never leaves the server.
  nBunchTiles: number
  // The out-of-play reserve's count.
  nBagTiles: number
  // bananagrams is compete only, so there is never a team.
  team: null
  // The log: every row, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * What the state line shows — "Tiles: You 14 · Bunch 60 · Bag 3". Decided once,
 * in `makeGameData`, so the line draws it and picks nothing.
 */
export type GStateLineData = {
  nTiles: number
  nBunchTiles: number
  nBagTiles: number
}

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // A peel dealt everyone a tile; a dump swapped one for three; going out
  // ended the game.
  kind: 'peel' | 'dump' | 'went_out'
  // The letter dumped; null on a peel and on going out.
  tile: string | null
  // How many tiles the act dealt its author: 1 on a peel, 3 on a dump, 0 on
  // going out.
  nDrawn: number
  at: string
}

/** A player as bananagrams' game_data shows them: the common player, with the
 *  letters they hold, the two counts, and their board as last saved. */
export type GPlayerRaw = PlayerRaw & {
  // Every letter they hold, hand and board together, as one lowercase string.
  tiles: string
  nTiles: number
  // The tiles not in their board's main block: the strip's number. A tile
  // pushed off to the side is no more placed than one in the hand.
  nUnplacedTiles: number
  board: GBoard
}

/**
 * A board as the server holds it: the 25×25 grid as one 625-character string,
 * row by row, "." an empty cell, a lowercase letter a tile. Mine is read once,
 * at mount, to seed the board editor; the engine of play is the editor's own
 * copy after that (`reactTypes.ts` → `GBoardEditor`).
 */
export type GBoard = {
  letters: string
}

/*
 * The shape of `gd` (`GGameData`): the game_data blob with its links turned
 * into players and the seat rule applied (plans/seat-view.md).
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
 *   nBunchTiles                       # the live draw pile's count; its order never leaves the server
 *   nBagTiles                         # the out-of-play reserve's count
 *   team: null                        # compete only
 *   turns: null                       # no turn order
 *   ending: {reason, detail, by, winner}   # null while playing; by and winner are players
 *   ended
 *   outcome                           # null until the game ends
 *   events: [event, …]
 *   players: [player, …]
 *   playersById
 *   me                                # same object as playersById[auth.user.id]
 *   stateLineData: {nTiles, nBunchTiles, nBagTiles}   # "Tiles: You 14 · Bunch 60 · Bag 3"
 *
 * player:
 *   the common player
 *   tiles                             # every letter they hold, hand and board together, one string; a rival's null mid-race
 *   nTiles                            # length(tiles); every seat, every time
 *   nUnplacedTiles                    # tiles not in their board's main block: the strip's number; every seat, every time
 *   board: {letters}                  # the 625-character grid as last saved, "." empty; mine is read once at mount; a rival's null mid-race
 *
 * event:
 *   id
 *   by                                # a player
 *   kind                              # peel / dump / went_out
 *   tile                              # the letter dumped; null otherwise
 *   nDrawn                            # 1 on a dealt peel, 3 on a dump, 0 on going out
 *   at
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players, a rival's letters
 * withheld mid-race, the setup rows built and the state line decided.
 * Read-only: `useGame` builds it and nothing else writes it.
 */
export type GGameData = Omit<GGameDataRaw, 'turns' | 'ending' | 'events' | 'players'> & {
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
  // The players by username, and the same objects keyed by id.
  players: GPlayer[]
  playersById: Record<string, GPlayer>
  // My entry in `playersById`: the same object. My own letters are always
  // mine to see.
  me: GPlayer & { tiles: string; board: GBoard }
  stateLineData: GStateLineData
}

/** A player as `gd` holds them: the blob's, with a rival's `tiles` and `board`
 *  null while the race is on. Their counts stay. */
export type GPlayer = Omit<GPlayerRaw, 'tiles' | 'board'> & {
  tiles: string | null
  board: GBoard | null
}

/** One row of the log, as `gd` holds it: the blob's row, with its player. */
export type GEvent = Omit<GEventRaw, 'userId'> & {
  // Who peeled, dumped or went out.
  by: GPlayer
}

/** A board cell, by its coordinates: x the column, y the row, both 0..24
 *  (docs/code-conventions.md → Grid coordinates). */
export type GCell = {
  x: number
  y: number
}

/** Where a dragged tile came from: a hand slot, or a board cell. */
export type GDragSource =
  | { kind: 'hand'; index: number }
  | { kind: 'board'; x: number; y: number }

/** The bounding box of the placed tiles, in cells. */
export type GExtent = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * What a **Check words** round trip found. `clean` and `empty` are separated on
 * purpose — an empty board has no blockers either, and telling someone their
 * blank grid checks out is worse than saying nothing.
 */
export type GCheckResult =
  | { kind: 'clean' }
  | { kind: 'empty' }
  | { kind: 'invalid'; count: number }
  | { kind: 'error'; message: string }

/**
 * Every answer bananagrams gives — the whole roster of what this game tells
 * anybody. `lib/answer.ts` says what each one reads as (docs/outcomes.md → How
 * a game does it).
 *
 * `peel`, `dump` and `went_out` are the log's rows; `peel_peer` is a rival's
 * peel, which dealt me a tile too. `illegal` is a peel the board check turned
 * away: `peel` writes no row for it. The three `check_` answers are what
 * **Check words** found. A not-ok is the server's sentence, not an answer.
 */
export type GAnswer =
  | { answerType: 'peel' }
  | { answerType: 'peel_peer' }
  | { answerType: 'dump'; tile: string }
  | { answerType: 'went_out' }
  | { answerType: 'illegal' }
  | { answerType: 'check_clean' }
  | { answerType: 'check_empty' }
  | { answerType: 'check_invalid'; nTiles: number }

/**
 * `common.games.summary_data`, as `bananagrams._rebuild_data_cols` writes it
 * (supabase/sql/bananagrams.sql): the common part, and the bunch's count beside
 * it. Every key is always present. The summary (`manifest.ts`'s `summaryFor`)
 * reads it as written; the race's winner is the common `ending.winner`.
 */
export type GSummaryData = SummaryData & {
  nBunchTiles: number
}
