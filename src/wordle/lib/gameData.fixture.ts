// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  makePlayAreaLoaderProps,
  type PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { GGameDataRaw, GEventRaw, GPlayerRaw, GSetup } from '../types'

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — so a test sets the facts and never hand-writes an answer
 * the builder could not give.
 */
export type PlayerFacts = {
  id: string
  username: string
  color?: string
  ai?: boolean
  seat?: number | null
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
  solvedAt?: string | null
  // Their count, as `wordle.players` holds it. Left out, it is counted off
  // the log's rows: the team's in coop, their own in compete.
  used?: number
  // Null unless a test says the clock placed them (compete, once ranked).
  tieBrokenByClock?: boolean | null
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play, viewed by its one player, `u1`. */
export type GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  title?: string
  clubHandle?: string
  setup?: GSetup
  // Null while the game is played, as the builder withholds it.
  target?: string | null
  // The whole log — every player's rows, as the blob carries it.
  events?: GEventRaw[]
  players?: PlayerFacts[]
  // Who holds the turn in a turn-order game; `undefined` is a free-for-all.
  turnHolderId?: string | null
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** A player's ending columns, as `common._concede` writes them. */
export const CONCEDED: Pick<PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

/** A compete player whose budget ran out — eliminated, so `lost` at once, as
 *  `submit_guess` writes it. */
export const SPENT: Pick<PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'resource_exhausted', detail: 'exhausted' },
  outcome: 'lost',
}

/** A compete player who solved and waits on the rest — `neutral`, since fewer
 *  guesses may yet beat it, as `submit_guess` writes it. */
export const SOLVED_WAITING: Pick<PlayerFacts, 'ending' | 'outcome' | 'solvedAt'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'reached_goal', detail: 'solved' },
  outcome: 'neutral',
  solvedAt: '2026-09-03T00:00:00Z',
}

/** A guess row, for the log and the boards. */
export function guess(
  id: number,
  userId: string,
  word: string,
  colors: string,
  correct = colors === 'ggggg',
): GEventRaw {
  return { id, userId, word, colors, correct, at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z` }
}

/**
 * Build the `game_data` blob `wordle._rebuild_data_cols` would write from these
 * facts: each seat's board and count folded from the log in the mode's scope,
 * and where every player stands derived.
 */
export function makeGameDataRaw(facts: GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    title = 'New game',
    clubHandle = 'testclub',
    setup = { max_guesses: 6, answer_band: 0, legal_band: 4, timer: { kind: 'none' } },
    target = null,
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined

  const players = playerFacts.map(function makePlayer(p, i): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && (!turnBased || turnHolderId === p.id)
    // The rows on this seat's board: the team's in coop, their own in compete.
    const own = events.filter((e) => coop || e.userId === p.id)
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
      maxGuesses: setup.max_guesses,
      guessesUsed: p.used ?? own.length,
      tieBrokenByClock: p.tieBrokenByClock ?? null,
      board: { rows: own.map((e) => ({ word: e.word, colors: e.colors })) },
    }
  })

  return {
    id,
    gametype: `wordle_${mode}`,
    brand: 'WordNerd',
    club: { handle: clubHandle },
    mode,
    coop,
    compete: !coop,
    oneBoard: coop,
    title,
    setup,
    turns: turnBased ? { holder: turnHolderId } : null,
    ending,
    ended,
    outcome,
    puzzle: { target },
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands wordle's `PlayArea`, from the game's facts: the
 * `game_data` blob, and shell_data's roster read off it, viewed by `auth`
 * (`u1` unless said otherwise).
 */
export function makeWordleCtx(
  facts: GameDataFacts = {},
  over: Omit<PlayAreaFacts, 'players' | 'gameData'> = {},
): PlayAreaLoaderProps {
  const raw = makeGameDataRaw(facts)
  return makePlayAreaLoaderProps({
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
