// cs-unmet

/**
 * stackdown's types — every type this game exports, in one place, so the data
 * the surface slings around can be read side by side. The `G` says a type is
 * this game's and not the shell's (docs/code-conventions.md → A game's types).
 * A component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts stay
 * in the fixture file.
 *
 * Two shapes carry the game: `GGameDataRaw` is `game_data` as the builder
 * wrote it (ids), and `GGameData` is what `useGame` makes of it for the
 * surface (players, the seat rule applied). `GPlayer` / `GPlayerRaw` and
 * `GEvent` / `GEventRaw` are the same pair, one level down.
 */

import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/types'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { SetupOf, SetupRow } from '@/common/setup-form/types'

/**
 * One tile of the stack: its tile number as text, the letter on it, and its
 * place — `x` and `y` on the integer grid, `z` the layer (0 is the base). A
 * tile covers another when it sits higher and within one cell of it
 * (docs/games/stackdown.md → Covering rule); the page works out which are
 * exposed from these.
 */
export type GTile = {
  id: string
  letter: string
  x: number
  y: number
  z: number
}

/**
 * stackdown's `game_data`, as `stackdown._rebuild_data_cols` writes it
 * (supabase/sql/stackdown.sql → The page blobs): the common part, with the
 * puzzle, the team, the log and stackdown's facts about each player on top.
 * What the page is handed in `PlayAreaLoaderProps.gameData`; `useGame` turns
 * it into `gd`.
 *
 * It carries everything: every player's rows in the log, and every seat's
 * stack. What a racer may see of a rival mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  // The stack, frozen at create.
  puzzle: {
    // All 30 tiles, by tile number.
    tiles: GTile[]
    // How many words clear the stack: six, on every board.
    nReqdWords: number
    // The six words, in clearing order. Null until the game ends.
    solution: string[] | null
  }
  // What the team shares; null in compete, where there is no team.
  team: GTeam | null
  // The log: every row, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * What the team shares in coop (plans/team-facts.md): the players' own counts,
 * summed.
 */
export type GTeam = {
  nFoundWords: number
  nHintsUsed: number
  nSpoilersUsed: number
}

/**
 * What the state line shows — "2 / 6 words cleared · 1 hint · 0 spoilers used":
 * the team's counts in coop, my own in compete. Decided once, in
 * `makeGameData`, so the line draws it and picks nothing. Named for its
 * reader: this is what to SHOW there, not a fact other components read.
 */
export type GStateLineData = {
  nFoundWords: number
  nReqdWords: number
  nHintsUsed: number
  nSpoilersUsed: number
}

/**
 * What a turn was — the four things a `stackdown.events` row can record.
 *
 * The words are the server's own, in both the places it says them: `accepted` /
 * `invalid` are `submit_word`'s `result`, and `hint` / `spoiler` are the row's
 * `kind` column. Reusing them means the row, the envelope and the outcome table
 * (`lib/answer.ts`) never need a translation step between them.
 */
export type GAnswer = 'accepted' | 'invalid' | 'hint' | 'spoiler'

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player and `tileIds` into tiles (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  kind: 'word' | 'hint' | 'spoiler'
  // A played word, or the word a spoiler handed over; null for a hint.
  word: string | null
  // A hint's clue, which points at the next word without naming it; null
  // otherwise.
  clue: string | null
  // A played word's five tiles, in pick order; empty for a hint or a spoiler.
  tileIds: string[]
  // Whether a played word was the next solution word; null for a hint or a
  // spoiler.
  valid: boolean | null
  // Whether it spent the player's go: a word and a spoiler do, a hint does not.
  tookTurn: boolean
  at: string
}

/** A player as stackdown's game_data shows them: the common player, with
 *  their own counts and this seat's stack. */
