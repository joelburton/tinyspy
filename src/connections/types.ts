// cs-unmet

/**
 * connections' types — every type this game exports, in one place, so the
 * data the surface slings around can be read side by side. The `G` says a
 * type is this game's and not the shell's (docs/code-conventions.md → A game's
 * types). A component's props stay with the component; a type one file uses
 * stays in that file; the printer's model stays in `pdf/`; the test fixtures'
 * facts stay in `lib/gameData.fixture.ts`.
 *
 * Two shapes carry the game: `GGameDataRaw` is `game_data` as the builder
 * wrote it (ids), and `GGameData` is what `useGame` makes of it for the
 * surface (players, the seat rule applied). `GPlayer` / `GPlayerRaw` and
 * `GEvent` / `GEventRaw` are the same pair, one level down.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { Mark } from '@/common/board-marks/useMark'
import type { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { TimerMode } from '@/common/manifest/gameManifest'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { CoopTurnSetup } from '@/common/setup-form/SetupCoopStyleSection'
import type { SetupOf } from '@/common/setup-form/setupForm'
import type { SetupRow } from '@/common/setup-form/setupRows'

/**
 * connections' `game_data`, as `connections._rebuild_data_cols` writes it
 * (supabase/sql/connections.sql → The page blobs): the common part, with the
 * puzzle, the log and connections' facts about each player on top. What the
 * page is handed in `PlayAreaLoaderProps.gameData`; `useGame` turns it into
 * `gd`.
 *
 * It carries everything: every player's rows in the log, and every seat's
 * board. What a racer may see of a rival mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  puzzle: GPuzzle
  // What the team shares; null in compete, where there is no team.
  team: GTeam | null
  // The log: every recorded guess, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * The puzzle this game is played on, frozen at `create_game` and public in
 * both modes: the frontend judges each guess against `cats`
 * (`lib/evaluate.ts`).
 */
export type GPuzzle = {
  // Its NYT date (`YYYY-MM-DD`); null for a puzzle that is not one of theirs.
  date: string | null
  cats: GCategory[]
  // The sixteen tiles in this game's shuffle, the same for every player.
  tileOrder: string[]
}

/** A category's difficulty index, 0..3 — NYT's yellow / green / blue /
 *  purple, the band colors in theme.css. */
export type GCatRank = 0 | 1 | 2 | 3

/** One of the four categories. `tiles` is the four-word answer; `name` is
 *  what the band says once the category is matched. */
export type GCategory = {
  rank: GCatRank
  name: string
  tiles: string[]
}

/** A category on a board: the puzzle's, with when its band landed. */
export type GMatchedCat = GCategory & {
  matchedAt: string
}

/**
 * What the team shares in coop (plans/team-facts.md): the two counts summed
 * over every player's own. The budget they count against is `maxMistakes`,
 * on every player.
 */
export type GTeam = {
  nMatchedCats: number
  nMistakes: number
}

/**
 * What the info column's state line shows — "2/4 categories found · 1/4
 * mistakes": the team's counts in coop, my own in compete, against the budget.
 * Decided once, in `makeGameData`, so the line draws it and picks nothing.
 * Named for its reader: this is what to SHOW there, not a fact other
 * components read.
 */
export type GStateLineData = {
  nMatchedCats: number
  nMistakes: number
  maxMistakes: number
}

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player and reads the wire word once (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // The four tiles guessed, in the order they were picked.
  tiles: string[]
  // What this guess WAS — the three-value wire word the column stores.
  result: GGuessResult
  // Set iff the guess matched: the category it named.
  matchedCatRank: GCatRank | null
  at: string
}

/**
 * What a 4-tile guess was — the three values `connections.events.result`
 * stores.
 *
 * Unusually for this roster, the FRONTEND decides which one a guess is: the
 * puzzle is public, so `evaluateGuess` adjudicates locally and sends the
 * verdict up (the FE-knows decision, doc.md → Intro). The column, the RPC's
 * `result` argument and this type are the same three facts.
 */
export type GGuessResult = 'correct' | 'oneAway' | 'wrong'

/**
 * What a 4-tile guess turned out to be (`lib/evaluate.ts`): `correct` (with
 * the matched category's rank, name and tiles), `oneAway` (exactly 3 of the 4
 * belong to one category), or `wrong`.
 *
 * **In the WIRE word**, which is what `connections.events.result` stores and
 * what `submit_guess` takes — so a verdict travels from the evaluator to the
 * column with no translation step in between. What each is WORTH is
 * `lib/answer.ts`'s to say, and every surface asks it rather than this.
 */
export type GEvaluation =
  | {
      result: 'correct'
      rank: GCatRank
      name: string
      tiles: string[]
    }
  | { result: 'oneAway' }
  | { result: 'wrong' }

/** A player as connections' game_data shows them: the common player, with
 *  their own two counts, the budget and this seat's board. */
