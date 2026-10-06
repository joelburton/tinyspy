// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { GBoardRaw, GGameDataRaw, GEventRaw, GPlayerRaw, GSetup } from '../types'

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
  // Their own counts, as `psychicnum.players` holds them. Left out, they are
  // counted off the log's guess rows, as the game's own rows would hold them.
  // The team's are their sum.
  found?: number
  used?: number
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  title?: string
  clubHandle?: string
  setup?: GSetup
  words?: string[]
  // Null while the game is played, as the builder withholds them.
  secrets?: string[] | null
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

/** A compete player whose budget ran out — eliminated, so `lost` at once, as
 *  `submit_guess` writes it. */
export const ZTest_SPENT: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'resource_exhausted', detail: 'exhausted' },
  outcome: 'lost',
}

/** A guess row, for the log and the boards. */
export function ZTest_guess(
  id: number,
  userId: string,
  word: string,
  correct: boolean,
  over: Partial<GEventRaw> = {},
): GEventRaw {
  return { id, userId, word, correct, kind: 'guess', at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`, ...over }
}

/**
 * Build the `game_data` blob `psychicnum._rebuild_data_cols` would write from these
 * facts: each player's own counts, the team's facts in coop (the counts summed,
 * the one board), a racer's own board in compete — each board folded from the
 * log — and where every player stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
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
  const ownGuesses = (p: ZTest_PlayerFacts) => events.filter((e) => e.kind === 'guess' && e.userId === p.id)
  const foundOf = (p: ZTest_PlayerFacts) => p.found ?? ownGuesses(p).filter((e) => e.correct).length
  const usedOf = (p: ZTest_PlayerFacts) => p.used ?? ownGuesses(p).length

  // Every dealt word, in the puzzle's order, with the guess that decided it
  // on this board, if any.
  function makeBoard(guesses: GEventRaw[]): GBoardRaw {
    return {
      tiles: words.map((word) => {
        const guess = guesses.find((e) => e.word === word)
        return guess === undefined
          ? { id: word, word, correct: null, decidedBy: null }
          : { id: word, word, correct: guess.correct, decidedBy: guess.userId }
      }),
    }
  }

  const team = coop
    ? {
      nFoundSecrets: playerFacts.reduce((sum, p) => sum + foundOf(p), 0),
      nGuessesUsed: playerFacts.reduce((sum, p) => sum + usedOf(p), 0),
      nReqdSecrets: 3,
      maxGuesses: setup.max_guesses,
      board: makeBoard(events.filter((e) => e.kind === 'guess')),
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
      nReqdSecrets: 3,
      maxGuesses: setup.max_guesses,
      nFoundSecrets: foundOf(p),
      nGuessesUsed: usedOf(p),
      // Coop's one board is the team's.
      board: coop ? null : makeBoard(ownGuesses(p)),
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
    team,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands psychicnum's `PlayArea`, from the game's facts:
 * the `game_data` and `static_game_data` blobs, and shell_data's roster read
 * off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makePsychicnumCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // The two blobs the page hands down, split as the builders write them: what
  // create fixed in the static one, the rest, the secrets included, in
  // game_data.
  const { id, gametype, brand, club, mode, coop, compete, oneBoard, setup, puzzle, ...changing } = raw
  return ZTest_makePlayAreaLoaderProps({
    gameId: raw.id,
    gametype: raw.gametype,
    title: raw.title,
    clubHandle: raw.club.handle,
    ended: raw.ended,
    players: raw.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, ai: p.ai, stillPlaying: p.stillPlaying,
    })),
    gameData: { ...changing, puzzle: { secrets: puzzle.secrets } },
    staticGameData: {
      id, gametype, brand, club, mode, coop, compete, oneBoard, setup,
      puzzle: { words: puzzle.words },
    },
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
