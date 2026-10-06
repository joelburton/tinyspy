// cs-unmet

/**
 * wordiply's types — every type this game exports, in one place, so the data
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
import type { Mark } from '@/common/board-marks/useMark'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { Actor } from '@/common/members/member'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/types'
import type { CoopTurnSetup, SetupOf, SetupRow } from '@/common/setup-form/types'

/**
 * wordiply's `game_data` and `static_game_data`, as its builders write them
 * (supabase/sql/wordiply.sql → The page blobs): the common part, with the
 * puzzle, the team, the log and wordiply's facts about each player on top.
 * `useGame` merges the two blobs the page hands down and turns them into
 * `gd`.
 *
 * It carries everything: every player's rows in the log, and every seat's
 * board. What a racer may see of a rival mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  // The board as built, frozen at create. The page waits for the end to show
  // the longest words and their length.
  puzzle: {
    // The 2–4 letters every word must contain.
    base: string
    // The longest legal word's length: the length score's denominator.
    maxWordLen: number
    // Up to three legal words at that length.
    longestWords: string[]
    // Every legal word, so the page judges a word itself.
    legalWords: string[]
  }
  // What the team shares; null in compete, where there is no team.
  team: GTeam | null
  // The log: every submission, rejects included, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * One track's numbers: the accepted words of one player, or of the whole team.
 * The three scores are null until the game ends.
 */
export type GTrack = {
  nGuessesUsed: number
  // The longest word against the board's longest possible, as a percent.
  lengthScore: number | null
  // The letters across every accepted word.
  nLetters: number | null
  longestWordLen: number | null
}

/**
 * What the team shares in coop (plans/team-facts.md): the team's track,
 * summed over every player's words. The budget it counts against is
 * `maxGuesses`, on every player.
 */
export type GTeam = GTrack

/**
 * What the info column's state line shows — "3/5 guesses" while playing, the
 * score bar and the letter count at the end: the team's track in coop, my own
 * in compete, against the budget and the board's longest. Decided once, in
 * `makeGameData`, so the line draws it and picks nothing. Named for its
 * reader: this is what to SHOW there, not a fact other components read.
 */
export type GStateLineData = GTrack & {
  maxGuesses: number
  maxWordLen: number
}

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // The word submitted, lowercase.
  word: string
  // It counted: it spent a guess and fills a board line.
  valid: boolean
  // Which rule refused it; null when valid.
  reason: 'missing_base' | 'too_short' | 'not_a_word' | null
  // It cost the player their go: true on an accepted word and on a rules
  // break, false on a word the list lacks.
  tookTurn: boolean
  at: string
}

/** A player as wordiply's game_data shows them: the common player, with the
 *  budget, their own track and this seat's board. */
export type GPlayerRaw = PlayerRaw & GTrack & {
  // The guess budget: the team's in coop, each player's own in compete. The
  // same on every player.
  maxGuesses: number
  // What this seat sees: the team's words in coop, the racer's own in
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
 *     base
 *     maxWordLen
 *     longestWords
 *     legalWords
 *   team:                                    # null in compete
 *     nGuessesUsed
 *     lengthScore                            # null until the game ends
 *     nLetters                               # null until the game ends
 *     longestWordLen                         # null until the game ends
 *   turns: {holder}                          # null: no turn order; holder is a player
 *   ending: {reason, detail, by, winner}     # null while playing; by and winner are players
 *   ended
 *   outcome                                  # null until the game ends
 *   events: [event, …]                       # every submission, rejects included; my rows only, mid-race
 *   players: [player, …]                     # seat order
 *   playersById
 *   me                                       # same object as playersById[auth.user.id]
 *   stateLineData: {nGuessesUsed, maxGuesses, lengthScore, nLetters, longestWordLen, maxWordLen}
 *                                            # the team's in coop, mine in compete
 *
 * player:
 *   the common player
 *   maxGuesses                               # 5, the same on every player
 *   nGuessesUsed                             # own, in every mode
 *   lengthScore                              # own; null until the game ends
 *   nLetters                                 # own; null until the game ends
 *   longestWordLen                           # own; null until the game ends
 *   board: {words}                           # what this seat sees: the team's words in coop, my own
 *                                            # in compete; null for a rival mid-race
 *
 * event:
 *   id
 *   by
 *   word
 *   valid
 *   reason                                   # missing_base / too_short / not_a_word; null when valid
 *   tookTurn
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
  // What the state line shows: the team's track in coop, my own in compete.
  stateLineData: GStateLineData
}

