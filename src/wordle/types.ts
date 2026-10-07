// cs-unmet

/**
 * wordle's types — every type this game exports, in one place, so the data
 * the surface slings around can be read side by side. The `G` says a type is
 * this game's and not the shell's (docs/code-conventions.md → A game's types).
 * A component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts
 * stay in `lib/gameData.fixture.ts`.
 *
 * Two shapes carry the game: `GGameDataRaw` is the two blobs as the builders
 * wrote them (ids), and `GGameData` is what `useGame` makes of it for the
 * surface (players, the seat rule applied). `GPlayer` / `GPlayerRaw` and
 * `GEvent` / `GEventRaw` are the same pair, one level down.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { EndingLabel } from '@/common/ending/endingLabel'
import type { FactsApart, GameDataRaw, GameEnding, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/types'
import type { Actor } from '@/common/members/member'
import type { CoopTurnSetup, SetupOf } from '@/common/setup-form/types'
import type { SetupRow } from '@/common/setup-form/types'

/**
 * wordle's `game_data` and `static_game_data`, as its builders write them
 * (supabase/sql/wordle.sql → The page blobs): the common part, with the
 * puzzle, the log and wordle's facts about each player on top. `useGame`
 * merges the two blobs the page hands down and turns them into `gd`.
 *
 * It carries everything: every player's rows in the log, and every seat's
 * board. What a racer may see of a rival mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  puzzle: {
    // The answer. Null until the game ends.
    target: string | null
  }
  // The team's facts, sent once: the count summed over every player's own,
  // and the one board. Null in compete, where there is no team.
  team: GFactsRaw | null
  // The log: every accepted guess, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * wordle's facts (docs/common-schema.md → A player's facts): the guesses spent
 * against the budget, and the board they are played on. A player carries them
 * twice — spread on, their side's (the team's in coop, their own in compete);
 * under `own`, their own.
 */
export type GFacts = {
  nGuessesUsed: number
  // The guess budget: the team's in coop, each player's own in compete.
  maxGuesses: number
  // The guess rows, in the order of play; null for a rival mid-race.
  board: GBoard | null
}

/** `GFacts` as the builders write them: the board is always there. */
export type GFactsRaw = Omit<GFacts, 'board'> & {
  board: GBoard
}

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // The five-letter word guessed.
  word: string
  // The five g/y/x codes, one per letter, as `common._wordle_colors` judged
  // them.
  colors: string
  correct: boolean
  at: string
}

/** A player as wordle's game_data shows them: the common player, with their
 *  own facts and the clock's tie-break. */