export type GPlayerRaw = PlayerRaw & {
  // Categories matched: this player's own, in every mode; the team's is
  // `team`'s.
  nMatchedCats: number
  // Mistakes made: this player's own, in every mode; the team's is `team`'s.
  nMistakes: number
  // The mistake budget: the team's in coop, each racer's own in compete. The
  // same on every player.
  maxMistakes: number
  // What this seat's grid shows. One board in coop, each racer's own in
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
 *   oneBoard
 *   title
 *   setup
 *   setupRows
 *   puzzle: {date, cats, tileOrder}       # frozen at create_game; public in both modes
 *   team: {nMatchedCats, nMistakes}       # what the team shares; null in compete
 *   turns: {holder}                       # null: no turn order; holder is a player
 *   ending: {reason, detail, by, winner}  # null while playing; by and winner are players
 *   ended
 *   outcome                               # null until the game ends
 *   events: [{id, by, tiles, result, outcome, matched, matchedCatRank, at}, …]   # the log, by a player; my rows only, mid-race
 *   players: [player, …]                  # seat order
 *   playersById
 *   me                                    # same object as playersById[auth.user.id]
 *   stateLineData: {nMatchedCats, nMistakes, maxMistakes}  # what the state line shows: the team's in coop, my own in compete
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
 *   nMatchedCats                          # own, in every mode
 *   nMistakes                             # own, in every mode
 *   maxMistakes                           # the same on every player
 *   board: {matchedCats, tilesLeft}       # what this seat's grid shows; null for a rival mid-race
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players, the setup rows
 * built, each log row read once, and the seat rule applied: what I may not
 * see yet is not here. Read-only: `useGame` builds it and nothing else writes
 * it. The picks are not in it — they are live Broadcast state, which
 * `useGame` hands back beside it.
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
  // What the state line shows: the team's counts in coop, my own in compete.
  stateLineData: GStateLineData
}

/** One player of this game, as `gd` holds them: the blob's player, with the
 *  board withheld — null — for a rival mid-race. */
export type GPlayer = Omit<GPlayerRaw, 'board'> & {
  board: GBoard | null
}

/**
 * What one seat's grid shows: the bands, in the order they were matched, and
 * the tiles still loose, in the puzzle's order. A band IS a `result =
 * 'correct'` row joined to the puzzle's category by rank; a tile is on the
 * grid until its category has one.
 */
export type GBoard = {
  matchedCats: GMatchedCat[]
  tilesLeft: string[]
}

/**
 * One row of the log, as `gd` holds it: the blob's row, with its player and
 * the two readings of the wire word — derived once, where the blob is read,
 * so no consumer re-decides either.
 */
export type GEvent = Omit<GEventRaw, 'userId'> & {
  // Who guessed.
  by: GPlayer
  // How this guess READS — the shared vocabulary, from `lib/answer.ts`, the
  // one place that decides it. A tile fill, a log row and a PDF cell all want
  // the same colors the rest of the app uses.
  outcome: Outcome
  // Whether this guess MATCHED a category — the rules question, answered once
  // here so downstream asks neither the wire word nor a color.
  matched: boolean
}

/**
 * connections' per-game setup — what the start-game dialog collects,
 * persisted to `common.games.setup` and validated in `connections.create_game`.
 *
 * `puzzle_id` is OPTIONAL, and absent is the normal case: that is how
 * `create_game` is told to derive the next puzzle none of the seated players
 * has played (`connections.next_puzzle_for_club`). Present, it is honored —
 * the setup dialog's date field, and the pgTAP and e2e fixtures pinning a
 * puzzle. `coop_style` and `first_turn_user_id` are the shared coop-pacing
 * pair (`CoopTurnSetup`).
 */