/** One player of this game, as `gd` holds them: the blob's player, with the
 *  board withheld — null — for a rival mid-race. */
export type GPlayer = Omit<GPlayerRaw, 'board'> & {
  board: GBoard | null
}

/** What one seat sees: the accepted words, in the order of play. */
export type GBoard = {
  words: string[]
}

/** One row of the log, as `gd` holds it: the blob's row, with its player. */
export type GEvent = Omit<GEventRaw, 'userId'> & {
  // Who submitted it.
  by: GPlayer
}

/**
 * wordiply's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, validated server-side in
 * `wordiply.create_game`.
 *
 * **Mode is NOT on this type** — it's locked at the gametype level (the
 * sibling-manifest pattern), not a setup-time choice. Both manifests share
 * this same shape.
 *
 * There is no `target_rank` (wordiply isn't a race-to-rank) and no
 * separate "base" difficulty (the base is a letter-combination, not a
 * word — it has no difficulty). Just:
 *   - `difficulty` — the dictionary band the legal child words are drawn
 *     from (1..6). Higher = more obscure words count as legal guesses and
 *     can be the longest word. Both manifests default to 5.
 *   - `timer` — the timer's mode (none / countup / countdown).
 *   - `custom_base` — an OPTIONAL player-chosen starter (see below).
 */
