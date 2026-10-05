// cs-unmet

/**
 * codenamesduet's types — every type this game exports, in one place, so the
 * data the surface slings around can be read side by side. The `G` says a type
 * is this game's and not the shell's (docs/code-conventions.md → A game's
 * types). A component's props stay with the component; a type one file uses
 * stays in that file; the printer's model stays in `pdf/`; the test fixtures'
 * facts stay in the fixture file.
 *
 * Two shapes carry the game: `GGameDataRaw` is `game_data` as the builder
 * wrote it (ids, records), and `GGameData` is what `useGame` makes of it for
 * the surface (players, maps, links, the seat rule applied). `GPlayer`,
 * `GTile`, `GPuzzleTile` and `GEvent` each have their `Raw` twin, one level
 * down.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/types'
import type { SetupOf, SetupRow } from '@/common/setup-form/types'

/**
 * The letter a tile has on one player's key card: `G` an agent (one of the 15
 * to find), `N` a bystander, `A` the assassin. Stored as the 25-letter
 * `key_card_a` / `key_card_b` columns on `codenamesduet.games`.
 */
export type GKey = 'G' | 'N' | 'A'

/**
 * codenamesduet's `game_data`, as `codenamesduet._rebuild_data_cols` writes it
 * (supabase/sql/codenamesduet.sql → The page blobs): the common part, with the
 * deal, the team and its table, the turn, the log and each player's two facts
 * on top. It carries both players' keys; hiding my partner's until the game
 * ends is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'turns' | 'players'> & {
  setup: GSetup
  puzzle: { tiles: GPuzzleTileRaw[] }
  team: GTeam & { board: { tiles: GTileRaw[] } }
  turns: GTurnsRaw
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * One of the 25 tiles as dealt, which never changes: its word, and each
 * player's key for it, by user id.
 */
export type GPuzzleTileRaw = {
  // The position on the board, 0..24, as text: the tile's identity.
  id: string
  word: string
  key: Record<string, GKey>
}

/** A puzzle tile as `gd` holds it: my partner's key is null until the end. */
export type GPuzzleTile = Omit<GPuzzleTileRaw, 'key'> & {
  key: Record<string, GKey | null>
}

/**
 * A tile on the table as the builder wrote it: what it shows and who to point
 * at, and who may still guess it — both decided by the rules in SQL, so the
 * page reads them and decides neither.
 */
export type GTileRaw = {
  id: string
  // Null until anyone guesses it.
  revealed: { as: GKey; arrows: string[] } | null
  // The user ids of the players who may still guess it.
  guessableBy: string[]
}

/**
 * A tile on the table as `gd` holds it: linked to its puzzle tile, its arrows
 * as players, and `guessable` for me.
 */
export type GTile = {
  id: string
  puzzleTile: GPuzzleTile
  revealed: GReveal | null
  // May I guess it: the builder's `guessableBy`, for me.
  guessable: boolean
}

/**
 * What a tile shows, the same for both players — `G` once an agent is
 * contacted, `A` the assassin, `N` once either player turns it over as a
 * bystander — and the players to point an arrow at.
 */
export type GReveal = {
  as: GKey
  arrows: ReadonlySet<GPlayer>
}

/**
 * What the pair shares (plans/team-facts.md). Duet is always a team of two, so
 * this is never null.
 */
export type GTeam = {
  nFoundAgents: number
  // Turns over, and the turn the game ended on when anything was played in it;
  // never past the budget.
  nTurnsUsed: number
  maxTurns: number
  // The budget is spent; stays true once a game that reached it has ended.
  suddenDeath: boolean
}

/** The turn: the common holder, with its number and its clue. */
export type GTurnsRaw = {
  // Null in sudden death while both players have words: either may guess.
  holder: string | null
  // The turn being played, from 1.
  num: number
  // Given until the guessing ends; null while it is being written.
  currClue: { word: string; count: number; fromAi: boolean; userId: string } | null
}

/** The turn as `gd` holds it, its user ids as players. */
export type GTurns = {
  holder: GPlayer | null
  num: number
  currClue: { word: string; count: number; fromAi: boolean; by: GPlayer } | null
}

/** One row of the log, as the builder wrote it. */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  kind: 'clue' | 'guess' | 'pass' | 'hint'
  turnNum: number
  // This event spent the turn: a pass, or a guess that ended it.
  tookTurn: boolean
  at: string
  // A clue's; null on every other kind.
  clueWord: string | null
  clueCount: number | null
  clueFromAi: boolean | null
  // A guess's: the tile and what it turned over as; null on every other kind.
  tileId: string | null
  result: GKey | null
}