export type GSetupValues = CoopTurnSetup & {
  puzzle_id?: string
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
 * What both puzzle-picker RPCs put in `data` — `next_puzzle_for_club` and
 * `puzzle_for_date`, which answer in the same shape so the shared
 * `<SetupNextPuzzleSection>` can take either.
 *
 * ONE answer: there is a puzzle. Not finding one is a not-ok, not a quieter
 * success — PN302 for a spent archive, PN303 for a date with nothing on it —
 * because it blocks starting a game and the thing that fixes it is a control on
 * the form.
 */
export type GPuzzleAnswer = {
  result: 'found'
  puzzle: { id: string; puzzle_date: string; label: string }
}

/**
 * The guess being assembled: who holds which tiles, and the two senders.
 * Coop shares them over the picks room; compete keeps them on this client
 * (`useGame`). Live Broadcast state with no row behind it, which is why it
 * rides beside `gd` rather than in it.
 */
export type GPicks = {
  // One entry per player holding tiles, in pick order.
  byUser: GPickMap
  // Every held tile, flattened in pick order — what Submit sends.
  union: string[]
  // Picked tile → the id of who picked it; a tile nobody holds is absent.
  tileToPickerId: ReadonlyMap<string, string>
  toggleTile: (tile: string) => void
  sendClear: () => void
}

/** Who has picked what: one entry per player holding tiles, in pick order. A
 *  player holding none is absent rather than present-and-empty. */
export type GPickMap = ReadonlyMap<string, string[]>

/**
 * A change to the shared picks, as it travels over the connections channel.
 * The `type` words are the wire's.
 *
 * `unpick` carries no user id on purpose: a tile comes out of whoever's
 * picks hold it, which is the coop click rule and not something the sender
 * needs to know.
 */
export type GPickEvent =
  | { type: 'pick'; tile: string; userId: string }
  | { type: 'unpick'; tile: string }
  | { type: 'clear' }

/**
 * Every command connections offers, bound once: the info column's action row
 * places them, the menu lists them, and their keys fire them — all reading the
 * same action, so the surfaces cannot drift.
 */
export type GActions = {
  // Each key is spelled as its action's id (`act-reveal` → `actReveal`), so a
  // grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Unfold or fold the inline hint list; its words move with it. Gone, row
  // and button, once you can no longer submit.
  actHint: Action
  // Show the categories nobody got — or put them away, bringing back the board
  // as the game ended. A local display toggle, no RPC; it carries its own
  // faces, the inert "solution already shown" included.
  actReveal: Action
  // Solve THIS puzzle again from scratch — same sixteen tiles, same shuffle.
  actRestart: Action
  // Start the NEXT unplayed daily puzzle — connections' archive is dated, so
  // this walks forward rather than re-rolling a puzzle. Disables itself while
  // the create is in flight.
  actNewGame: Action
  // Drop out of a race while the others play on — hidden outside compete.
  actConcede: Action
  // Stop the game for the whole table — coop's exit; it hides itself in a race.
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
 * that turn's board rebuilt. Every field but the two callbacks is null (or
 * undefined) while the live board is on screen.
 */
export type GHistoryView = {
  // A past turn is open on the board (`viewedEventId` is set). Everything that
  // would write to the board answers to it: the commands hide, the picks are
  // not drawn, a teammate's verdict is not marked.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a turn — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The board at the viewed turn, or null when live.
  board: GBoard | null
  // The viewed turn's four tiles, lit in what the turn was; null when live.
  litTiles: Set<string> | null
  litOutcome: Outcome | null
  // The banner's text, or null when live.
  label: string | null
  // Whose board is on screen, when it is not mine — which only compete can
  // be: coop is one shared board, so a teammate's row replays the board I am
  // already looking at, and there is no "whose" to answer.
  actor: GPlayer | undefined
}

/** The answer to the last guess, worn by the four tiles it covered. */
export type GBoardVerdict = {
  tiles: ReadonlySet<string>
  // ANY outcome, because the mark wears its PILL's outcome — the two are one
  // message — and the pill speaks the full vocabulary.
  outcome: Outcome
}

/** What `useVerdictMark` hands back: the mark, and the two ways to change it. */
export type GVerdictMark = {
  // The mark to draw, or null — gone with its slot entry, or when nothing is
  // being judged. `BoardCol` hands it to `<Board verdict>`.
  mark: Mark<GBoardVerdict> | null
  // Color these tiles in this outcome and, with a message, show it in the
  // local slot as the same thing.
  markTiles: (o: {
    tiles: readonly string[]
    outcome: Outcome
    message: FeedbackMessage | null
  }) => void
  // Take the mark off now.
  clear: () => void
}

/** A past turn, replayed (`lib/history.ts`). */
export type GReplayedTurn = {
  // The board at the moment the turn was submitted: the bands matched
  // STRICTLY BEFORE it, and every other tile still loose — this turn's four
  // included even when it was correct.
  board: GBoard
  // The four tiles this turn guessed — light them by what it was.
  litTiles: Set<string>
  // What this turn was WORTH (`lib/answer.ts`'s answer, off the row) — the tint
  // the lit tiles take, in the same shared verdict color a live answer wears.
  outcome: Outcome
  // A short, name-free turn label for the viewer banner (the log row shows
  // *who*).
  label: string
}

/**
 * Everything that can be SAID about a move in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback.
 */
export type GAnswer =
  // My guess matched a category.
  | { answerType: 'correct' }
  // A coop teammate's did, on the board we share.
  | { answerType: 'correct_peer' }

  // Three of my four were in one category.
  | { answerType: 'one_away' }
  // Three of a coop teammate's four were.
  | { answerType: 'one_away_peer' }

  // My guess matched nothing.
  | { answerType: 'wrong' }
  // A coop teammate's matched nothing.
  | { answerType: 'wrong_peer' }

  // Refused here: this set of four was already tried.
  | { answerType: 'already_tried' }

/**
 * `common.games.summary_data`, as `connections._rebuild_data_cols` writes it
 * (supabase/sql/connections.sql): the common part, and connections' keys
 * beside it. Every key is always present, null when it has no value, so no
 * key here is optional. The summary (`manifest.ts`'s `summaryFor`) reads it
 * as written, so there is no polished pair and no `Raw`; the play surface
 * reads `game_data` instead (`GGameDataRaw`).
 *
 * `team` is the same group `game_data` carries: the team's counts in coop,
 * null in compete, whose summary shows no progress (the winner is the common
 * `ending.winner`).
 */
export type GSummaryData = SummaryData & {
  team: GTeam | null
  maxMistakes: number
}
