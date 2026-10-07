// cs-unmet

import type { FactsApart, GameDataRaw, GameEnding, PlayerRaw } from '@/common/game-page/gameData'
import { makeEnding } from '@/common/game-page/makeEnding'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { SetupRow } from '@/common/setup-form/types'
import { RANKS } from '@/shared/rank-ladder/rankLadder'

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
  // is the goal.
  words: BeeWord[]
  nReqdWords: number
  // The required set's points: the rank ladder's denominator.
  reqdWordsScore: number
}

/**
 * A bee game's facts as the builders write them (docs/common-schema.md → A
 * player's facts): what one player, or the team, has found — the count and the
 * points, bonus included, and the rank that score reaches (`common._rank_idx`)
 * — and the rank they set out for. The required set they count against is the
 * puzzle's, the same for every side.
 */
export type BeeFactsRaw = {
  nFoundWords: number
  foundWordsScore: number
  rankIdx: number
  // The rank that wins, an index into `RANKS`; null for coop's open hunt. The
  // game's one target, the same on every player: a goal for the board, not
  // part of it.
  targetRankIdx: number | null
}

/** The names of a side's two ranks, from `RANKS`. */
export type BeeRankNames = {
  rankName: string
  // Null for coop's open hunt.
  targetRankName: string | null
}

/** A bee game's facts as `gd` holds them: the blob's, with the names of the
 *  two ranks beside their indexes. */
export type BeeFacts = BeeFactsRaw & BeeRankNames

/** A player as the bee games' game_data shows them: the common player, with
 *  their own finds. A seat has no board of its own: the tiles are the
 *  puzzle's, and a seat's state is its rows and these counts. */
export type BeePlayerRaw = PlayerRaw & BeeFactsRaw

/**
 * A player as `gd` holds them: the common player with the facts twice —
 * spread on, their side's (the team's in coop, their own in compete); under
 * `own`, their own (docs/common-schema.md → A player's facts).
 */
export type BeePlayer = PlayerRaw & FactsApart<BeeFacts> & {
  own: BeeFacts
}

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
 * A bee game's `game_data` and `static_game_data`, as its builders write them:
 * the common part, with the puzzle, the team, every find and the game's facts
 * about each player on top. The game's `useGame` merges the two blobs the page
 * hands down; `makeBeeGameData` turns them into `gd`. It carries every player's rows; what
 * a racer may see of a rival mid-race is `makeBeeGameData`'s rule.
 */
export type BeeGameDataRaw<Setup> = Omit<GameDataRaw, 'setup' | 'players'> & {
  setup: Setup
  puzzle: BeePuzzle
  // The team's facts, sent once: the players' finds summed. Null in compete,
  // where there is no team.
  team: BeeFactsRaw | null
  // Every found word, in the order found, each with its finder.
  foundWords: BeeFoundWordRaw[]
  players: BeePlayerRaw[]
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
 *   title
 *   setup
 *   setupRows
 *   puzzle: {tiles, tilesById, centerLetter, outerLetters, words, nReqdWords, reqdWordsScore}
 *   turns                                            # always null: no turn order
 *   ending: {reason, detail, by, winners}            # null while playing; by and winners are players; winners is every player ranked first
 *   ended
 *   outcome                                          # null until the game ends
 *   foundWords: [{by, word, points, pangram, bonus, at}, …]   # every find, by a player; my rows only, mid-race
 *   players: [player, …]                             # seat order
 *   playersById
 *   me                                               # same object as playersById[auth.user.id]
 *
 * player:
 *   the common player
 *   nFoundWords                                      # the side's: the team's in coop, their own in compete
 *   foundWordsScore
 *   rankIdx
 *   rankName
 *   targetRankIdx                                    # the rank that wins; the same on every player
 *   targetRankName
 *   own: {nFoundWords, foundWordsScore, rankIdx, rankName, targetRankIdx, targetRankName}
 *                                                    # this player's own
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
export type BeeGameData<Setup> = Omit<
  BeeGameDataRaw<Setup>,
  'puzzle' | 'team' | 'turns' | 'ending' | 'foundWords' | 'players'
> & {
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
  ending: GameEnding<BeePlayer> | null
  // The players in seat order, and the same objects keyed by id.
  players: BeePlayer[]
  playersById: Record<string, BeePlayer>
  // My entry in `playersById`: the same object.
  me: BeePlayer
}

/** A bee game's `summary_data`: the common part, with the team's progress
 *  (null in compete) and what it is measured against. */
export type BeeSummaryData = SummaryData & {
  team: BeeFactsRaw | null
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

/** A side's facts, with the names of its two ranks beside their indexes. */
function addRankNames(f: BeeFactsRaw): BeeFacts {
  return {
    nFoundWords: f.nFoundWords,
    foundWordsScore: f.foundWordsScore,
    rankIdx: f.rankIdx,
    targetRankIdx: f.targetRankIdx,
    rankName: RANKS[f.rankIdx]!,
    targetRankName: f.targetRankIdx === null ? null : RANKS[f.targetRankIdx]!,
  }
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
  // `team` goes onto the players; `gd` has none.
  const { team, turns, ending, ...rest } = raw
  const teamFacts = team === null ? null : addRankNames(team)

  // Each player carries the facts twice (docs/common-schema.md → A player's
  // facts): spread on, the side's — the team's in coop, their own in compete;
  // under `own`, their own.
  const players: BeePlayer[] = raw.players.map(function makePlayer(p) {
    const own = addRankNames(p)
    return { ...p, ...(teamFacts ?? own), own }
  })
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Every find is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const foundWords: BeeFoundWord[] = raw.foundWords
    .filter((w) => seeRival || isMine(w.userId))
    .map(({ userId, ...row }) => ({ ...row, by: playersById[userId]! }))

  // The gate has checked that I am seated.
  const me = playersById[myId]!

  return {
    ...rest,
    puzzle: { ...raw.puzzle, tilesById: new Map(raw.puzzle.tiles.map((t) => [t.id, t])) },
    setupRows: makeSetupRows(players),
    turns: turns === null ? null : { holder: playersById[turns.holder]! },
    ending: makeEnding(ending, players),
    foundWords,
    players,
    playersById,
    me,
  }
}
