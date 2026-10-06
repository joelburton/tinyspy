// cs-unmet

/**
 * waffle's types — every type this game exports, in one place, so the data
 * the surface slings around can be read side by side. The `G` says a type is
 * this game's and not the shell's (docs/code-conventions.md → A game's types).
 * A component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts
 * stay in the fixture file.
 *
 * Two shapes carry the game: `GGameDataRaw` is the two blobs as the builders
 * wrote them (ids), and `GGameData` is what `useGame` makes of it for the
 * surface (players, the seat rule applied). `GPlayer` / `GPlayerRaw` and
 * `GEvent` / `GEventRaw` are the same pair, one level down.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/types'
import type { CoopTurnSetup, SetupOf, SetupRow } from '@/common/setup-form/types'

/**
 * One cell of a board: its position as the tile's id ('0'…'24', the four holes
 * never a tile), the letter on it, and its color against the solution — `g`
 * right letter, right cell; `y` in that word, another cell; `x` not in it —
 * which `waffle._board_colors` decided.
 */
export type GTile = {
  id: string
  letter: string
  color: 'g' | 'y' | 'x'
}

/** A cell and its letter, with no color: the deal, the solution, a swap's two
 *  cells. */
export type GLetterTile = Pick<GTile, 'id' | 'letter'>

/**
 * waffle's `game_data` and `static_game_data`, as its builders write them
 * (supabase/sql/waffle.sql → The page blobs): the common part, with the
 * puzzle, the team, the log and waffle's facts about each player on top.
 * `useGame` merges the two blobs the page hands down and turns them into
 * `gd`.
 *
 * It carries everything: every player's rows in the log, and every seat's
 * board. What a racer may see of a rival mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  // The deal, frozen at create.
  puzzle: {
    // The board as dealt, the 21 tiles by position.
    dealtTiles: GLetterTile[]
    // The fewest swaps that solve it.
    parSwaps: number
    // The solved board, the 21 tiles by position. Null until the game ends.
    solution: GLetterTile[] | null
  }
  // What the team shares; null in compete, where there is no team.
  team: GTeam | null
  // The log: every swap, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * What the team shares in coop (plans/team-facts.md): the swaps summed over
 * every player's own. The budget they count against is `maxSwaps`, on every
 * player.
 */
export type GTeam = {
  nSwapsUsed: number
}

/**
 * What the state line shows — "Swaps 3/12 (9 left) · Par 10": the team's count
 * in coop, my own in compete, against the budget and par. Decided once, in
 * `makeGameData`, so the line draws it and picks nothing. Named for its
 * reader: this is what to SHOW there, not a fact other components read.
 */
export type GStateLineData = {
  nSwapsUsed: number
  maxSwaps: number
  parSwaps: number
}

/**
 * Every answer waffle gives about a move — the whole roster of what this game
 * tells anybody. `lib/answer.ts` says what each one reads as
 * (docs/outcomes.md → How a game does it).
 *
 * My own swap is not here: it says nothing, the board's tile colors being the
 * news, and nothing reads it. A refused swap is the server's `not-ok`, which
 * reads as its severity says.
 */
export type GAnswer =
  // A swap in the log — anyone's — which counted and which nothing judges.
  | { answerType: 'swapped_peer' }
  // A rival solved the waffle (compete).
  | { answerType: 'solved_peer' }
  // A rival ran out of swaps without solving it (compete).
  | { answerType: 'out_of_swaps_peer' }

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // The two cells swapped, each with the letter it held before the swap.
  swaps: [GLetterTile, GLetterTile]
  // The board's 25 colors after the swap, a `.` at each hole.
  colors: string
  at: string
}

/** A player as waffle's game_data shows them: the common player, with the
 *  budget, their own count and this seat's board. */
export type GPlayerRaw = PlayerRaw & {
  // The swap budget: the team's in coop, each player's own in compete. The
  // same on every player.
  maxSwaps: number
  // Swaps spent: this player's own, in every mode; the team's is `team`'s.
  nSwapsUsed: number
  // What this seat sees: one shared board in coop, each racer's own in
  // compete.
  board: GBoard
}