export type GPlayerRaw = PlayerRaw & Omit<GFactsRaw, 'board'> & {
  // A racer's own board; null in coop, whose one board is `team`'s.
  board: GBoard | null
  // Compete, once ranked: the earlier solve, not the guess count, placed this
  // solver against the winner (the winner's too, when another solver matched
  // their count). Null in coop and until the game ends.
  tieBrokenByClock: boolean | null
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
 *   puzzle: {target}                      # null until the game ends
 *   turns: {holder}                       # null: no turn order; holder is a player
 *   ending: {reason, detail, by, winners} # null while playing; by and winners are players; winners is every player ranked first
 *   ended
 *   outcome                               # null until the game ends
 *   events: [{id, by, word, colors, correct, at}, …]   # the log, by a player; my rows only, mid-race
 *   players: [player, …]                  # seat order
 *   playersById
 *   me                                    # same object as playersById[auth.user.id]
 *
 * player:
 *   id
 *   username
 *   color
 *   ai
 *   seat                                  # null in a free-for-all game
 *   ending: {at, reason, detail}          # null unless they ended before the game ended
 *   outcome                               # null until written
 *   finalRanking                          # null until written
 *   solvedAt
 *   conceded
 *   solved
 *   stillPlaying
 *   onTurn
 *   waitingForTurn
 *   nGuessesUsed                          # the side's: the team's in coop, their own in compete
 *   maxGuesses
 *   board: {rows}                         # coop's one board on every player; null for a rival mid-race
 *   own: {nGuessesUsed, maxGuesses, board}  # this player's own
 *   endingLabel: {labelType, word, long, pill, outcome, endedBy}
 *                                            # how they came out; null while they play
 *   tieBrokenByClock                      # compete, once ranked; null in coop and until the end
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players, the setup rows
 * built, and the seat rule applied: what I may not see yet is not here.
 * Read-only: `useGame` builds it and nothing else writes it.
 */
export type GGameData = Omit<GGameDataRaw, 'team' | 'turns' | 'ending' | 'events' | 'players'> & {
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  turns: { holder: GPlayer } | null
  // The log, by player; mid-race in compete, my rows only.
  events: GEvent[]
  ending: GameEnding<GPlayer> | null
  // The players in seat order, and the same objects keyed by id.
  players: GPlayer[]
  playersById: Record<string, GPlayer>
  // My entry in `playersById`: the same object. My own board is always mine
  // to see.
  me: GPlayer & { board: GBoard }
}

/**
 * One player of this game, as `gd` holds them: the blob's player with
 * wordle's facts twice — spread on, their side's; under `own`, their own
 * (docs/common-schema.md → A player's facts). A rival's board is null mid-race.
 */
export type GPlayer = Omit<GPlayerRaw, 'board'> & FactsApart<GFacts> & {
  own: GFacts
  // How they came out (`lib/endingLabel.ts`): of the game once it has ended,
  // or of their own play while the others go on. Null while they still play.
  endingLabel: EndingLabel | null
}

/** What one seat's tiles show: its guess rows, in the order of play. */
export type GBoard = {
  rows: GBoardRow[]
}

/** One submitted row on the board — a word and its g/y/x colors. */
export type GBoardRow = { word: string; colors: string }

/** One row of the log, as `gd` holds it: the blob's row, with its player. */
export type GEvent = Omit<GEventRaw, 'userId'> & {
  // Who guessed.
  by: GPlayer
}

/**
 * wordle's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, and validated server-side by
 * `wordle.create_game` (the authority for what's accepted).
 */
export type GSetupValues = CoopTurnSetup & {
  // Guess budget — how many guesses the player (coop: the team) gets. Classic
  // Wordle is 6; we offer 5–8. The server bounds it.
  max_guesses: number
  // Where the hidden target is drawn from. `0` = the curated NYT-Wordle answer
  // list (`wordle=true`, the classic feel — default). `1..6` = any 5-letter
  // word of that difficulty band or easier (a higher band can yield an obscure
  // answer). 0 is not a real band; see `answerMaxBand`.
  answer_band: number
  // What counts as a legal guess: any real 5-letter word of difficulty ≤ this
  // (1..6). Must reach the answer's hardest band so every possible answer is
  // itself a legal guess — see `legalError` / `answerMaxBand`.
  legal_band: number
  // Timer mode. `none` / `countup` are purely informational; a `countdown`
  // ends the game when it expires, via the shared `wordle.submit_timeout` RPC.
  timer: TimerMode
  // WHO IS PLAYING — a field like any other, and not part of the setup blob:
  // `create_game` takes it as its own argument and writes
  // `common.game_players` rows from it.
  player_user_ids: Set<string>
}

/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds, and what
 *  `gd.setup` and the setup rows read back. */
export type GSetup = SetupOf<GSetupValues>

/**
 * Every command wordle offers, bound once: the info column's action row places
 * them, the menu lists them, and their keys fire them — all reading the same
 * action, so the surfaces cannot drift.
 */
export type GActions = {
  // Each key is spelled as its action's id (`act-reveal` → `actReveal`), so a
  // grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Show the word — or put it away again. A local display toggle, no RPC; it
  // carries its own faces, the inert "solution already shown" included.
  actReveal: Action
  // Restart THIS game — same word — from scratch.
  actRestart: Action
  // Start a fresh follow-up game — same setup, new target + id. Disables itself
  // while the create is in flight.
  actNewGame: Action
  // Drop out of a compete game while the others play on — hidden in coop, and
  // once you are out (solved, out of guesses, conceded), when Stop takes its
  // place.
  actConcede: Action
  // Stop the game for the whole table — coop's exit; it hides itself in
  // compete until you are out.
  actStopGame: Action
  // Print the board and the log; the menu's alone, with no twin in the row.
  actPrintBoard: Action
  // Leave for the club page — the shell's own, off `PlayAreaLoaderProps.menu`,
  // carried here so a surface that places the row has every action in one
  // object.
  actBackToClub: Action
}

/**
 * The turn-history view: which past turn, if any, is open on the board, and
 * that turn replayed. Every field but the two callbacks is null (or undefined)
 * while the live board is on screen.
 */
export type GHistoryView = {
  // A past turn is open on the board (`viewedEventId` is set). Everything that
  // would write to the board answers to it: the capture freezes and the typing
  // row is not drawn.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a turn — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The viewed turn's board rows, or null when live.
  rows: GBoardRow[] | null
  // The row the viewed turn added — ring it; -1 when live.
  litRowIdx: number
  // The banner's text, or null when live.
  label: string | null
  // Whose board is on screen, when it is not mine — which only compete can
  // be: coop is one shared board, so a teammate's row replays the board I am
  // already looking at, and there is no "whose" to answer.
  actor: Actor | undefined
}

/** A past turn, replayed. */
export type GReplayedTurn = {
  // The guess rows as of the END of the viewed turn — feed straight to
  // `<Board>`.
  rows: GBoardRow[]
  // The board row this turn added — ring it in the history blue (it already
  // wears its g/y/x tile colors). The last row in `rows`; -1 when nothing was
  // replayed.
  litRowIdx: number
  // A short, name-free turn label for the viewer banner (the log row shows
  // *who*).
  label: string
  // Who made the turn — whose board this is; null for an id not in the log.
  author: GPlayer | null
}

/**
 * Everything that can be SAID about a move in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * The "_peer" versions are about someone else's move, for the header line.
 */
export type GAnswer =
  // My guess was the word.
  | { answerType: 'correct' }
  // A coop teammate's was, on the board we share.
  | { answerType: 'correct_peer'; guess: string }

  // My guess was not the word: it colored, and spent a go.
  | { answerType: 'incorrect' }
  // A coop teammate's did.
  | { answerType: 'incorrect_peer'; guess: string }

  // A compete opponent solved it. It has no twin of mine: this is not a row
  // (a racer's rows are withheld mid-race) but their `solved` being set.
  | { answerType: 'solved_peer' }

  // Refused by the server: this word is already on the board.
  | { answerType: 'duplicate' }
  // Refused by the server: not in the legal slice of the dictionary.
  | { answerType: 'not_a_word' }
  // Refused here: fewer than five letters.
  | { answerType: 'too_short' }

/**
 * `common.games.summary_data`, as `wordle._rebuild_data_cols` writes it
 * (supabase/sql/wordle.sql): the common part, and wordle's keys beside it.
 * Every key is always present, null when it has no value, so no key here is
 * optional. The summary (`manifest.ts`'s `summaryFor`) reads it as written, so
 * there is no polished pair and no `Raw`; the play surface reads `game_data`
 * instead (`GGameDataRaw`).
 *
 * `team` is the team's count in coop, null in compete, whose summary shows no progress; the winner's count is compete's,
 * null until the end and always null in coop (the winner is whoever the
 * common `players` ranks first). `answerBand` is the setup's.
 */
export type GSummaryData = SummaryData & {
  team: Pick<GFacts, 'nGuessesUsed'> | null
  maxGuesses: number
  answerBand: number
  nWinnerGuesses: number | null
  // Each racer's guesses, by id, public in a race; null in coop.
  nGuessesUsedById: Record<string, number> | null
}