/** One row of the log as `gd` holds it, by a player. */
export type GEvent = Omit<GEventRaw, 'userId'> & {
  by: GPlayer
}

/** A clue, its payload present (`lib/events.ts → cluesOf`). */
export type GClueEvent = GEvent & {
  kind: 'clue'
  clueWord: string
  clueCount: number
  clueFromAi: boolean
}

/** A guess, its payload present, with the word on its tile
 *  (`lib/events.ts → guessesOf`). */
export type GGuessEvent = GEvent & {
  kind: 'guess'
  tileId: string
  result: GKey
  word: string
}

/** A player as codenamesduet's game_data shows them: the common player, with
 *  the clue seat and whether their agents are all found. */
export type GPlayerRaw = PlayerRaw & {
  // Holds the clue seat this turn; false for both in sudden death and once the
  // game has ended.
  clueGiver: boolean
  // Every agent on this player's key is contacted: their partner has nothing
  // left to guess.
  allAgentsFound: boolean
}

export type GPlayer = GPlayerRaw

/**
 * What the state line shows: the agents found and the turns used against the
 * budget, or sudden death once it is spent. Decided once, in `makeGameData`.
 */
export type GStateLineData = {
  nFoundAgents: number
  nAgents: number
  nTurnsUsed: number
  maxTurns: number
  suddenDeath: boolean
}

/*
 * The shape of `gd` (`GGameData`): the game_data blob with its links turned
 * into players and tiles, and the seat rule applied (plans/seat-view.md).
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
 *   puzzle:
 *     tiles: [puzzleTile, …]                 # the 25 as dealt, by position
 *     tilesById
 *   team
 *     nFoundAgents
 *     nTurnsUsed
 *     maxTurns
 *     suddenDeath
 *     board: {tiles, tilesById}              # the table as it stands
 *   turns
 *     holder                                 # null in sudden death with words on both sides
 *     num                                    # the turn being played, from 1
 *     currClue: {word, count, fromAi, by}    # given until the guessing ends; null while it is being written
 *   ending: {reason, detail, by, winner}
 *   ended
 *   outcome
 *   events: [event, …]                       # every clue, guess, pass and hint, in order
 *   players: [player, …]                     # seat order: A, then B
 *   playersById
 *   me
 *   partner                                  # the other player; Duet always has two
 *   stateLineData: {nFoundAgents, nAgents, nTurnsUsed, maxTurns, suddenDeath}
 *
 * player:
 *   the common player                        # seat 0 is A, who gives the first clue
 *   clueGiver                                # gives this turn's clue
 *   allAgentsFound                           # every agent on this player's key is contacted
 *
 * puzzleTile:                                # never changes
 *   id                                       # the position, as text
 *   word
 *   key: {[playerId]: G / N / A}             # each player's key for it; my partner's null until the end
 *
 * tile:                                      # team.board.tiles[], by position
 *   id
 *   puzzleTile                               # linked by id
 *   revealed: {as, arrows}                   # what it shows (G / N / A), and the Set of players
 *                                            # to point an arrow at; null until anyone guesses it
 *   guessable                                # may I guess it; the blob's guessableBy, for me
 *
 * event:
 *   id
 *   by
 *   kind                                     # clue / guess / pass / hint
 *   turnNum
 *   tookTurn
 *   at
 *   clueWord                                 # a clue's; null otherwise
 *   clueCount
 *   clueFromAi
 *   tileId                                   # a guess's; null otherwise
 *   result                                   # G / N / A
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the builder wrote
 * (`GGameDataRaw`), with its links turned into players and tiles, the setup
 * rows built, and the seat rule applied: my partner's key is not here until
 * the game ends. Read-only: `useGame` builds it and nothing else writes it.
 */
export type GGameData = Omit<GGameDataRaw, 'puzzle' | 'team' | 'turns' | 'ending' | 'events' | 'players'> & {
  // The setup's choices as rows, built ONCE for both readers — the info column
  // and the printout (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  puzzle: { tiles: GPuzzleTile[]; tilesById: ReadonlyMap<string, GPuzzleTile> }
  team: GTeam & { board: { tiles: GTile[]; tilesById: ReadonlyMap<string, GTile> } }
  turns: GTurns
  events: GEvent[]
  ending: {
    reason: NonNullable<GGameDataRaw['ending']>['reason']
    detail: string
    by: GPlayer | null
    winner: GPlayer | null
  } | null
  // The players in seat order, A then B, and the same objects keyed by id.
  players: GPlayer[]
  playersById: Record<string, GPlayer>
  // My entry in `playersById`, and the other one: the same objects.
  me: GPlayer
  partner: GPlayer
  stateLineData: GStateLineData
}