/*
 * The shape of `gd` (`GGameData`): the game_data blob with its links turned into
 * players and the seat rule applied (plans/seat-view.md).
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
 *     dealtTiles                             # [{id, letter}, …], the 21 cells by position
 *     parSwaps
 *     solution                               # [{id, letter}, …]; null until the game ends
 *   team: {nSwapsUsed}                       # null in compete
 *   turns: {holder}                          # null: no turn order; holder is a player
 *   ending: {reason, detail, by, winner}     # null while playing; by and winner are players
 *   ended
 *   outcome                                  # null until the game ends
 *   events: [event, …]                       # every swap; my rows only, mid-race
 *   players: [player, …]                     # seat order
 *   playersById
 *   me                                       # same object as playersById[auth.user.id]
 *   stateLineData: {nSwapsUsed, maxSwaps, parSwaps}   # the team's in coop, mine in compete
 *
 * player:
 *   the common player
 *   maxSwaps                                 # the budget: the same on every player
 *   nSwapsUsed                               # own, in every mode
 *   board: {tiles}                           # what this seat sees; null for a rival mid-race
 *
 * tile:                                      # GTile
 *   id                                       # the cell's position, as text: '0'…'24', holes left out
 *   letter
 *   color                                    # g / y / x
 *
 * event:
 *   id
 *   by
 *   swaps: [{id, letter}, {id, letter}]      # the two cells, each with the letter it held before
 *   colors                                   # the board's colors after the swap
 *   at
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players, the setup rows
 * built, and the seat rule applied: what I may not see yet is not here.
 * Read-only: `useGame` builds it and nothing else writes it.
 */
export type GGameData = Omit<GGameDataRaw, 'turns' | 'ending' | 'events' | 'players'> & {
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
  // My entry in `playersById`: the same object. My own board is always mine
  // to see.
  me: GPlayer & { board: GBoard }
  // What the state line shows: the team's count in coop, my own in compete.
  stateLineData: GStateLineData
}

/** One player of this game, as `gd` holds them: the blob's player, with the
 *  board withheld — null — for a rival mid-race. */
export type GPlayer = Omit<GPlayerRaw, 'board'> & {
  board: GBoard | null
}

/** What one seat sees: the 21 tiles, by position. */
export type GBoard = {
  tiles: GTile[]
}

/** One row of the log, as `gd` holds it: the blob's row, with its player. */
export type GEvent = Omit<GEventRaw, 'userId'> & {
  // Who swapped.
  by: GPlayer
}

/**
 * Every command the page offers, bound (`hooks/useActionsAndMenu.ts`): the info
 * column's action row places them and the game menu lists them.
 */
export type GActions = {
  // Each key is spelled as its action's id (`act-reveal` → `actReveal`), so a
  // grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Show the solution — or put it away again, bringing back the board the
  // players finished with. A local display toggle, no RPC.
  actReveal: Action
  // Restart THIS board from scratch.
  actRestart: Action
  // Start a fresh follow-up game — same setup, new board and id.
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
 * The turn-history view (`hooks/useHistoryView.ts`): which past swap is open on
 * the board, and that swap replayed.
 */
export type GHistoryView = {
  // A past swap is open on the board (`viewedEventId` is set): the board takes
  // no swap while it is.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a swap — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The board after the viewed swap, or null when live.
  tiles: GTile[] | null
  // The two tiles the viewed swap moved — ring them; empty when live.
  litTileIds: ReadonlySet<string>
  // The banner's words for the viewed swap, or null when live.
  label: string | null
  // Whose board is on screen, when it is not mine — only a compete game's end
  // opens a rival's.
  actor: GPlayer | undefined
}

/**
 * waffle's per-game setup — collected by the start-game dialog, persisted to
 * `common.games.setup`, and validated server-side by `waffle.create_game` (the
 * authority for what's accepted).
 */
export type GSetupValues = CoopTurnSetup & {
  // Vocabulary tier (1–6) — the recognizability band the six words are drawn
  // from: a tier-N puzzle uses words of band ≤ N with its hardest word at
  // exactly N. The board is generated on demand for the chosen band (the
  // `waffle-build-board` edge function). The dialog offers the full 1–6 via
  // the shared `DictBandField`.
  difficulty: number
  // Slack added to the puzzle's par to get the swap budget
  // (`max_swaps = par + extra_swaps`). Fewer extra swaps = harder. Server
  // bounds it to 0..15; the form offers a friendly few.
  extra_swaps: number
  // Timer mode. `none` / `countup` are purely informational; a `countdown`
  // ends the game when it expires, via the shared `waffle.submit_timeout` RPC.
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
 * `common.games.summary_data`, as `waffle._rebuild_data_cols` writes it
 * (supabase/sql/waffle.sql): the common part, and waffle's keys beside it.
 * Every key is always present, null when it has no value, so no key here is
 * optional. The summary (`manifest.ts`'s `summaryFor`) reads it as written, so
 * there is no polished pair and no `Raw`; the play surface reads `game_data`
 * instead (`GGameDataRaw`).
 *
 * `team` is the same group `game_data` carries: the team's count in coop, null
 * in compete, whose summary shows no progress; the winner's count is
 * compete's, null until the race is won and always null in coop (the winner is
 * the common `ending.winner`). `band` is the setup's dictionary band.
 */
export type GSummaryData = SummaryData & {
  team: GTeam | null
  maxSwaps: number
  band: number
  nWinnerSwaps: number | null
}
