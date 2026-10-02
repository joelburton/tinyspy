// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  makePlayAreaLoaderProps,
  type PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { CommonPlayarea, CommonPlayareaPlayer } from '@/common/game-page/playarea'
import type { PsychicnumPlayarea, PsychicnumPlayareaEvent, PsychicnumPlayareaPlayer } from './playarea'
import type { PsychicnumSetup } from './setup'

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
  ending?: CommonPlayareaPlayer['ending']
  outcome?: CommonPlayareaPlayer['outcome']
  finalRanking?: number | null
  solvedAt?: string | null
  // Their own counts, as `psychicnum.players` holds them. Left out, they are
  // counted off the log's guess rows, as the game's own rows would hold them.
  found?: number
  used?: number
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play, viewed by its one player, `u1`. */
export type PlayareaFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  title?: string
  clubHandle?: string
  setup?: PsychicnumSetup
  words?: string[]
  // Null while the game is played, as the builder withholds them.
  secrets?: string[] | null
  // The whole log — every player's rows, as the blob carries it.
  events?: PsychicnumPlayareaEvent[]
  players?: PlayerFacts[]
  // Who holds the turn in a turn-order game; `undefined` is a free-for-all.
  turnHolderId?: string | null
  ending?: CommonPlayarea['ending']
  outcome?: CommonPlayarea['outcome']
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

/** A guess row, for the log and the boards. */
export function guess(
  id: number,
  userId: string,
  word: string,
  correct: boolean,
  over: Partial<PsychicnumPlayareaEvent> = {},
): PsychicnumPlayareaEvent {
  return { id, userId, word, correct, kind: 'guess', at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`, ...over }
}

/**
 * Build the playarea blob `psychicnum._write_statuses` would write from these
 * facts: the counts summed for coop, each seat's board folded from the log in
 * the mode's scope, and where every player stands derived.
 */
export function makePlayarea(facts: PlayareaFacts = {}): PsychicnumPlayarea {
  const {
    id = 'g1',
    mode = 'coop',
    title = 'Test game',
    clubHandle = 'testclub',
    setup = { max_guesses: 7, word_count: 10, band: 3, timer: { kind: 'none' } },
    words = ['alpha', 'bravo', 'charlie', 'delta', 'echo'],
    secrets = null,
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined
  const ownGuesses = (p: PlayerFacts) => events.filter((e) => e.kind === 'guess' && e.userId === p.id)
  const foundOf = (p: PlayerFacts) => p.found ?? ownGuesses(p).filter((e) => e.correct).length
  const usedOf = (p: PlayerFacts) => p.used ?? ownGuesses(p).length
  const teamFound = playerFacts.reduce((sum, p) => sum + foundOf(p), 0)
  const teamUsed = playerFacts.reduce((sum, p) => sum + usedOf(p), 0)

  const players = playerFacts.map(function makePlayer(p, i): PsychicnumPlayareaPlayer {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && (!turnBased || turnHolderId === p.id)
    const own = events.filter((e) => e.kind === 'guess' && (coop || e.userId === p.id))
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
      requiredSecretsCount: 3,
      maxGuesses: setup.max_guesses,
      foundSecretsCount: coop ? teamFound : foundOf(p),
      guessesUsed: coop ? teamUsed : usedOf(p),
      board: {
        tileResults: Object.fromEntries(own.map((e) => [e.word, e.correct])),
        decidedBy: Object.fromEntries(own.map((e) => [e.word, e.userId])),
      },
    }
  })

  return {
    id,
    gametype: `psychicnum_${mode}`,
    brand: 'PsychicNum',
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
    puzzle: { words, secrets },
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands psychicnum's `PlayArea`, from the game's facts:
 * the playarea blob, and the shell's roster read off it, viewed by `auth`
 * (`u1` unless said otherwise).
 */
export function makePsychicnumCtx(
  facts: PlayareaFacts = {},
  over: Omit<PlayAreaFacts, 'players' | 'playarea'> = {},
): PlayAreaLoaderProps {
  const playarea = makePlayarea(facts)
  return makePlayAreaLoaderProps({
    gameId: playarea.id,
    gametype: playarea.gametype,
    title: playarea.title,
    clubHandle: playarea.club.handle,
    ended: playarea.ended,
    players: playarea.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, ai: p.ai, stillPlaying: p.stillPlaying,
    })),
    playarea,
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