export type GPlayerRaw = PlayerRaw & {
  // This player's own, in every mode; the team's are `team`'s.
  nFoundWords: number
  nHintsUsed: number
  nSpoilersUsed: number
  // What this seat sees: the tiles still on its stack — the one shared stack
  // in coop, each racer's own in compete.
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
 *   oneBoard
 *   title
 *   setup
 *   setupRows
 *   puzzle:                                  # frozen at create
 *     tiles: [tile, …]                       # all 30, with their places
 *     tilesById
 *     nReqdWords                             # 6
 *     solution: [word, …]                    # null until the game ends
 *   team: {nFoundWords, nHintsUsed, nSpoilersUsed}   # the players' own, summed; null in compete
 *   turns: {holder}                          # null: no turn order; holder is a player
 *   ending: {reason, detail, by, winner}     # null while playing; by and winner are players
 *   ended
 *   outcome                                  # null until the game ends
 *   events: [event, …]                       # my rows only, mid-race
 *   players: [player, …]                     # seat order
 *   playersById
 *   me                                       # same object as playersById[auth.user.id]
 *   stateLineData: {nFoundWords, nReqdWords, nHintsUsed, nSpoilersUsed}   # the team's in coop, mine in compete
 *
 * player:
 *   the common player
 *   nFoundWords                              # own, in every mode
 *   nHintsUsed                               # own
 *   nSpoilersUsed                            # own
 *   board: {tiles}                           # this seat's stack, the shared one in coop; null for a rival mid-race
 *
 * tile:                                      # GTile
 *   id                                       # the tile number as text
 *   letter
 *   x
 *   y
 *   z
 *
 * event:
 *   id
 *   by
 *   kind                                     # word / hint / spoiler
 *   word                                     # a played word or a spoiler's; null for a hint
 *   clue                                     # a hint's; null otherwise
 *   tiles: [tile, …]                         # a word's five, in pick order; empty otherwise
 *   valid                                    # null for a hint or a spoiler
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
export type GGameData = Omit<GGameDataRaw, 'puzzle' | 'turns' | 'ending' | 'events' | 'players'> & {
  puzzle: GGameDataRaw['puzzle'] & {
    // The same tiles, keyed by id.
    tilesById: Record<string, GTile>
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
  // My entry in `playersById`: the same object. My own stack is always mine
  // to see.
  me: GPlayer & { board: GBoard }
  // What the state line shows: the team's counts in coop, my own in compete.
  stateLineData: GStateLineData
}

/** One player of this game, as `gd` holds them: the blob's player, with the
 *  stack withheld — null — for a rival mid-race. */
export type GPlayer = Omit<GPlayerRaw, 'board'> & {
  board: GBoard | null
}

/** What one seat sees: the tiles still on its stack, by tile number. */
export type GBoard = {
  tiles: GTile[]
}

/** One row of the log, as `gd` holds it: the blob's row, with its player and
 *  its tiles. */
export type GEvent = Omit<GEventRaw, 'userId' | 'tileIds'> & {
  // Who did it.
  by: GPlayer
  // A played word's five tiles, in pick order; empty otherwise.
  tiles: GTile[]
}

/**
 * THIS player's answer, shown in the entry's slots for a beat once the word is
 * submitted — the outcome `lib/answer.ts` gave the submission, which is the one
 * the log row and the pill are wearing for it too. The letters are passed
 * rather than tile ids because an accepted word's tiles have already left the
 * board.
 *
 * A teammate's word is NOT shown here. The entry row is this player's
 * workspace, and their answer is marked where it happened — on the board tiles
 * their word used.
 */
export type GWordFlash = { letters: string[]; outcome: Outcome }

/**
 * stackdown's per-game setup — collected by the start-game dialog, persisted to
 * `common.games.setup`, and validated server-side by `stackdown.create_game`
 * (the authority for what's accepted).
 *
 * Two knobs: the timer, and the word-difficulty `band`. The board is claimed at
 * random from the pre-generated library FILTERED to the chosen band
 * (create_game does the filtering + validation).
 */
export type GSetupValues = {
  // Timer mode. `none` / `countup` are purely informational; a `countdown`
  // ends the game when it expires (coop → everyone loses, compete → no
  // winner), via the shared `stackdown.submit_timeout` RPC.
  timer: TimerMode
  // Word-difficulty band — a `common.words.difficulty` level. `1` = the common
  // everyday set; `2` = the next tier (a band-2 board is made entirely of
  // difficulty-2 words, no band-1 mixed in). The form offers 1..2 today
  // (that's what the board library holds); create_game accepts any 1..6 it
  // has boards for.
  band: number
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
 * `common.games.summary_data`, as `stackdown._rebuild_data_cols` writes it
 * (supabase/sql/stackdown.sql): the common part, and stackdown's keys beside
 * it. Every key is always present, null when it has no value, so no key here is
 * optional. The summary (`manifest.ts`'s `summaryFor`) reads it as written, so
 * there is no polished pair and no `Raw`; the play surface reads `game_data`
 * instead (`GGameDataRaw`).
 *
 * `team` is the same group `game_data` carries, null in compete, whose summary
 * shows no progress; the winner is the common `ending.winner`. `band` is the
 * setup's dictionary band.
 */
export type GSummaryData = SummaryData & {
  team: GTeam | null
  nReqdWords: number
  band: number
}
