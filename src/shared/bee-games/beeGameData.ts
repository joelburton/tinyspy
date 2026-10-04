// cs-unmet

import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { SetupRow } from '@/common/setup-form/setupRows'

/**
 * The page blobs the two bee games share, and the one function that turns a
 * `game_data` blob into `gd`. spellingbee and wordwheel write one blob shape
 * (supabase/sql/spellingbee.sql → The page blobs; wordwheel's builders are the
 * same, line for line), so the types and the reading live here once. Each
 * game's `types.ts` names them as its own (`GGameData`, `GPlayer`, …) over
 * its own setup type, and each game's `hooks/useGame.ts` is the one-line
 * binding that calls `makeBeeGameData` — the file to open for the data logic.
 *
 * The `Bee` prefix says these are the bee games' and neither game's alone;
 * a game's own types wear the bare `G` (docs/code-conventions.md → A game's
 * types).
 */

/**
 * A tile as the builder writes it (plans/seat-view.md → A tile is an instance
 * the builder writes): its place, as text, is its id — a wheel's letters may
 * repeat, so the letter cannot be — and the center comes first.
 */
export type BeeTile = {
  id: string
  letter: string
  center: boolean
}

/** A legal word on this board, scored once when the board was built. A bonus
 *  word is legal but not required: it scores and is accepted, and is not the
 *  goal. */
export type BeeWord = {
  word: string
  points: number
  pangram: boolean
  bonus: boolean
}

/**
 * The puzzle this game is played on, frozen at `create_game` and public in
 * both modes: the page judges every typed word against the two lists itself.
 */
export type BeePuzzle = {
  // The board's tiles, the center first.
  tiles: BeeTile[]
  // The letters as the row stores them: the setup rows, the printer and the
  // title read these.
  centerLetter: string
  outerLetters: string
  // Every legal word, the required ones first; the required set (`!bonus`)
  // is the goal and the missed-words reveal; the bonus words are revealed
  // unless `sameBandsAndHaveNoBonus`.
  words: BeeWord[]
  nReqdWords: number
  // The required set's points: the rank ladder's denominator.
  reqdWordsScore: number
  // The required and legal bands are equal, so the bonus words are only what
  // the cleanliness filter removed from the required list: a player who types
  // one scores it, and the game never suggests one — no bonus reveal at the
  // end, and no required/bonus filter on the word list.
  sameBandsAndHaveNoBonus: boolean
}

/**
 * What one player, or the team, has found — the count and the points, bonus
 * included, and the rank that score reaches (`common._rank_idx`) — and the
 * rank they set out for.
 */
export type BeeTeam = {
  nFoundWords: number
  foundWordsScore: number
  rankIdx: number
  // The rank that wins, an index into `RANKS`; null for coop's open hunt. The
  // game's one target, the same on every player: a goal for the board, not
  // part of it.
  targetRankIdx: number | null
}

/** A player as the bee games' game_data shows them: the common player, with
 *  their own finds. A seat has no board of its own: the tiles are the
 *  puzzle's, and a seat's state is its rows and these three counts. */
export type BeePlayerRaw = PlayerRaw & BeeTeam

export type BeePlayer = BeePlayerRaw

/** One found word, as the blob carries it: `gd` turns `userId` into the
 *  player (`BeeFoundWord`). The table has no row id; a row is its player and
 *  its word. */
export type BeeFoundWordRaw = {
  userId: string
  word: string
  points: number
  pangram: boolean
  bonus: boolean
  at: string
}

/** One found word, as `gd` holds it: the blob's row, with its finder. */
export type BeeFoundWord = Omit<BeeFoundWordRaw, 'userId'> & {
  by: BeePlayer
}

/**
 * A bee game's `game_data`, as its `_rebuild_data_cols` writes it: the common
 * part, with the puzzle, the team, every find and the game's facts about each
 * player on top. What the page is handed in `PlayAreaLoaderProps.gameData`;
 * `makeBeeGameData` turns it into `gd`. It carries every player's rows; what
 * a racer may see of a rival mid-race is `makeBeeGameData`'s rule.
 */
export type BeeGameDataRaw<Setup> = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: Setup
  puzzle: BeePuzzle
  // What the team shares; null in compete, where there is no team.
  team: BeeTeam | null
  // Every found word, in the order found, each with its finder.
  foundWords: BeeFoundWordRaw[]
  players: BeePlayerRaw[]
}

/**
 * What the state line shows — the ladder and the figures under it: the team's
 * finds in coop, my own in compete, against the required set and the target.
 * Decided once, in `makeBeeGameData`, so the state line draws it and picks
 * nothing.
 */
export type BeeStateLineData = BeeTeam & {
  nReqdWords: number
  reqdWordsScore: number
}

