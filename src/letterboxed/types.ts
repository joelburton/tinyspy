// cs-unmet

/**
 * letterboxed's types — every type this game exports, in one place, so the
 * data the surface slings around can be read side by side. The `G` says a type
 * is this game's and not the shell's (docs/code-conventions.md → A game's
 * types). A component's props stay with the component; a type one file uses
 * stays in that file; the printer's model stays in `pdf/`; the test fixtures'
 * facts stay in the fixture file.
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
 * One letter of the box: its id is the letter itself, since a board never
 * repeats one, and `side` is which of the four sides it sits on (0–3, in side
 * order). Two letters may stand next to each other in a word only when their
 * sides differ.
 */
export type GTile = {
  id: string
  letter: string
  side: number
}

/** A word the board accepts, and whether a hint may offer it: `clean` is the
 *  must-reach tier (docs/word-list.md → Which words a game may use). */
export type GWord = {
  word: string
  clean: boolean
}

/**
 * letterboxed's `game_data` and `static_game_data`, as its builders write them
 * (supabase/sql/letterboxed.sql → The page blobs): the common part, with the
 * puzzle, the team, the log and letterboxed's facts about each player on top.
 * `useGame` merges the two blobs the page hands down and turns them into
 * `gd`.
 *
 * It carries everything: every player's rows in the log, and every seat's
 * chain. What a racer may see of a rival mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  // The board, frozen at create.
  puzzle: {
    // The box's twelve tiles, in side order.
    tiles: GTile[]
    // Every word the board accepts.
    words: string[]
    // The few of `words` a hint may not offer — the list is kept short by
    // naming the exceptions; `useGame` flags each word instead.
    uncleanWords: string[]
    // The fewest words that solve the board: always 2, the seeded pair.
    nParWords: number
    // The seeded pair. Null until the game ends.
    solution: string[] | null
  }
  // What the team shares; null in compete, where there is no team.
  team: GTeam | null
  // The log: every move and every hint or spoiler, in the order of play.
  events: GEventRaw[]
  players: GPlayerRaw[]
}

/**
 * What the team shares in coop (plans/team-facts.md): the one chain's two
 * counts. In coop a chain is the team's, so a coop player carries neither.
 */
export type GTeam = {
  nWordsUsed: number
  nCoveredLetters: number
}

/**
 * What the state line shows — "Letters 7/12 · Words (par 2) 3/5": the team's
 * chain in coop, my own in compete, against the cap and par. Decided once, in
 * `makeGameData`, so the line draws it and picks nothing. Named for its
 * reader: this is what to SHOW there, not a fact other components read.
 */
export type GStateLineData = {
  nCoveredLetters: number
  nWordsUsed: number
  maxWords: number
  nParWords: number
}

/**
 * Every answer letterboxed gives, mine and a teammate's — the whole roster of
 * what this game tells anybody about a move. `lib/answer.ts` says what each
 * one reads as (docs/outcomes.md → How a game does it). The words are the
 * move RPCs' `result`s, and the row's `kind` for a hint and a spoiler.
 *
 * The frontend's own refusals are deliberately absent. `rejectReason` turns a
 * word away before the RPC is called and the hint ladder can find no word to
 * offer: nothing is written down, and the pill is the only surface.
 */
export type GAnswer =
  // My word joined the chain. It restates how many words are left under the
  // cap, since a phone has nowhere else to show it; a cap-filling word says
  // nothing (`nWordsLeft` 0), as the chain-full note is what to read then.
  | { answerType: 'accepted'; word: string; nWordsLeft: number }
  // A coop teammate's did, with how much of the board the chain now covers.
  | { answerType: 'accepted_peer'; word: string; nCoveredLetters: number }
  // My word covered the twelve. It says nothing: the ending's message does.
  | { answerType: 'solved' }
  // I took my last word back. It says nothing: the chain strip shows it.
  | { answerType: 'undone' }
  // A teammate took theirs back — named, since the team's board just lost it.
  | { answerType: 'undone_peer'; word: string }
  // A teammate emptied the chain.
  | { answerType: 'cleared_peer' }
  // The hint ladder's rungs: a hint describes the next word, a spoiler is it.
  | { answerType: 'hint'; word: string }
  | { answerType: 'hint_peer' }
  | { answerType: 'spoiler'; word: string }
  | { answerType: 'spoiler_peer' }

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player (`GEvent`). */
export type GEventRaw = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  kind: 'word' | 'undo' | 'clear' | 'hint' | 'spoiler'
  // The word played, taken back, hinted or spoiled; null for a clear, which
  // is about the whole chain.
  word: string | null
  // How many of the twelve the chain covered after this row.
  nCoveredLetters: number
  // Whether it spent the player's go: a word, an undo and a clear do; a hint
  // and a spoiler are asks.
  tookTurn: boolean
  at: string
}

