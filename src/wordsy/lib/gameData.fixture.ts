// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { GEventRaw, GGameDataRaw, GPlayerRaw, GRoundRaw, GSetup, GTile } from '../types'

/**
 * The planted table supabase/tests/wordsy/setup.psql deals, so the frontend's
 * scores are pinned to the same cards the server's are:
 *
 *   slot   1    2    3    4    5    6    7    8
 *   card   F45  B1   C5   D9   L17  C6   Q58  R33
 *   worth  6    5    4    4    3    3    4    2
 */
export const ZTest_TABLE: GTile[] = [
  { id: '45', letter: 'f', bonus: 1, slot: 1, value: 5 },
  { id: '1', letter: 'b', bonus: 0, slot: 2, value: 5 },
  { id: '5', letter: 'c', bonus: 0, slot: 3, value: 4 },
  { id: '9', letter: 'd', bonus: 0, slot: 4, value: 4 },
  { id: '17', letter: 'l', bonus: 0, slot: 5, value: 3 },
  { id: '6', letter: 'c', bonus: 0, slot: 6, value: 3 },
  { id: '58', letter: 'q', bonus: 2, slot: 7, value: 2 },
  { id: '33', letter: 'r', bonus: 0, slot: 8, value: 2 },
]

/** The facts a test sets up about one player. Where they stand is DERIVED the
 *  way `common._make_json_player` derives it; their totals are given. */
export type ZTest_PlayerFacts = {
  id: string
  username: string
  color?: string
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
  total?: number
  nBonuses?: number
  roundScores?: (number | null)[]
  // This round's standing word, or null.
  word?: string | null
  isWordFrozen?: boolean
  isReadyForNextRound?: boolean
}

/** One round's facts; the table is `ZTest_TABLE` unless said. */
export type ZTest_RoundFacts = Partial<Omit<GRoundRaw, 'num'>> & { num: number }

/** The facts a test sets up about a game. Everything else is a two-player
 *  timer game in round 1 on the planted table, viewed by `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  setup?: GSetup
  rounds?: ZTest_RoundFacts[]
  events?: GEventRaw[]
  players?: ZTest_PlayerFacts[]
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

export const ZTest_TWO: ZTest_PlayerFacts[] = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'bea', color: 'blue' },
]

/** A player's ending columns, as `common._concede` writes them. */
export const ZTest_CONCEDED: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

/** A log row: `userId`'s word in round `num`. */
export function ZTest_word(
  id: number,
  userId: string,
  num: number,
  word: string,
  score: number,
  bonus = 0,
): GEventRaw {
  return {
    id, userId, kind: 'word', num, word, score, bonus, tookTurn: true,
    at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
  }
}

/**
 * Build the `game_data` blob `wordsy._rebuild_data_cols` would write from
 * these facts: the rounds, the log, and every player — their standing derived,
 * their facts as given.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    setup = { timer: { kind: 'none' }, legal_band: 4, round_style: 'timer', n_rounds: 7, one_word: false },
    rounds = [{ num: 1 }],
    events = [],
    players: playerFacts = ZTest_TWO,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null

  const players = playerFacts.map(function makePlayer(p): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const word = p.word ?? null
    return {
      id: p.id,
      username: p.username,
      color: p.color ?? 'red',
      ai: false,
      seat: null,
      ending: p.ending ?? null,
      outcome: p.outcome ?? null,
      finalRanking: p.finalRanking ?? null,
      solvedAt: null,
      conceded: p.ending?.reason === 'conceded',
      solved: false,
      stillPlaying,
      onTurn: stillPlaying,
      waitingForTurn: false,
      total: p.total ?? 0,
      nBonuses: p.nBonuses ?? 0,
      roundScores: p.roundScores ?? Array<null>(setup.n_rounds).fill(null),
      hasSubmitted: word !== null,
      word,
      isWordFrozen: p.isWordFrozen ?? false,
      isReadyForNextRound: p.isReadyForNextRound ?? false,
    }
  })

  return {
    id,
    gametype: 'wordsy_compete',
    brand: 'FlipWord',
    club: { handle: 'testclub' },
    mode: 'compete',
    coop: false,
    compete: true,
    title: `Round ${rounds.at(-1)!.num} of ${setup.n_rounds}`,
    setup,
    turns: null,
    ending,
    ended,
    outcome,
    team: null,
    nRounds: setup.n_rounds,
    nBestRounds: setup.n_rounds === 3 ? 2 : 5,
    nTilesInDeck: 52 - 4 * (rounds.length - 1),
    rounds: rounds.map((r) => ({
      tiles: ZTest_TABLE,
      fastest: null,
      noFlipHolder: null,
      isTimerRunning: false,
      ended: false,
      ...r,
    })),
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands wordsy's `PlayArea`, from the game's facts:
 * the two blobs, and shell_data's roster read off them, viewed by `u1`.
 */
export function ZTest_makeWordsyCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // Split as the builders write them: the common part create fixed in the
  // static one; the rest in game_data.
  const { id, gametype, brand, club, mode, coop, compete, setup, ...changing } = raw
  return ZTest_makePlayAreaLoaderProps({
    gameId: raw.id,
    gametype: raw.gametype,
    title: raw.title,
    clubHandle: raw.club.handle,
    ended: raw.ended,
    players: raw.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, ai: p.ai, stillPlaying: p.stillPlaying,
    })),
    gameData: changing,
    staticGameData: { id, gametype, brand, club, mode, coop, compete, setup },
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