/*
 * The shape of `gd` for a bee game: the game_data blob with its links turned
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
 *   puzzle: {tiles, tilesById, centerLetter, outerLetters, words, nReqdWords, reqdWordsScore, sameBandsAndHaveNoBonus}
 *   team: {nFoundWords, foundWordsScore, rankIdx, targetRankIdx}   # what the team shares; null in compete
 *   turns                                            # always null: no turn order
 *   ending: {reason, detail, by, winner}             # null while playing; by and winner are players
 *   ended
 *   outcome                                          # null until the game ends
 *   foundWords: [{by, word, points, pangram, bonus, at}, …]   # every find, by a player; my rows only, mid-race
 *   players: [player, …]                             # seat order
 *   playersById
 *   me                                               # same object as playersById[auth.user.id]
 *   stateLineData: {nFoundWords, foundWordsScore, rankIdx, nReqdWords, reqdWordsScore, targetRankIdx}
 *
 * player:
 *   the common player
 *   nFoundWords                                      # own, in every mode
 *   foundWordsScore                                  # own, in every mode
 *   rankIdx                                          # own
 *   targetRankIdx                                    # the rank that wins; the same on every player
 *
 * tile:                                              # puzzle.tiles[], the center first
 *   id                                               # the tile's place, as text
 *   letter
 *   center
 *
 * word:                                              # puzzle.words[], the required ones first
 *   word
 *   points
 *   pangram
 *   bonus                                            # legal but not required
 */

/**
 * **`gd`, the game data** — everything a bee game's play surface knows about
 * THIS game, in one object: the `game_data` blob (`BeeGameDataRaw`), with its
 * links turned into players, the setup rows built, and the seat rule
 * applied. Read-only: `makeBeeGameData` builds it and nothing else writes it.
 */
export type BeeGameData<Setup> = Omit<BeeGameDataRaw<Setup>, 'puzzle' | 'turns' | 'ending' | 'foundWords' | 'players'> & {
  // The puzzle, with its tiles by id beside the list: what a held tile id
  // (a wordwheel claim) is looked up in.
  puzzle: BeePuzzle & { tilesById: ReadonlyMap<string, BeeTile> }
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  turns: { holder: BeePlayer } | null
  // Every find, by player, in the order found; mid-race in compete, my rows
  // only. The page filters it as a reader asks: mine, ours, required, bonus.
  foundWords: BeeFoundWord[]
  ending: {
    reason: NonNullable<GameDataRaw['ending']>['reason']
    detail: string
    by: BeePlayer | null
    winner: BeePlayer | null
  } | null
  // The players in seat order, and the same objects keyed by id.
  players: BeePlayer[]
  playersById: Record<string, BeePlayer>
  // My entry in `playersById`: the same object.
  me: BeePlayer
  stateLineData: BeeStateLineData
}

/** A bee game's `summary_data`: the common part, with the team's progress
 *  (null in compete) and what it is measured against. */
export type BeeSummaryData = SummaryData & {
  team: BeeTeam | null
  nReqdWords: number
  reqdWordsScore: number
  targetRankIdx: number | null
}

/**
 * The seat rule: what a racer may not see yet. Mid-race in compete, a rival's
 * finds are their private list — seeing them would hand over words — so their
 * rows leave the log; their counts and rank stay, since the strip shows them.
 * The game's end opens everything. Coop withholds nothing: one list, one team.
 */
function maySeeRival(raw: BeeGameDataRaw<unknown>): boolean {
  return raw.coop || raw.ended
}

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would. `makeSetupRows` is the game's own, since each
 * game's setup type and rows differ; it is given the players.
 */
export function makeBeeGameData<Setup>(
  raw: BeeGameDataRaw<Setup>,
  myId: string,
  makeSetupRows: (players: BeePlayer[]) => SetupRow[],
): BeeGameData<Setup> {
  const seeRival = maySeeRival(raw)
  const isMine = (id: string) => id === myId

  const players: BeePlayer[] = raw.players
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Links that cannot miss get a bare lookup; an ending's `by` may be null for
  // a timeout.
  const playerOf = (id: string | null) => (id === null ? null : playersById[id]!)

  // Every find is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const foundWords: BeeFoundWord[] = raw.foundWords
    .filter((w) => seeRival || isMine(w.userId))
    .map(({ userId, ...row }) => ({ ...row, by: playersById[userId]! }))

  // The gate has checked that I am seated.
  const me = playersById[myId]!
  // What the state line shows: the team's finds where the game has one, else my
  // own (plans/team-facts.md).
  const teamOrMe = raw.team ?? me

  const { turns, ending, ...rest } = raw
  return {
    ...rest,
    puzzle: { ...raw.puzzle, tilesById: new Map(raw.puzzle.tiles.map((t) => [t.id, t])) },
    setupRows: makeSetupRows(players),
    turns: turns === null ? null : { holder: playersById[turns.holder]! },
    ending: ending === null
      ? null
      : {
        reason: ending.reason,
        detail: ending.detail,
        by: playerOf(ending.by),
        winner: playerOf(ending.winner),
      },
    foundWords,
    players,
    playersById,
    me,
    stateLineData: {
      nFoundWords: teamOrMe.nFoundWords,
      foundWordsScore: teamOrMe.foundWordsScore,
      rankIdx: teamOrMe.rankIdx,
      targetRankIdx: teamOrMe.targetRankIdx,
      nReqdWords: raw.puzzle.nReqdWords,
      reqdWordsScore: raw.puzzle.reqdWordsScore,
    },
  }
}
