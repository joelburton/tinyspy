// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import { lengthScore } from './scoring'
import type { GEventRaw, GGameDataRaw, GPlayerRaw, GSetup, GTrack } from '../types'

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — and their track is counted off their own accepted rows,
 * so a test sets the facts and never hand-writes an answer the builder could
 * not give.
 */
export type ZTest_PlayerFacts = {
  id: string
  username: string
  color?: string
  ai?: boolean
  seat?: number | null
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play on base 'ar', viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  clubHandle?: string
  setup?: GSetup
  base?: string
  maxWordLen?: number
  longestWords?: string[]
  legalWords?: string[]
  // The whole log — every player's rows, rejects included, as the blob
  // carries it.
  events?: GEventRaw[]
  players?: ZTest_PlayerFacts[]
  // Who holds the turn in a turn-order game; `undefined` is a free-for-all.
  turnHolderId?: string
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** A player's ending columns, as `common._concede` writes them. */
export const ZTest_CONCEDED: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

/** A compete racer whose five words are spent — `neutral`, since the ranking
 *  waits for the end, as `submit_guess` writes it. */
export const ZTest_SPENT: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'resource_exhausted', detail: 'complete' },
  outcome: 'neutral',
}

/**
 * A log row: an accepted word unless a `reason` is given, which makes it a
 * reject. A rules break costs the go and a word the list lacks does not, as
 * `submit_guess` records it.
 */
export function ZTest_guess(
  id: number,
  userId: string,
  word: string,
  reason: GEventRaw['reason'] = null,
): GEventRaw {
  return {
    id,
    userId,
    word,
    valid: reason === null,
    reason,
    tookTurn: reason !== 'not_a_word',
    at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
  }
}

/**
 * Build the `game_data` blob `wordiply._rebuild_data_cols` would write from
 * these facts: each track counted off the accepted rows (one player's, or the
 * whole team's in coop) with its scores held back until the end, each seat's
 * board in the mode's scope, and where every player stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    clubHandle = 'testclub',
    setup = { difficulty: 5, timer: { kind: 'none' } },
    base = 'ar',
    maxWordLen = 7,
    longestWords = ['hangars'],
    legalWords = ['bar', 'car', 'arc', 'arts', 'cars', 'scar', 'stars', 'hangars'],
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined
  const accepted = events.filter((e) => e.valid)

  /** One track, as `wordiply._make_json_track` writes it: `userId` null is
   *  the whole team's. */
  function makeTrack(userId: string | null): GTrack {
    const lens = accepted.filter((e) => userId === null || e.userId === userId).map((e) => e.word.length)
    const longest = Math.max(0, ...lens)
    return {
      nGuessesUsed: lens.length,
      lengthScore: ended ? lengthScore(longest, maxWordLen) : null,
      nLetters: ended ? lens.reduce((sum, n) => sum + n, 0) : null,
      longestWordLen: ended ? longest : null,
    }
  }

  const players = playerFacts.map(function makePlayer(p, i): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && (!turnBased || turnHolderId === p.id)
    return {
      id: p.id,
      username: p.username,
      color: p.color ?? 'red',
      ai: p.ai ?? false,
      seat: p.seat ?? (turnBased ? i : null),
      ending: p.ending ?? null,
      outcome: p.outcome ?? null,
      finalRanking: p.finalRanking ?? null,
      solvedAt: null,
      conceded: p.ending?.reason === 'conceded',
      solved: false,
      stillPlaying,
      onTurn,
      waitingForTurn: stillPlaying && !onTurn,
      maxGuesses: 5,
      ...makeTrack(p.id),
      // The words on this seat's board: the team's in coop, their own in compete.
      board: { words: accepted.filter((e) => coop || e.userId === p.id).map((e) => e.word) },
    }
  })

  return {
    id,
    gametype: `wordiply_${mode}`,
    brand: 'WordWire',
    club: { handle: clubHandle },
    mode,
    coop,
    compete: !coop,
    oneBoard: coop,
    title: base.toUpperCase(),
    setup,
    turns: turnBased ? { holder: turnHolderId } : null,
    ending,
    ended,
    outcome,
    puzzle: { base, maxWordLen, longestWords, legalWords },
    team: coop ? makeTrack(null) : null,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands wordiply's `PlayArea`, from the game's facts:
 * the `game_data` blob, and shell_data's roster read off it, viewed by `auth`
 * (`u1` unless said otherwise).
 */
export function ZTest_makeWordiplyCtx(
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
