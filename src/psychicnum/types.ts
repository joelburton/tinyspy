// cs-unmet

/**
 * psychicnum's types — every type this game exports, in one place, so the
 * data the surface slings around can be read side by side. The `G` says a
 * type is this game's and not the shell's (docs/code-conventions.md → A game's
 * types). A component's props stay with the component; a type one file uses
 * stays in that file; the printer's model stays in `pdf/`; the test fixtures'
 * facts stay in `lib/gameData.fixture.ts`.
 *
 * Two shapes carry the game: `GGameDataRaw` is `game_data` as the builder
 * wrote it (ids, records), and `GGameData` is what `useGame` makes of it for the
 * surface (players, maps, the seat rule applied). `GPlayer` / `GPlayerRaw` and
 * `GEvent` / `GEventRaw` are the same pair, one level down.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { TimerMode } from '@/common/manifest/gameManifest'
import type { Actor } from '@/common/members/member'
import type { CoopTurnSetup } from '@/common/setup-form/SetupCoopStyleSection'
import type { SetupOf } from '@/common/setup-form/setupForm'
import type { SetupRow } from '@/common/setup-form/setupRows'

/**
 * psychicnum's `game_data`, as `psychicnum._rebuild_data_cols` writes it
 * (supabase/sql/psychicnum.sql → The page blobs): the common part, with the
 * puzzle, the log and psychicnum's facts about each player on top. What the
 * page is handed in `PlayAreaLoaderProps.gameData`; `useGame` turns it into
 * `gd`.
 *
 * It carries everything: every player's rows in the log, and every seat's
 * board. What a racer may see of a rival mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  puzzle: {
    // The words shown as tiles; three of them are the secrets.
    words: GTileWord[]
    // Null until the game ends, since they're a aecret
    secrets: GTileWord[] | null
  }
  // What the team shares; null in compete, where there is no team.
  team: GTeam | null
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * What the team shares in coop (plans/team-facts.md): the finds and the guesses
 * summed over every player's own. The budget they count against is
 * `maxGuesses`, on every player.
 */
export type GTeam = {
  foundSecretsCount: number
  guessesUsed: number
}

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // The text this row carries. For 'guess' / 'spoiler' it's a `GTileWord`; for
  // 'hint' it's the CLUE text (or "No hint available"), which is why this is
  // a plain string.
  word: GTileWord | string
  correct: boolean
  // 'guess' = a real guess (colors the board, counts toward the win);
  // 'spoiler' = a secret word handed over (the answer);
  // 'hint' = a clue for a secret.
  kind: 'guess' | 'hint' | 'spoiler'
  at: string
}

/** A player as psychicnum's game_data shows them: the common player, with the
 *  budget, the counts and this seat's board. */
