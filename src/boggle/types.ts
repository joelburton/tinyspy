// cs-unmet

/**
 * boggle's types — every type this game exports, in one place, so the data
 * the surface slings around can be read side by side. The `G` says a type is
 * this game's and not the shell's (docs/code-conventions.md → A game's types).
 * A component's props stay with the component; a type one file uses stays in
 * that file; the printer's model stays in `pdf/`; the test fixtures' facts
 * stay in the fixture file.
 *
 * Two shapes carry the game: `GGameDataRaw` is the two blobs as the builders
 * wrote them (ids, records), and `GGameData` is what `useGame` makes of it for
 * the surface (players, maps, the seat rule applied). `GPlayer` / `GPlayerRaw`
 * and `GFoundWord` / `GFoundWordRaw` are the same pair, one level down.
 */

import type { GameDataRaw, PlayerRaw } from '../common/game-page/gameData.ts'
import type { SummaryData } from '../common/manifest/summaryData.ts'
import type { TimerMode } from '../common/manifest/types.ts'
import type { SetupOf, SetupRow } from '../common/setup-form/types.ts'
import type { LADDERS } from './lib/solver.ts'

/**
 * boggle's `game_data` and `static_game_data`, as its builders write them
 * (supabase/sql/boggle.sql → The page blobs): the common part, with the
 * puzzle, the team, every find and boggle's facts about each player on top.
 * `useGame` merges the two blobs the page hands down and turns them into
 * `gd`. It carries every player's rows; what a racer may see of a
 * rival mid-race is `useGame`'s rule.
 */
export type GGameDataRaw = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: GSetup
  puzzle: GPuzzle
  // What the team shares; null in compete, where there is no team.
  team: GTeam | null
  // Every found word, in the order found, each with its finder.
  foundWords: GFoundWordRaw[]
  players: GPlayerRaw[]
}

/** A tile as the builder writes it (plans/seat-view.md → A tile is an
 *  instance the builder writes): its id is its cell's index, row by row. */
export type GTile = {
  id: string
  // The letters the tile spells, in the data's case: "a", "qu". Null for a
  // blank, which spells nothing.
  letters: string | null
}

/** A legal word on this board, scored once when the board was built. A bonus
 *  word is legal but not required: it scores and is accepted, and is not the
 *  goal. */
export type GWord = {
  word: string
  points: number
  bonus: boolean
}

/** The puzzle this game is played on, frozen at `create_game` and public in
 *  both modes: the page judges every typed word against the words itself. */
export type GPuzzle = {
  // The board's tiles, row by row.
  tiles: GTile[]
  boardSideSize: number
  minWordLength: number
  // Every legal word, the required ones first; the required set (`!bonus`)
  // is the goal.
  words: GWord[]
  nReqdWords: number
  reqdWordsScore: number
  nBonusWords: number
  bonusWordsScore: number
}

/**
 * What one player, or the team, has found: every find, then the required and
 * bonus finds apart. A target counts the required points alone; the strip and
 * a race with no target count them all.
 */
export type GTeam = {
  nFoundWords: number
  foundWordsScore: number
  nFoundReqdWords: number
  foundReqdWordsScore: number
  nFoundBonusWords: number
  foundBonusWordsScore: number
}

/** A player as boggle's game_data shows them: the common player, with their
 *  own finds. A seat has no board of its own: the tiles are the puzzle's. */
export type GPlayerRaw = PlayerRaw & GTeam

export type GPlayer = GPlayerRaw

/** One found word, as the blob carries it: `gd` turns `userId` into the
 *  player (`GFoundWord`). A row is its player and its word. */
export type GFoundWordRaw = {
  userId: string
  word: string
  points: number
  bonus: boolean
  at: string
}

/** One found word, as `gd` holds it: the blob's row, with its finder. */
export type GFoundWord = Omit<GFoundWordRaw, 'userId'> & {
  by: GPlayer
}

/**
 * What the state line shows — its four cells' found and total figures: the
 * team's finds in coop, my own in compete, against both word lists. Decided
 * once, in `makeGameData`, so the state line draws it and picks nothing.
 */
