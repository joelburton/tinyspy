// cs-unmet

import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import { currentRankIndex } from '@/shared/rank-ladder/rankLadder'
import type { GBeeEventRaw, GBeeGameDataRaw, GBeePlayerRaw, GBeePuzzle, GBeeTile, GBeeWord } from './beeGameData'

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending and the
 * game's end — so a test sets the facts and never hand-writes an answer the
 * builder could not give. Their three counts are counted off their own rows,
 * as the builder counts them.
 */
export type ZTest_BeePlayerFacts = {
  id: string
  username: string
  color?: string
  ai?: boolean
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
  solvedAt?: string | null
}

/** The facts a test sets up about a bee game. Everything else is a solo coop
 *  game in play with no target, viewed by its one player, `u1`. */
export type ZTest_BeeGameDataFacts<Setup> = {
  id?: string
  mode?: 'coop' | 'compete'
  title?: string
  clubHandle?: string
  setup?: Setup
  // The puzzle's two lists; the letters are the game's fixture board.
  reqdWords?: GBeeWord[]
  bonusWords?: GBeeWord[]
  targetRankIdx?: number | null
  hasBonus?: boolean
  // Every player's rows, as the blob carries them, in the order found.
  events?: GBeeEventRaw[]
  players?: ZTest_BeePlayerFacts[]
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** What one bee game's fixture fixes: its gametype prefix, its brand, its
 *  board's letters, and its default setup. */
export type ZTest_BeeGameFixture<Setup> = {
  gametypePrefix: string
  brand: string
  centerLetter: string
  outerLetters: string
  defaultSetup: Setup
}

/** A word in a list, scored. */
export const ZTest_word = (word: string, points: number, isPangram = false): GBeeWord =>
  ({ word, points, isPangram })

/** A found row for the log. */
export function ZTest_find(
  userId: string,
  word: string,
  points: number,
  over: Partial<Pick<GBeeEventRaw, 'isPangram' | 'isBonus' | 'at'>> = {},
): GBeeEventRaw {
  return {
    userId, word, points,
    isPangram: false, isBonus: false, at: '2026-06-15T00:01:00Z',
    ...over,
  }
}

/** The board's tiles as the builder writes them: the center first, then each
 *  outer letter at its place. */
export function ZTest_tilesOf(centerLetter: string, outerLetters: string): GBeeTile[] {
  return [
    { id: '0', letter: centerLetter, isCenter: true },
    ...[...outerLetters].map((letter, i) => ({ id: String(i + 1), letter, isCenter: false })),
  ]
}

/**
 * Build the `game_data` blob a bee game's `_rebuild_data_cols` would write from
 * these facts: each player's three counts off their rows, the team's over
 * every row in coop, and where every player stands derived.
 */
export function ZTest_makeBeeGameDataRaw<Setup>(
  game: ZTest_BeeGameFixture<Setup>,
  facts: ZTest_BeeGameDataFacts<Setup> = {},
): GBeeGameDataRaw<Setup> {
  const {
    id = 'g1',
    mode = 'coop',
    title = `${game.centerLetter.toUpperCase()}·${[...game.outerLetters].sort().join('').toUpperCase()}`,
    clubHandle = 'testclub',
    setup = game.defaultSetup,
    reqdWords = [ZTest_word('bead', 1), ZTest_word('faced', 5)],
    bonusWords = [],
    targetRankIdx = null,
    hasBonus = true,
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const reqdWordsScore = reqdWords.reduce((sum, w) => sum + w.points, 0)

  const puzzle: GBeePuzzle = {
    tiles: ZTest_tilesOf(game.centerLetter, game.outerLetters),
    centerLetter: game.centerLetter,
    outerLetters: game.outerLetters,
    reqdWords,
    bonusWords,
    nReqdWords: reqdWords.length,
    reqdWordsScore,
    targetRankIdx,
    hasBonus,
  }

  const countsOf = (rows: GBeeEventRaw[]) => {
    const foundWordsScore = rows.reduce((sum, r) => sum + r.points, 0)
    return {
      nFoundWords: rows.length,
      foundWordsScore,
      rankIdx: currentRankIndex(foundWordsScore, reqdWordsScore),
    }
  }
  const team = coop ? countsOf(events) : null

  const players = playerFacts.map(function makePlayer(p): GBeePlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    return {
      id: p.id,
      username: p.username,
      color: p.color ?? 'red',
      ai: p.ai ?? false,
      seat: null,
      ending: p.ending ?? null,
      outcome: p.outcome ?? null,
      finalRanking: p.finalRanking ?? null,
      solvedAt: p.solvedAt ?? null,
      conceded: p.ending?.reason === 'conceded',
      solved: (p.solvedAt ?? null) !== null,
      stillPlaying,
      onTurn: stillPlaying,
      waitingForTurn: false,
      ...countsOf(events.filter((e) => e.userId === p.id)),
    }
  })

  return {
    id,
    gametype: `${game.gametypePrefix}_${mode}`,
    brand: game.brand,
    club: { handle: clubHandle },
    mode,
    coop,
    compete: !coop,
    oneBoard: coop,
    title,
    setup,
    turns: null,
    ending,
    ended,
    outcome,
    puzzle,
    team,
    events,
    players,
  }
}
