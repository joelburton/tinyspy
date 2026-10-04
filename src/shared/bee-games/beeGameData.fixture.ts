// cs-unmet

import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import { currentRankIndex } from '@/shared/rank-ladder/rankLadder'
import type { GBeeFoundWordRaw, GBeeGameDataRaw, GBeePlayerRaw, GBeePuzzle, GBeeTile, GBeeWord } from './beeGameData'

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
  // The board's outer letters, when a test needs a board other than the game's
  // fixture one — a wheel with a letter on two tiles, say. The center stays.
  outerLetters?: string
  // The puzzle's words, the required ones first; the letters are the board's.
  words?: GBeeWord[]
  targetRankIdx?: number | null
  sameBandsAndHaveNoBonus?: boolean
  // Every player's rows, as the blob carries them, in the order found.
  foundWords?: GBeeFoundWordRaw[]
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

/** A legal word, scored; required unless `bonus`. */
export const ZTest_word = (
  word: string,
  points: number,
  over: Partial<Pick<GBeeWord, 'pangram' | 'bonus'>> = {},
): GBeeWord => ({ word, points, pangram: false, bonus: false, ...over })

/** One find, as the blob carries it. */
export function ZTest_find(
  userId: string,
  word: string,
  points: number,
  over: Partial<Pick<GBeeFoundWordRaw, 'pangram' | 'bonus' | 'at'>> = {},
): GBeeFoundWordRaw {
  return {
    userId, word, points,
    pangram: false, bonus: false, at: '2026-06-15T00:01:00Z',
    ...over,
  }
}

/** The board's tiles as the builder writes them: the center first, then each
 *  outer letter at its place. */
export function ZTest_tilesOf(centerLetter: string, outerLetters: string): GBeeTile[] {
  return [
    { id: '0', letter: centerLetter, center: true },
    ...[...outerLetters].map((letter, i) => ({ id: String(i + 1), letter, center: false })),
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
    outerLetters = game.outerLetters,
    title = `${game.centerLetter.toUpperCase()}·${[...outerLetters].sort().join('').toUpperCase()}`,
    clubHandle = 'testclub',
    setup = game.defaultSetup,
    words = [ZTest_word('bead', 1), ZTest_word('faced', 5)],
    targetRankIdx = null,
    sameBandsAndHaveNoBonus = false,
    foundWords = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const reqdWords = words.filter((w) => !w.bonus)
  const reqdWordsScore = reqdWords.reduce((sum, w) => sum + w.points, 0)

  const puzzle: GBeePuzzle = {
    tiles: ZTest_tilesOf(game.centerLetter, outerLetters),
    centerLetter: game.centerLetter,
    outerLetters,
    words,
    nReqdWords: reqdWords.length,
    reqdWordsScore,
    sameBandsAndHaveNoBonus,
  }

  const countsOf = (rows: GBeeFoundWordRaw[]) => {
    const foundWordsScore = rows.reduce((sum, r) => sum + r.points, 0)
    return {
      nFoundWords: rows.length,
      foundWordsScore,
      rankIdx: currentRankIndex(foundWordsScore, reqdWordsScore),
      targetRankIdx,
    }
  }
  const team = coop ? countsOf(foundWords) : null

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
      ...countsOf(foundWords.filter((w) => w.userId === p.id)),
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
    foundWords,
    players,
  }
}
