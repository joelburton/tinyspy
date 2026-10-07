// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { GBoardRow, GEventRaw, GGameDataRaw, GPlayerRaw, GSetup } from '../types'

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — so a test sets the facts and never hand-writes an answer
 * the builder could not give.
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
  solvedAt?: string | null
  // Their own misses, as `wordleone.players` holds them. Left out, they are
  // counted off their own rows in the log. The team's is the sum.
  misses?: number
  // Null unless a test says the clock placed them (compete, once ranked).
  tieBrokenByClock?: boolean | null
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  title?: string
  clubHandle?: string
  setup?: GSetup
  // The starter on every board; SIEVE on `yxyyg` unless said.
  starter?: { word: string; colors: string }
  // Null while the game is played, as the builder withholds it.
  target?: string | null
  // The answer's band, likewise withheld until the end.
  targetBand?: number | null
  // The whole log — every player's rows, as the blob carries it.
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

/** A compete player who solved and waits on the rest — `neutral`, since fewer
 *  misses may yet beat it, as `submit_guess` writes it. */
export const ZTest_SOLVED_WAITING: Pick<ZTest_PlayerFacts, 'ending' | 'outcome' | 'solvedAt'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'reached_goal', detail: 'solved' },
  outcome: 'neutral',
  solvedAt: '2026-09-03T00:00:00Z',
}

/** A guess row for the log: the solve all green, a miss with no colors. */
export function ZTest_guess(id: number, userId: string, word: string, correct = false): GEventRaw {
  return {
    id,
    userId,
    word,
    colors: correct ? 'ggggg' : null,
    verdict: correct ? 'correct' : 'miss',
    correct,
    at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
  }
}

/** A word outside the legal band, as the log keeps it: no colors, no miss. */
export function ZTest_notAWord(id: number, userId: string, word: string): GEventRaw {
  return { ...ZTest_guess(id, userId, word), verdict: 'not_a_word' }
}

/**
 * Build the `game_data` blob `wordleone._rebuild_data_cols` would write from
 * these facts, with the static blob's half of the puzzle joined in: each
 * player's own misses, the team's facts in coop (the misses summed, the one
 * board), a racer's own board in compete — each board the starter, then the
 * solve once there is one — and where every player stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    title = 'New game',
    clubHandle = 'testclub',
    setup = { legal_band: 2, difficulty: 'medium', timer: { kind: 'none' } },
    starter = { word: 'sieve', colors: 'yxyyg' },
    target = null,
    targetBand = null,
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined
  const missesOf = (p: ZTest_PlayerFacts) =>
    p.misses ?? events.filter((e) => e.userId === p.id && e.verdict === 'miss').length
  const makeBoard = (rows: GEventRaw[]) => ({
    rows: [
      starter,
      ...rows.filter((e) => e.correct).map((e): GBoardRow => ({ word: e.word, colors: e.colors })),
    ],
  })
  const team = coop
    ? {
      nMisses: playerFacts.reduce((sum, p) => sum + missesOf(p), 0),
      board: makeBoard(events),
    }
    : null

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
      solvedAt: p.solvedAt ?? null,
      conceded: p.ending?.reason === 'conceded',
      solved: (p.solvedAt ?? null) !== null,
      stillPlaying,
      onTurn,
      waitingForTurn: stillPlaying && !onTurn,
      nMisses: missesOf(p),
      tieBrokenByClock: p.tieBrokenByClock ?? null,
      // Coop's one board is the team's.
      board: coop ? null : makeBoard(events.filter((e) => e.userId === p.id)),
    }
  })

  return {
    id,
    gametype: `wordleone_${mode}`,
    brand: 'WordNerdier',
    club: { handle: clubHandle },
    mode,
    coop,
    compete: !coop,
    title,
    setup,
    turns: turnBased ? { holder: turnHolderId } : null,
    ending,
    ended,
    outcome,
    puzzle: { starter: starter.word, colors: starter.colors, target, targetBand },
    team,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands wordleone's `PlayArea`, from the game's facts:
 * the `game_data` and `static_game_data` blobs, and shell_data's roster read
 * off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeWordleoneCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // The two blobs the page hands down, split as the builders write them: the
  // common part and the starter in the static one; the rest, the answer
  // included, in game_data.
  const { id, gametype, brand, club, mode, coop, compete, setup, puzzle, ...changing } = raw
  return ZTest_makePlayAreaLoaderProps({
    gameId: raw.id,
    gametype: raw.gametype,
    title: raw.title,
    clubHandle: raw.club.handle,
    ended: raw.ended,
    players: raw.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, ai: p.ai, stillPlaying: p.stillPlaying,
    })),
    gameData: { ...changing, puzzle: { target: puzzle.target, targetBand: puzzle.targetBand } },
    staticGameData: {
      id, gametype, brand, club, mode, coop, compete, setup,
      puzzle: { starter: puzzle.starter, colors: puzzle.colors },
    },
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