export type GPlayerRaw = PlayerRaw & {
  // How many secrets the board hides. The same on every player.
  requiredSecretsCount: number
  // The guess budget: the team's in coop, each player's own in compete. The
  // same on every player.
  maxGuesses: number
  // This player's own, in every mode; the team's are `team`'s.
  foundSecretsCount: number
  guessesUsed: number
  // What this seat's tiles show: each guessed word → whether it was a secret,
  // and → who guessed it. One board in coop, each racer's own in compete.
  board: {
    tileResults: Record<GTileWord, boolean>
    decidedBy: Record<GTileWord, string>
  }
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
 *   puzzle: {words, secrets}              # secrets null until the game ends
 *   team: {foundSecretsCount, guessesUsed}  # what the team shares; null in compete
 *   turns: {holder}                       # null: no turn order; holder null: nobody's turn now
 *   ending: {reason, detail, by, winner}  # null while playing; by and winner are players
 *   ended
 *   outcome                               # null until the game ends
 *   events: [{id, by, word, correct, kind, at}, …]   # the log, by a player; my rows only, mid-race
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
 *   requiredSecretsCount                  # the same on every player
 *   maxGuesses                            # the same on every player
 *   foundSecretsCount                     # own, in every mode
 *   guessesUsed                           # own, in every mode
 *   board: {tileResults, decidedBy}       # what this seat's tiles show; null for a rival mid-race
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players, the setup rows
 * built, and the seat rule applied: what I may not see yet is not here.
 * Read-only: `useGame` builds it and nothing else writes it.
 */
export type GGameData =
  Omit<GGameDataRaw, 'turns' | 'ending' | 'events' | 'players'> & {
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  turns: { holder: GPlayer | null } | null
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
}

/** One player of this game, as `gd` holds them: the blob's player, with the
 *  board's ids turned into players — or null, for a rival mid-race. */
export type GPlayer = Omit<GPlayerRaw, 'board'> & {
  board: GBoard | null
}

/** What one seat's tiles show. */
export type GBoard = {
  // Each guessed word → whether it was a secret: the board's permanent green
  // and red. Hint and spoiler rows mark no tile.
  tileResults: GTileResults
  // Each guessed word → who guessed it.
  decidedBy: ReadonlyMap<GTileWord, GPlayer>
}

/** One row of the log, as `gd` holds it: the blob's row, with its player. */
export type GEvent = Omit<GEventRaw, 'userId'> & {
  // Who guessed, asked, or was handed the spoiler.
  by: GPlayer
}

/**
 * psychicnum's per-game setup — the choices collected by the
 * start-game dialog, persisted to `psychicnum.games.setup`, and
 * validated server-side in `psychicnum.create_game` (the
 * canonical authority for what shapes are accepted).
 *
 * Which values the form offers is this file's choice (`GUESS_OPTIONS`);
 * the server only holds each field to a sane range — see `create_game`
 * in `supabase/sql/psychicnum.sql`.
 *
 * Here rather than in `manifest.ts`, so the setup form imports the type
 * without dragging the manifest in (which would defeat the lazy-load — the
 * form would not split into its own chunk).
 */
export type GSetupValues = CoopTurnSetup & {
  // Starting guess budget — shared by the team in coop, each player's own in
  // compete. The dialog offers `GUESS_OPTIONS`; the server accepts 1..9.
  max_guesses: number
  // How many words sit on the board (5..20). Three of them are the
  // hidden secrets; a bigger board means more haystack around the
  // three needles. Validated server-side by `psychicnum.create_game`.
  word_count: number
  // Dictionary difficulty band (1..6 = Universal..Expert), a
  // `common.words.difficulty` value. The board words are sampled from
  // the dictionary at `difficulty ≤ this` (plus a clean + american +
  // non-slang filter). Validated server-side.
  band: number
  // Browser-side timer mode. `none` and `countup` are
  // informational; `countdown` ends the game as a loss when the
  // clock hits 0 (via psychicnum.submit_timeout). Validated
  // server-side by `common._require_valid_timer`.
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
 * Every command psychicnum offers, bound. The info column's action row places
 * them; the menu lists them; each one's key, glyph and availability come from
 * the action, so the surfaces cannot drift.
 */
export type GActions = {
  actHint: Action
  actSpoiler: Action
  actReveal: Action
  actRestart: Action
  actNewGame: Action
  actConcede: Action
  actStopGame: Action
  actPrintBoard: Action
  actBackToClub: Action
}

/**
 * The turn-history view: which past turn, if any, is open on the board, and
 * that turn replayed. Every field but the two callbacks is null (or undefined)
 * while the live board is on screen.
 */
export type GHistoryView = {
  // A past turn is open on the board (`viewedEventId` is set). Everything that
  // would write to the board answers to it: the tiles, keys and Clear/Submit
  // go inert, and the pick and the in-flight dim are not drawn.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a turn — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The viewed turn's board, or null when live.
  tileResults: GTileResults | null
  // The tile the viewed turn decided — ring it; null for a hint or a spoiler.
  litWord: GTileWord | null
  // The banner's text, or null when live.
  label: string | null
  // Whose board is on screen, when it is not mine — which only compete can
  // be: coop is one shared board, so a teammate's row replays the board I am
  // already looking at, and there is no "whose" to answer.
  actor: Actor | undefined
}

/** A past turn, replayed. */
export type GReplayedTurn = {
  // The board as of the END of the viewed turn.
  tileResults: GTileResults
  // The board word this turn's guess decided — ring it history-blue (it already
  // wears its green/red outcome color). Null for a hint / spoiler turn (no tile).
  litWord: GTileWord | null
  // A short, name-free turn label for the viewer banner (the log row shows *who*).
  label: string
  // Who made the turn — whose board this is; null for an id not in the log.
  author: GPlayer | null
}

/**
 * A word on one of the board's tiles (lowercase), as the game deals it: a
 * guess, a secret, the pick. Not every `word` in psychicnum is one — a hint
 * row's `word` is its clue text.
 */
export type GTileWord = string

/**
 * What each decided tile says: its board word → whether that word is one of
 * the secrets. A guessed word is in the map with its verdict (true a find,
 * false a miss); a secret the Reveal shows joins it as true; an undecided
 * tile is absent. The live board and a replayed past turn both draw from one.
 */
export type GTileResults = ReadonlyMap<GTileWord, boolean>

/**
 * Everything that can be SAID about a move in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback.
 */
export type GAnswer =
// My correct guess.
  | { answerType: 'hit'; word: GTileWord }
  // A coop teammate's, on the board we share.
  | { answerType: 'hit_peer'; word: GTileWord }

  // My wrong guess.
  | { answerType: 'miss'; word: GTileWord }
  // A coop teammate's.
  | { answerType: 'miss_peer'; word: GTileWord }

  // I asked for a clue.
  | { answerType: 'hint' }
  // A coop teammate asked for one.
  | { answerType: 'hint_peer' }

  // I asked for a secret word.
  | { answerType: 'spoiler' }
  // A coop teammate had one handed to them.
  | { answerType: 'spoiler_peer' }

  // A compete opponent's secrets-found count ticked up. It has no twin of
  // mine: this is not a row (RLS shows one player nothing of another's) but a
  // public count.
  | { answerType: 'found_peer' }

  // Refused here: this board has already decided that word.
  | { answerType: 'already_guessed' }

/**
 * `common.games.summary_data`, as `psychicnum._rebuild_data_cols` writes it
 * (supabase/sql/psychicnum.sql): the common part, and psychicnum's counts
 * beside it. Every key is always present, null when it has no value, so no key
 * here is optional. The summary (`manifest.ts`'s `summaryFor`) reads it as
 * written, so there is no polished pair and no `Raw`; the play surface reads
 * `game_data` instead (`GGameDataRaw`).
 *
 * `team` is the same group `game_data` carries: the team's finds and guesses in
 * coop, null in compete, whose summary shows no progress. The race's winner is
 * the common `ending.winner`.
 */
export type GSummaryData = SummaryData & {
  team: GTeam | null
  requiredSecretsCount: number
  maxGuesses: number
}
