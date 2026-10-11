// cs-unmet

/**
 * wordsy's types — every type this game exports, in one place, so the data the
 * surface slings around can be read side by side. The `G` says a type is this
 * game's and not the shell's (docs/code-conventions.md → A game's types). A
 * component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts
 * stay in the fixture file.
 *
 * Two shapes carry the game: `GGameDataRaw` is the two blobs as the builders
 * wrote them (ids), and `GGameData` is what `useGame` makes of it for the
 * surface (players, the cards keyed by id, a rival's word withheld).
 * `GRoundRaw` / `GRound`, `GEventRaw` / `GEvent` and `GPlayerRaw` / `GPlayer`
 * are the same pairs, one level down.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { EndingLabel } from '@/common/ending/endingLabel'
import type { FactsApart, GameDataRaw, GameEnding, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/types'
import type { SetupOf, SetupRow } from '@/common/setup-form/types'

/**
 * One faceup card. A card is its deck number, 1–60, written as text; the
 * number says its letter and its bonus, and the builder writes both.
 */
export type GTile = {
  id: string
  // Lowercase, as the word list is; capitals are drawn.
  letter: string
  // 0 for a common card, 1 for a red one, 2 for a blue one.
  bonus: 0 | 1 | 2
  // 1–8: slots 1–2 under the 5, 3–4 under the 4, 5–6 under the 3, 7–8 under
  // the 2.
  slot: number
  // The slot's column: 5 5 4 4 3 3 2 2.
  value: number
}

/** One player's row on a round's scoresheet (`lib/scoresheet.ts`). */
export type GSheetRow = {
  // The round it is from.
  num: number
  player: GPlayer
  // '' for no word.
  word: string
  // The word's score against the round's table.
  score: number
  // The round's bonus, in its column: the Fastest's, or for beating them.
  fastestBonus: number | null
  beatBonus: number | null
  // Everything the row adds to the total: the score, unless struck, and the
  // bonus.
  rowTotal: number
  // The round's best total (`isStar`), on the round's sheet; one of the
  // player's lowest scores, which the total drops, on the game's.
  isStar: boolean
  isStruck: boolean
}

/** One letter of a word, with the card it scores on against a round's table,
 *  or null when it scores nothing (`lib/score.ts`). */
export type GScoredLetter = {
  letter: string
  tile: GTile | null
}

/** One round, as the blob carries it; `gd` turns its links into players
 *  (`GRound`). */
export type GRoundRaw = {
  // 1–7.
  num: number
  // The round's eight cards, in slot order. Fixed once dealt.
  tiles: GTile[]
  // The Fastest Wordsmith — the round's first submit in the timer style — or
  // the First Wordsmith named at the deal in no-timer; null until there is one.
  fastest: string | null
  // The player who may not start this round's clock: last round's Fastest,
  // while more than two still play.
  noFlipHolder: string | null
  // The round's 30 seconds are counting down.
  isTimerRunning: boolean
  ended: boolean
}

/** One round, as `gd` holds it. */
export type GRound = Omit<GRoundRaw, 'fastest' | 'noFlipHolder'> & {
  // The same cards, keyed by id.
  tilesById: Record<string, GTile>
  fastest: GPlayer | null
  noFlipHolder: GPlayer | null
}

/**
 * wordsy's `game_data` and `static_game_data`, as its builders write them
 * (supabase/sql/wordsy.sql → The page blobs): the common part, with the
 * rounds, the log and each player's totals and standing word on top.
 * `useGame` merges the two blobs the page hands down and turns them into `gd`.
 *
 * Every seat's standing word is in it while the round is open, since one blob
 * serves every seat; `useGame` drops a rival's.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  // Always null: compete only, so there is never a team.
  team: null
  // The game's length, and how many rounds' word scores its totals count.
  nRounds: GNRounds
  nBestRounds: 5 | 2
  // The cards not yet dealt. The deck's order never leaves the server.
  nTilesInDeck: number
  // Every round dealt so far, the one in play last.
  rounds: GRoundRaw[]
  // Every finished round's words, a row per player still playing; within a
  // round the Fastest's first, then as the words came in, no word last.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * wordsy's facts (docs/common-schema.md → A player's facts), each the
 * player's own: compete only, so the side's and the own are the same.
 */