/** A player as letterboxed's game_data shows them: the common player, with the
 *  cap, the hints and spoilers they took, this seat's chain, and — a racer
 *  only — that chain's two counts. */
export type GPlayerRaw = PlayerRaw & {
  // The chain-length cap. The same on every player.
  maxWords: number
  // This racer's chain. Compete only: a coop chain is the team's (`GTeam`),
  // and a coop player has no such keys.
  nWordsUsed?: number
  nCoveredLetters?: number
  // Taken by this player, in every mode; both are coop-only asks.
  nHintsUsed: number
  nSpoilersUsed: number
  // What this seat sees: the one shared chain in coop, each racer's own in
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
 *   puzzle:                                  # frozen at create
 *     tiles: [tile, …]                       # the box, in side order
 *     tilesById
 *     words: [{word, clean}, …]              # the blob's words and uncleanWords, joined
 *     nParWords
 *     solution: [wordA, wordB]               # null until the game ends
 *   team: {nWordsUsed, nCoveredLetters}      # the shared chain's; null in compete
 *   turns: {holder}                          # null: no turn order; holder is a player
 *   ending: {reason, detail, by, winner}     # null while playing; by and winner are players
 *   ended
 *   outcome                                  # null until the game ends
 *   events: [event, …]                       # my rows only, mid-race
 *   players: [player, …]                     # seat order
 *   playersById
 *   me                                       # same object as playersById[auth.user.id]
 *   stateLineData: {nCoveredLetters, nWordsUsed, maxWords, nParWords}   # the team's in coop, mine in compete
 *
 * player:
 *   the common player
 *   maxWords                                 # the same on every player
 *   nWordsUsed                               # compete only: this racer's chain
 *   nCoveredLetters                          # compete only: this racer's chain
 *   nHintsUsed                               # own
 *   nSpoilersUsed                            # own
 *   board: {words}                           # this seat's chain, the shared one in coop; null for a rival mid-race
 *
 * tile:                                      # GTile
 *   id                                       # the letter
 *   letter
 *   side                                     # 0–3
 *
 * event:
 *   id
 *   by
 *   kind                                     # word / undo / clear / hint / spoiler
 *   word                                     # null for a clear
 *   nCoveredLetters                          # after this event
 *   tookTurn
 *   at
 */

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the `game_data` blob the game's builder wrote
 * (`GGameDataRaw`), with its links turned into players, the word list
 * flagged, the setup rows built, and the seat rule applied: what I may not
 * see yet is not here. Read-only: `useGame` builds it and nothing else writes
 * it.
 */
export type GGameData = Omit<GGameDataRaw, 'puzzle' | 'turns' | 'ending' | 'events' | 'players'> & {
  puzzle: Omit<GGameDataRaw['puzzle'], 'words' | 'uncleanWords'> & {
    // The same tiles, keyed by id (the letter).
    tilesById: Record<string, GTile>
    // Every word the board accepts, each flagged for whether a hint may offer
    // it.
    words: GWord[]
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
  // My entry in `playersById`: the same object. My own chain is always mine
  // to see.
  me: GPlayer & { board: GBoard }
  // What the state line shows: the team's chain in coop, my own in compete.
  stateLineData: GStateLineData
}

/** One player of this game, as `gd` holds them: the blob's player, with the
 *  chain withheld — null — for a rival mid-race. */
export type GPlayer = Omit<GPlayerRaw, 'board'> & {
  board: GBoard | null
}

/** What one seat sees: the chain, in the order played. */
export type GBoard = {
  words: string[]
}

/** One row of the log, as `gd` holds it: the blob's row, with its player. */
export type GEvent = Omit<GEventRaw, 'userId'> & {
  // Who did it.
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
  // The two rungs of the hint ladder, coop only: a hint describes the next
  // word on a shortest path, a spoiler hands it over.
  actHint: Action
  actSpoiler: Action
  // Show the seeded pair — or put it away again. A local display toggle, no
  // RPC.
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
 * The turn-history view (`hooks/useHistoryView.ts`): which past move is open
 * on the board, and the chain as it stood after it.
 */
export type GHistoryView = {
  // A past move is open on the board (`viewedEventId` is set): the board and
  // the entry take no move while it is.
  isViewing: boolean
  // The log row open on the board (`events.id`), or null when live.
  viewedEventId: number | null
  // Open a move — the log's `#N` click, with the number it printed beside it.
  show: (id: number, n: number | null) => void
  // Back to the live board — the banner's ✕, or any click or key.
  exit: () => void
  // The chain after the viewed move, or null when live.
  words: string[] | null
  // The banner's words for the viewed move, or null when live.
  label: string | null
  // Whose chain is on screen, when it is not mine — only a compete game's end
  // opens a rival's.
  actor: GPlayer | undefined
}

/**
 * letterboxed's per-game setup — collected by the start-game dialog, persisted
 * to `common.games.setup`, validated server-side in `letterboxed.create_game`.
 *
 * **Mode is NOT on this type** — it's locked at the gametype level (the
 * sibling-manifest pattern), not a setup-time choice.
 *
 * Two knobs, and the difference between them is worth reading twice:
 *
 *   - `extra_words` — how many words ABOVE PAR you allow yourself. Every board
 *     is solvable in two, so par is 2 and the cap is `2 + extra_words`. This
 *     is the knob players can actually reason about: "solve it in 5" means
 *     nothing on its own, while "par is 2, you get 3 spare" says exactly how
 *     much room there is. Lower = harder.
 *   - `legal_band` — the dictionary band a word must be in to be ACCEPTED.
 *     NOTE THE DIRECTION: a HIGHER band makes the game EASIER, because more
 *     legal words means more escape routes off an awkward tail letter. (Median
 *     playable words per board runs ~280 at band 1 to ~850 at band 5.) That is
 *     the same inversion strands' band has.
 *
 * Plus `custom_sides` — an OPTIONAL player-chosen board (see below).
 */
export type GSetupValues = CoopTurnSetup & {
  timer: TimerMode
  // Words allowed ABOVE par, 0..5. The cap is `PAR + extra_words`.
  extra_words: number
  // Dictionary band a word must be in to count, 1..6. Higher = EASIER.
  legal_band: number
  // An OPTIONAL player-chosen board: twelve distinct letters, stored
  // normalized (lowercase, no separators — `cleanSides`) in the same
  // clockwise-from-top-left order `letterboxed.games.sides` uses. Blank/absent
  // means the usual random board — the edge function samples a seed as it
  // always has. Set it and the builder plays exactly this board, which is how
  // you send a friend one you liked.
  //
  // WHAT MAKES THIS DIFFERENT FROM THE OTHER GAMES' CUSTOM BOARDS: a
  // letterboxed board has to be KNOWN SOLVABLE IN TWO, and twelve arbitrary
  // letters almost never are. So the builder does not take your word for it —
  // it looks the twelve letters up in `letterboxed.seeds` (whose primary key
  // IS the sorted twelve) to recover the chained pair that solves them, and
  // checks that pair is still playable under the sides you typed. A board that
  // came out of this game is in that table BY CONSTRUCTION, so the re-share
  // case never fails; a mistyped one is rejected at Start.
  //
  // That lookup is also why nothing downstream is special-cased: `solution`
  // gets a real pair, so par stays 2, the reveal works, and the PDF prints
  // "Solvable in two" exactly as it does for a rolled board.
  //
  // Only the SHAPE is checked here (`customSidesError`); whether the letters
  // are a board we can prove is a seed-table question the frontend can't
  // answer without a round trip, so the edge function owns it — the same
  // division wordiply's `customBaseError` makes.
  //
  // Not saved as the club's next default: `create_game` strips it before
  // handing the setup to `common._create_game`. A one-off, not a baseline —
  // otherwise every later Start would silently rebuild this same board.
  custom_sides?: string
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
 * `common.games.summary_data`, as `letterboxed._rebuild_data_cols` writes it
 * (supabase/sql/letterboxed.sql): the common part, and letterboxed's keys
 * beside it. Every key is always present, null when it has no value, so no
 * key here is optional. The summary (`manifest.ts`'s `summaryFor`) reads it as
 * written, so there is no polished pair and no `Raw`; the play surface reads
 * `game_data` instead (`GGameDataRaw`).
 *
 * `team` is the same group `game_data` carries, null in compete. The other
 * three are compete's, null in coop: the best chain's coverage so far, and the
 * winner's chain (the winner is the common `ending.winner`) — its length once
 * a racer has solved, its coverage on a solve or a timeout. `band` is the
 * setup's dictionary band.
 */
export type GSummaryData = SummaryData & {
  team: GTeam | null
  maxWords: number
  band: number
  nBestCoveredLetters: number | null
  nWinnerWords: number | null
  nWinnerCoveredLetters: number | null
}
