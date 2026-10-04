// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import { DEFAULT_BOGGLE_SETUP_COOP } from './setup'
import type { GFoundWordRaw, GGameDataRaw, GPlayerRaw, GSetup, GTeam, GTile, GWord } from '../types'

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending and the
 * game's end — so a test sets the facts and never hand-writes an answer the
 * builder could not give. Their six counts are counted off their own rows, as
 * the builder counts them.
 */
export type ZTest_PlayerFacts = {
  id: string
  username: string
  color?: string
  ai?: boolean
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
  solvedAt?: string | null
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play on a 4×4 board, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  title?: string
  clubHandle?: string
  setup?: GSetup
  // Each tile's letters, row by row, null for a blank; the side is the
  // square root of the count.
  letters?: (string | null)[]
  // The puzzle's words, the required ones first.
  words?: GWord[]
  // Every player's rows, as the blob carries them, in the order found.
  foundWords?: GFoundWordRaw[]
  players?: ZTest_PlayerFacts[]
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** A player's ending columns, as `common._concede` writes them. */
export const ZTest_CONCEDED: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

/** A legal word, scored; required unless `bonus`. */
export const ZTest_word = (word: string, points: number, bonus = false): GWord => ({ word, points, bonus })

/** One find, as the blob carries it. */
export function ZTest_find(
  userId: string,
  word: string,
  points: number,
  over: Partial<Pick<GFoundWordRaw, 'bonus' | 'at'>> = {},
): GFoundWordRaw {
  return { userId, word, points, bonus: false, at: '2026-06-15T00:01:00Z', ...over }
}

/** The six counts over some rows, as `boggle._make_json_found_counts` counts them. */
function countsOf(rows: GFoundWordRaw[]): GTeam {
  const reqd = rows.filter((r) => !r.bonus)
  const bonus = rows.filter((r) => r.bonus)
  const score = (rs: GFoundWordRaw[]) => rs.reduce((sum, r) => sum + r.points, 0)
  return {
    nFoundWords: rows.length,
    foundWordsScore: score(rows),
    nFoundReqdWords: reqd.length,
    foundReqdWordsScore: score(reqd),
    nFoundBonusWords: bonus.length,
    foundBonusWordsScore: score(bonus),
  }
}

/**
 * Build the `game_data` blob `boggle._rebuild_data_cols` would write from these
 * facts: the puzzle's tiles and totals, each player's six counts off their
 * rows, the team's over every row in coop, and where every player stands
 * derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    title = '4×4 CATR',
    clubHandle = 'testclub',
    setup = DEFAULT_BOGGLE_SETUP_COOP,
    letters = [...'catrsexotmplngdb'],
    words = [ZTest_word('cat', 1), ZTest_word('cart', 1), ZTest_word('scare', 2), ZTest_word('scat', 1, true)],
    foundWords = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const tiles: GTile[] = letters.map((l, i) => ({ id: String(i), letters: l }))
  const reqd = words.filter((w) => !w.bonus)
  const bonus = words.filter((w) => w.bonus)
  const score = (ws: GWord[]) => ws.reduce((sum, w) => sum + w.points, 0)

  const players = playerFacts.map(function makePlayer(p): GPlayerRaw {
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
    gametype: `boggle_${mode}`,
    brand: 'MothCubes',
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
    puzzle: {
      tiles,
      boardSideSize: Math.round(Math.sqrt(tiles.length)),
      minWordLength: setup.min_word_length,
      words,
      nReqdWords: reqd.length,
      reqdWordsScore: score(reqd),
      nBonusWords: bonus.length,
      bonusWordsScore: score(bonus),
    },
    team: coop ? countsOf(foundWords) : null,
    foundWords,
    players,
  }
}

/**
 * The props `<GamePage>` hands boggle's `PlayArea`, from the game's facts: the
 * `game_data` blob, and shell_data's roster read off it, viewed by `auth`
 * (`u1` unless said otherwise).
 */
export function ZTest_makeBoggleCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  return ZTest_makePlayAreaLoaderProps({
    gameId: raw.id,
    gametype: raw.gametype,
    title: raw.title,
    clubHandle: raw.club.handle,
    ended: raw.ended,
    players: raw.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, ai: p.ai, stillPlaying: p.stillPlaying,
    })),
    gameData: raw,
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