export type GStateLineData = {
  nFoundReqdWords: number
  foundReqdWordsScore: number
  nFoundBonusWords: number
  foundBonusWordsScore: number
  nReqdWords: number
  reqdWordsScore: number
  nBonusWords: number
  bonusWordsScore: number
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
 *   puzzle:
 *     tiles: [tile, …]                       # row by row
 *     tilesById
 *     traceBoard                             # the board as lib/boardTrace.ts walks it
 *     boardSideSize
 *     minWordLength
 *     words: [word, …]                       # the required ones first
 *     nReqdWords
 *     reqdWordsScore
 *     nBonusWords
 *     bonusWordsScore
 *   team                                     # null in compete
 *     nFoundWords
 *     foundWordsScore
 *     nFoundReqdWords
 *     foundReqdWordsScore
 *     nFoundBonusWords
 *     foundBonusWordsScore
 *   turns                                    # always null: no turn order
 *   ending: {reason, detail, by, winner}     # null while playing; by and winner are players
 *   ended
 *   outcome                                  # null until the game ends
 *   foundWords: [{by, word, points, bonus, at}, …]   # every find, by a player; my rows only, mid-race
 *   players: [player, …]                     # seat order
 *   playersById
 *   me                                       # same object as playersById[auth.user.id]
 *   stateLineData
 *     nFoundReqdWords
 *     foundReqdWordsScore
 *     nFoundBonusWords
 *     foundBonusWordsScore
 *     nReqdWords
 *     reqdWordsScore
 *     nBonusWords
 *     bonusWordsScore
 *
 * player:
 *   the common player
 *   nFoundWords                              # own, in every mode
 *   foundWordsScore
 *   nFoundReqdWords
 *   foundReqdWordsScore
 *   nFoundBonusWords
 *   foundBonusWordsScore
 *
 * tile:                                      # puzzle.tiles[], row by row
 *   id                                       # the cell's index, as text
 *   letters                                  # "a", "qu"; null for a blank
 *
 * word:                                      # puzzle.words[], the required ones first
 *   word
 *   points
 *   bonus                                    # legal but not required
 */

/**
 * **`gd`, the game data** — everything boggle's play surface knows about THIS
 * game, in one object: the `game_data` blob (`GGameDataRaw`), with its links
 * turned into players, the setup rows built, and the seat rule applied.
 * Read-only: `makeGameData` builds it and nothing else writes it.
 */
export type GGameData = Omit<GGameDataRaw, 'puzzle' | 'turns' | 'ending' | 'foundWords' | 'players'> & {
  // The puzzle, with its tiles by id beside the list — what a held tile id is
  // looked up in — and the board as the tracer walks it.
  puzzle: GPuzzle & { tilesById: ReadonlyMap<string, GTile>; traceBoard: GBoard }
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  turns: { holder: GPlayer } | null
  // Every find, by player, in the order found; mid-race in compete, my rows
  // only.
  foundWords: GFoundWord[]
  ending: {
    reason: NonNullable<GameDataRaw['ending']>['reason']
    detail: string
    by: GPlayer | null
    winner: GPlayer | null
  } | null
  // The players in seat order, and the same objects keyed by id.
  players: GPlayer[]
  playersById: Record<string, GPlayer>
  // My entry in `playersById`: the same object.
  me: GPlayer
  stateLineData: GStateLineData
}

/** boggle's `summary_data`: the common part, with the team's progress (null in
 *  compete), the target, and compete's top score. */
export type GSummaryData = SummaryData & {
  team: GTeam | null
  // The share of the required points that wins; null for no target.
  targetWinPercent: number | null
  // The best score among those who did not concede; null in coop, and until
  // the game ends.
  topScore: number | null
}

/**
 * The setup blob the dialog collects and `boggle.create_game` validates. `mode`
 * is NOT here — it's a top-level manifest/RPC arg (the sibling-pair split).
 * `constraints` are the optional board-generation targets (min/max words, score,
 * longest word) measured against the required words.
 */
export type GSetupValues = {
  timer: TimerMode
  dice_set: string
  // required-word difficulty band, 1 (universal) … 6 (expert) — the words the
  // board generator guarantees are findable (clean: american, no slur/crude/slang)
  band: number
  // legal (bonus) difficulty band, `band`…6 — the ceiling for words that aren't
  // required but still score. Filters on difficulty ONLY (any dialect/slur/
  // crude/slang qualifies), so it's the wider net of "real words you might find".
  legal_band: number
  min_word_length: number
  scoring_ladder: GLadderName
  // Win-on-target: the percent of the required-words SCORE a player (compete)
  // or the team (coop) must reach to win — one of 50, 55, … 100 — or `null`
  // for "no target" (play until Stop or the timer expires). Measured
  // against the score of the REQUIRED words found ONLY — bonus finds don't
  // count — so 100% means every required word, 50% means required finds worth
  // half the required total.
  win_percent: number | null
  constraints?: GBoardConstraints
  // An OPTIONAL player-typed board — the tiles themselves, written the way the
  // `Letters` setup row prints them (`"ABQuD EFGH IJKL MNOP"`; see `lib/customBoard.ts`).
  // Set → the edge function solves exactly this board instead of rolling one;
  // blank/absent → the normal roll. Either mode.
  //
  // Stored AS TYPED rather than as the internal face string: the field has to
  // survive half-finished input (you can't hold a partial board in a canonical
  // encoding), and keeping the text means what you pasted is what you see. The
  // server re-parses — it never trusts the client's reading.
  //
  // Because the player chose the tiles, a custom board skips BOTH the
  // `constraints` targets (nothing is being rejection-sampled) and the roll
  // loop's quality bar; it need only yield ≥1 required word, or `win_percent`
  // would compute a threshold of zero. It is NOT saved as the club's next
  // default — a one-off, not a new baseline (see `boggle.create_game`).
  custom_board?: string
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
 * Everything that can be SAID about a word in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback. `word` is lowercase, as the engine and the rows carry it.
 */
export type GAnswer =
  // My word counted.
  | { answerType: 'accepted'; word: string; points: number; bonus: boolean }
  // A coop teammate's did, off `found_words`.
  | { answerType: 'accepted_peer'; word: string; points: number; bonus: boolean }

  // Already found — by anyone in coop, by me in compete.
  | { answerType: 'already_found'; word: string; bonus: boolean }
  // Shorter than this board's minimum.
  | { answerType: 'too_short'; word: string }

  // Not in the list, by why: no path on the board spells it…
  | { answerType: 'not_on_board'; word: string }
  // …or a path does, and it is simply not a word.
  | { answerType: 'not_a_word'; word: string }

/** Where the typed word's letters can sit, and how far the board follows it. */
export type GTraceCells = {
  // Cells no route can avoid — one per letter position that has a single candidate.
  settled: number[]
  // Cells that carry a letter position with more than one candidate.
  maybe: number[]
  // How many letters the board can actually spell, from the start. Equal to the
  // word's length while it still traces; the letters past it are the ones the
  // board cannot follow, and the entry box dims them.
  reach: number
}

/** The name of a scoring ladder (`LADDERS`, `lib/solver.ts`). */
export type GLadderName = keyof typeof LADDERS

/** The optional targets a rolled board is rejection-sampled against, measured
 *  on its required words; the setup's `constraints`. */
export type GBoardConstraints = {
  minWordLength?: number
  ladder?: GLadderName
  minWords?: number
  maxWords?: number
  minScore?: number
  maxScore?: number
  minLongest?: number
  maxLongest?: number
}

/** A board ready to solve. `first`/`second` hold letter indices (0–25) per tile;
 *  `first[cell]` is -1 for a **blank** tile (matches nothing), and `second[cell]`
 *  is -1 for a normal tile or the second letter of a multiface tile. `n` is the
 *  side length (board is `n × n`). */
export type GBoard = {
  n: number
  first: Int8Array
  second: Int8Array
}

/** A dice set (`DICE_SETS`, `lib/dice.ts`). */
export type GDiceSet = {
  // registry key (also the value stored in a game's setup)
  name: string
  // player-facing label
  desc: string
  // board side length; board is n × n
  n: number
  // one 6-char face string per die; length === n * n
  dice: readonly string[]
}

/** A word the solver finds on a board while it is built, with its points; the
 *  board's required and bonus lists are made of these. */
export type GSolverWord = {
  word: string
  points: number
}