export type GSetupValues = CoopTurnSetup & {
  timer: TimerMode
  // Dictionary band for legal child words (1..6).
  difficulty: number
  // An OPTIONAL player-chosen starter, 2–4 letters. Blank/absent means the
  // usual random board — the edge function samples a fragment. Set it and the builder uses exactly these letters instead, which is
  // how you hand a friend a challenge ("try wordiply with MOTH").
  //
  // Because YOU picked it, a custom base plays by a relaxed gate: the
  // builder drops its child-count FLOOR (a random board wants ≥20 matching
  // words; yours needs only 1) and raises the ceiling to 1000. What it does
  // NOT drop is the headroom rule — the best possible word must still beat
  // the base by ≥3 letters, because a MOTH board whose best answer is MOTHER
  // isn't a game. See docs/games/wordiply.md → the base.
  //
  // Only the SHAPE is checked here (`customBaseError`); whether a base
  // actually yields a board is a dictionary question the frontend can't
  // answer without a round trip, so the edge function owns it and rejects at
  // Start — the same deal boggle's generation constraints get.
  //
  // Not saved as the club's next default: `create_game` strips it before
  // handing the setup to `common._create_game`. A one-off, not a baseline.
  custom_base?: string
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
 * Everything that can be SAID about a guess in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 * The names are the SERVER's, which its rejected rows carry in `reason`, so a
 * logged row and a live answer are read through one function.
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback. `word` is lowercase, as the engine and the rows carry it.
 */
export type GAnswer =
  // My guess counted. It says nothing: the board row shows the word and its
  // length the moment it lands, so a line would say it twice.
  | { answerType: 'accepted' }
  // A coop teammate's did, off the events log.
  | { answerType: 'accepted_peer'; word: string }

  // A word already guessed — by anyone in coop, by me in compete.
  | { answerType: 'already_found'; word: string }
  // Not longer than the base.
  | { answerType: 'too_short'; word: string }
  // Does not contain the base.
  | { answerType: 'missing_base'; word: string; base: string }
  // Contains the base, and is not a word.
  | { answerType: 'not_a_word'; word: string }

/**
 * Every command wordiply offers, bound once: the info column's action row
 * places them, the menu lists them, and their keys fire them — all reading the
 * same action, so the surfaces cannot drift.
 */
export type GActions = {
  // Each key is spelled as its action's id (`act-reveal` → `actReveal`), so a
  // grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Show the best possible word — or put it away again. A local display
  // toggle, no RPC; it carries its own two faces.
  actReveal: Action
  // Restart THIS game — same base — from scratch.
  actRestart: Action
  // Start a fresh follow-up game — same setup, a new base and id. Disables
  // itself while the create is in flight.
  actNewGame: Action
  // Drop out of a compete game while the others play on — hidden in coop, and
  // once you are out, when Stop takes its place.
  actConcede: Action
  // Stop the game for the whole table — coop's exit; it hides itself in
  // compete until you are out.
  actStopGame: Action
  // Print the log; the menu's alone, with no twin in the row.
  actPrintBoard: Action
  // Leave for the club page — the shell's own, off `PlayAreaLoaderProps.menu`,
  // carried here so a surface that places the row has every action in one
  // object.
  actBackToClub: Action
}

/**
 * The turn-history view: which past row of the log, if any, is open on the
 * board, and the board as it stood then. Every field but the two callbacks is
 * null (or undefined) while the live board is on screen.
 */
export type GHistoryView = {
  // A past row is open on the board (`viewedEventId` is set). The entry row is
  // not drawn and the marks are not shown.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a row — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The board's words as of that row, or null when live.
  words: string[] | null
  // The banner's text, or null when live.
  label: string | null
  // Whose board is on screen, when it is not mine — which only compete can
  // be: coop is one shared board.
  actor: Actor | undefined
}

/** A past row of the log, replayed. */
export type GReplayedTurn = {
  // The accepted words up to and including the row. A reject fills no line, so
  // its replay is the board as it stood when it was tried.
  words: string[]
  // A short label for the viewer banner: what the row turned out to be.
  label: string
  // Who submitted it — whose board this is; null for an id not in the log.
  author: GPlayer | null
}

/**
 * The answer on the board's row for a word that has just been judged: mine as
 * I submit it, a teammate's as it lands. `held` is my own word kept in the
 * next line while its answer shows — the engine clears the entry on submit, so
 * without it the word would vanish for a round trip.
 */
export type GAnswerMark = {
  // My word, drawn in the next line. `awaitingRow`: it was accepted, and stays
  // until the server's row lands behind it; a refused one goes with its mark.
  held: { word: string; awaitingRow: boolean } | null
  // The answer being shown on whichever line its word is in, for a beat.
  flash: Mark<{ word: string; outcome: Outcome }> | null
  // Show an answer on its word's line — `isForeign` for a teammate's, which is
  // announced with the attention flash first.
  show: (word: string, outcome: Outcome, isForeign?: boolean) => void
}

/**
 * `common.games.summary_data`, as `wordiply._rebuild_data_cols` writes it
 * (supabase/sql/wordiply.sql): the common part, and wordiply's keys beside it.
 * Every key is always present, null when it has no value, so no key here is
 * optional. The summary (`manifest.ts`'s `summaryFor`) reads it as written, so
 * there is no polished pair and no `Raw`; the play surface reads `game_data`
 * instead (`GGameDataRaw`).
 *
 * `team` is `game_data`'s group less the longest word's length: the team's
 * track in coop, null in compete, whose summary shows no progress. The
 * winner's length score is compete's, null until the race is won and always
 * null in coop (the winner is the common `ending.winner`).
 */
export type GSummaryData = SummaryData & {
  team: Omit<GTeam, 'longestWordLen'> | null
  maxGuesses: number
  winnerLengthScore: number | null
}