export type GFacts = {
  // The best five word scores plus every bonus, over the rounds finished so far.
  total: number
  // How many rounds earned a bonus — the First Wordsmith rule's count.
  nBonuses: number
  // Score plus bonus per round, 1–7; null for a round not finished or not played.
  roundScores: (number | null)[]
  // A word stands for the round in play.
  hasSubmitted: boolean
  // That word, or null: always mine; a rival's is null until the round ends.
  word: string | null
  // That word can no longer change: the Fastest's in the timer style, any
  // word in no-timer.
  isWordFrozen: boolean
  // Between rounds, they have pressed "Start round N".
  isReadyForNextRound: boolean
}

/**
 * Every answer wordsy gives about a move — the whole roster of what this game
 * tells anybody. `lib/answer.ts` says what each one reads as
 * (docs/outcomes.md → How a game does it).
 *
 * `submitted`, `not_a_word` and `already_played` are `submit_word`'s;
 * `first_in_peer` is a rival starting the clock, in the header; `no_word` is a
 * log row for a player who submitted nothing.
 */
export type GAnswer =
  | { answerType: 'submitted' }
  | { answerType: 'not_a_word' }
  | { answerType: 'already_played'; earlier: string }
  | { answerType: 'first_in_peer' }
  | { answerType: 'no_word' }

/**
 * What became of a sent word, for the entry: it now `stands`; it was
 * `refused` as no word at all, so nothing in it is worth fixing; or it is
 * `kept` to fix — already played, or a not-ok.
 */
export type GSentWord = 'stands' | 'refused' | 'kept'

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of the reveal.
  id: number
  userId: string
  kind: 'word'
  // The round the word was played in.
  num: number
  // '' for a player who submitted nothing.
  word: string
  // The word against the round's table.
  score: number
  // What the round's bonuses gave: 0–4.
  bonus: number
  tookTurn: boolean
  at: string
}

/** A player as wordsy's game_data shows them: the common player, with their
 *  totals and this round's word. */
export type GPlayerRaw = PlayerRaw & GFacts

/*
 * The shape of `gd` (`GGameData`): the game_data blob with its links turned
 * into players, the cards keyed by id per round, and the seat rule applied.
 *
 * gd:
 *   id
 *   gametype
 *   brand
 *   club: {handle}
 *   mode                                     # always compete
 *   coop
 *   compete
 *   title                                    # "Round 3 of 7"
 *   setup
 *   setupRows
 *   turns                                    # always null: no turn order
 *   ending: {reason, detail, by, winners}    # null while playing
 *   ended
 *   outcome                                  # null until the game ends
 *   nRounds · nBestRounds                    # 7 · 5, or a short game's 3 · 2
 *   nTilesInDeck
 *   rounds: [round, …]                       # every round dealt, the one in play last
 *   round                                    # same object as the last of rounds
 *   isBetweenRounds                          # round ended, the next not yet started
 *   events: [event, …]
 *   players: [player, …]                     # seat order
 *   playersById
 *   me                                       # same object as playersById[auth.user.id]
 *
 * round:
 *   num
 *   tiles: [tile, …]                         # slot order
 *   tilesById
 *   fastest                                  # player | null
 *   noFlipHolder                             # player | null
 *   isTimerRunning
 *   ended
 *
 * player:
 *   the common player
 *   total, nBonuses, roundScores, hasSubmitted, word, isWordFrozen,
 *   isReadyForNextRound
 *   own: {…the same}                         # this player's own: compete only, so equal
 *   endingLabel                              # how they came out; null while they play
 *
 * tile:                                      # GTile
 *   id, letter, bonus, slot, value
 *
 * event:
 *   id, by, kind, num, word, score, bonus, tookTurn, at
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object: the `game_data` blob the builder wrote, with its links
 * turned into players, the cards keyed by id, a rival's standing word dropped
 * and the setup rows built. Read-only: `useGame` builds it and nothing else
 * writes it.
 */