/** codenamesduet's part of `summary_data`: the team, without its board. */
export type GSummaryData = SummaryData & {
  team: GTeam
}

/**
 * codenamesduet's per-game setup — the choices collected by the start-game
 * dialog, persisted to `common.games.setup`, and validated server-side in
 * `codenamesduet.create_game` (the canonical authority for what shapes are
 * accepted).
 *
 * The literal-union on `turns` mirrors the SQL check; the TypeScript narrowing
 * here is advisory (a curious client could always send something else). The
 * server rejects anything that doesn't match — see `create_game` in
 * supabase/sql/codenamesduet.sql.
 */
export type GSetupValues = {
  // Starting turn count. Matches the Duet rulebook's mission/campaign starting
  // values for easier difficulties (9 is the standard game; 10 and 11 are the
  // easier missions).
  turns: 9 | 10 | 11
  // UUID of the club member who gives the first clue. The RPC seats this user
  // as A (since A always opens the game) and the other member as B.
  first_clue_giver_user_id: string
  // Browser-side wall-clock timer mode. `none` (no clock) and `countup`
  // (informational) are display-only; `countdown` loses the game, reason
  // `timeout`, when the clock hits 0 (via codenamesduet.submit_timeout).
  // Validated server-side by `common._require_valid_timer`.
  //
  // Distinct from the rulebook's `turns` above — that's the in-game turn
  // budget; this is the external wall-clock countdown players can choose to
  // layer on top.
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
 * Everything that can be SAID about a move in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback.
 *
 * A guess of mine has no answer here: the tile turning over says it, and a
 * pill would only repeat the board. The terminal verdicts are not answers
 * either — they are the shared shape every game's `buildTerminalMessage` returns.
 */
export type GAnswer =
  // Where the turn stands after my partner's latest move, or mine: what my
  // PARTNER is doing now. Each holds in the header until the next move
  // replaces it.
  //   they hold the clue seat and have not given the clue yet
  | { answerType: 'writing_clue_peer' }
  //   they are guessing from my clue
  | { answerType: 'guessing_peer' }
  //   I hold the clue seat; they wait for my clue
  | { answerType: 'waiting_for_clue_peer' }
  //   I am guessing from their clue; they wait for me
  | { answerType: 'waiting_for_you_peer' }

  // My partner asked the AI for a clue. (My own asking has no answer: the
  // suggestion dialog is its feedback.)
  | { answerType: 'hint_peer' }

  // A clue given exactly as the AI suggested it. Nothing is SAID — the answer's
  // job is its outcome, which the event log's mark on that clue wears. A clue
  // the giver edited, or thought of alone, has no answer here.
  | { answerType: 'clue_ai' }

/** The clue-suggestion dialog's contents. It opens on click in `loading` (the
 *  edge function calls an AI and takes a few seconds), then resolves to the
 *  picked clue + reasoning (`ready`) or the API error message (`error`). */
export type GSuggestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; word: string; count: number; reasoning: string }

/** Every command codenamesduet offers, bound once (`hooks/useActionsAndMenu`). */
export type GActions = {
  actReveal: Action
  actRestart: Action
  actNewGame: Action
  actConcede: Action
  actStopGame: Action
  actPrintBoard: Action
  actBackToClub: Action
}

/** The turn-history viewer (`hooks/useHistoryView`). */
export type GHistoryView = {
  // A past turn is open on the board: the board goes inert under it.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a turn — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The viewed turn's board, or null when live.
  tiles: GTile[] | null
  // The tiles the viewed turn's guesses decided, to ring.
  litTileIds: ReadonlySet<string>
  // The banner's text, or null when live.
  label: string | null
}

/**
 * What the clue strip under the board shows — decided once, in `BoardCol`, so
 * the strip draws it and decides nothing:
 *
 *   suddenDeath      the sudden-death notice: nobody clues
 *   myClue           the clue form: I hold the clue seat, no clue yet
 *   waitingForClue   waiting for my partner's clue
 *   myGuess          the clue, and Pass: I am guessing from it
 *   partnerGuessing  the clue, and my partner guessing from it
 */
export type GClueStrip = 'suddenDeath' | 'myClue' | 'waitingForClue' | 'myGuess' | 'partnerGuessing'