export type GGameData = Omit<GGameDataRaw, 'team' | 'turns' | 'ending' | 'rounds' | 'events' | 'players'> & {
  // The setup's choices as rows, built ONCE for both readers — the info column
  // and the printout (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  turns: { holder: GPlayer } | null
  ending: GameEnding<GPlayer> | null
  rounds: GRound[]
  // The round in play — or, between rounds and once the game has ended, the
  // last one played.
  round: GRound
  // The last round has ended and the next waits for everyone to press Start:
  // the round's scoresheet takes the board's place.
  isBetweenRounds: boolean
  events: GEvent[]
  // The players in seat order, and the same objects keyed by id.
  players: GPlayer[]
  playersById: Record<string, GPlayer>
  // My entry in `playersById`: the same object.
  me: GPlayer
}

/**
 * A player as `gd` holds them: the common player with wordsy's facts, spread
 * on and under `own` (docs/common-schema.md → A player's facts).
 */
export type GPlayer = PlayerRaw & FactsApart<GFacts> & {
  own: GFacts
  // How they came out (`lib/endingLabel.ts`): of the game once it has ended,
  // or of their own play once they conceded. Null while they still play.
  endingLabel: EndingLabel | null
}

export type GEvent = Omit<GEventRaw, 'userId'> & {
  // Who played the word.
  by: GPlayer
}

export type GHistoryView = {
  // A past round's table is open on the board: the entry takes nothing while
  // it is.
  isViewing: boolean
  // The round open on the board, or null when live.
  viewedNum: number | null
  // Open a round — the log's `#N` click.
  show: (num: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The round as it was dealt, or null when live.
  round: GRound | null
  // The banner's words for the viewed round, or null when live.
  label: string | null
}

export type GActions = {
  // Each key is spelled as its action's id (`act-restart` → `actRestart`), so
  // a grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Deal THIS deck again from round 1 — the same seven tables.
  actRestart: Action
  // A fresh shuffle, with this game's setup and players.
  actNewGame: Action
  // Drop out while the others play on.
  actConcede: Action
  // The whole table stops, with no result.
  actStopGame: Action
  // Print the game's log.
  actPrintBoard: Action
  // Between rounds: I am ready for the next; the last press deals it.
  actStartRound: Action
  // Leave for the club — the shell's own action, off `menu`.
  actBackToClub: Action
}

/** How a round ends: at its 30-second clock, or once everyone has submitted. */
export type GRoundStyle = 'timer' | 'no-timer'

/** A game's length: the rulebook's seven rounds, or a short game's three. */
export type GNRounds = 7 | 3

export type GSetupValues = {
  // Fixed at none, never shown: the round's clock is the game's own
  // (common.timers re-armed each round), so there is no whole-game timer.
  timer: TimerMode
  // The may-enter band: a word at or below it is legal.
  legal_band: number
  round_style: GRoundStyle
  n_rounds: GNRounds
  // Every submit is final, and the round ends once everyone is in — the
  // no-timer style's rule, in the timer style too, where the clock can still
  // end it first. No-timer ignores it: it is always one word.
  one_word: boolean
  // WHO IS PLAYING — a field like any other, and the only one that is not
  // part of the setup blob: `create_game` takes it as its own argument.
  player_user_ids: Set<string>
}

/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds. */
export type GSetup = SetupOf<GSetupValues>

/**
 * `common.games.summary_data`, as `wordsy._rebuild_data_cols` writes it
 * (supabase/sql/wordsy.sql): the common part, and wordsy's keys beside it.
 * Every key is always present, null when it has no value.
 */
export type GSummaryData = SummaryData & {
  team: null
  // The rounds finished so far, 0–nRounds.
  nRoundsPlayed: number
  // The total every winner shares; null until the game ends with one.
  winnerTotal: number | null
  nRounds: GNRounds
  legalBand: number
  roundStyle: GRoundStyle
  oneWord: boolean
}
