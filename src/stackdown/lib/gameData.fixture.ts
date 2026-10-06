// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { GEventRaw, GGameDataRaw, GPlayerRaw, GSetup, GTile } from '../types'

/** setup.psql's stack: tile number, letter, column, row, layer. */
const STACK: [number, string, number, number, number][] = [
  [0, 'E', 2, 0, 0], [1, 'A', 6, 0, 0], [2, 'L', 3, 1, 1], [3, 'N', 5, 1, 1],
  [4, 'C', 0, 2, 0], [5, 'B', 2, 2, 2], [6, 'T', 4, 2, 2], [7, 'P', 6, 2, 2],
  [8, 'S', 8, 2, 0], [9, 'E', 1, 3, 1], [10, 'E', 3, 3, 3], [11, 'A', 5, 3, 3],
  [12, 'L', 7, 3, 1], [13, 'N', 0, 4, 0], [14, 'L', 2, 4, 2], [15, 'G', 6, 4, 2],
  [16, 'A', 8, 4, 0], [17, 'L', 1, 5, 1], [18, 'P', 3, 5, 3], [19, 'E', 5, 5, 3],
  [20, 'A', 7, 5, 1], [21, 'E', 0, 6, 0], [22, 'U', 2, 6, 2], [23, 'J', 4, 6, 2],
  [24, 'L', 6, 6, 2], [25, 'P', 8, 6, 0], [26, 'I', 3, 7, 1], [27, 'M', 5, 7, 1],
  [28, 'E', 2, 8, 0], [29, 'O', 6, 8, 0],
]

/** setup.psql's six words, in clearing order. */
export const ZTest_SOLUTION = ['eagle', 'table', 'plans', 'apple', 'juice', 'lemon']

/** Each solution word's five tiles, in pick order — setup.psql's `sd_seq`. */
export const ZTest_WORD_TILES: Record<string, string[]> = {
  eagle: ['19', '11', '15', '24', '10'],
  table: ['6', '20', '5', '2', '0'],
  plans: ['7', '12', '16', '3', '8'],
  apple: ['1', '18', '25', '14', '9'],
  juice: ['23', '22', '26', '4', '28'],
  lemon: ['17', '21', '27', '29', '13'],
}

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — and their counts and stack are off their rows in the log.
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
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play on setup.psql's stack, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  // The whole stack; setup.psql's unless said. A component test hands in a few
  // tiles of its own, so a letter names one tile.
  tiles?: GTile[]
  title?: string
  clubHandle?: string
  setup?: GSetup
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

/** The stack's 30 tiles by tile number, as `stackdown._make_json_tiles`
 *  writes them. */
export function ZTest_makeTiles(): GTile[] {
  return STACK.map(([id, letter, x, y, z]) => ({ id: String(id), letter, x, y, z }))
}

const at = (id: number) => `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`

/** A played word, which takes a turn. One of the six clears its own tiles; any
 *  other word is refused, and its tiles are the ones said (EAGLE's unless said).
 *  On a test's own tiles, say the tiles and the verdict both. */
export function ZTest_word(
  id: number,
  userId: string,
  word: string,
  tileIds?: string[],
  valid: boolean = word in ZTest_WORD_TILES,
): GEventRaw {
  return {
    id, userId, kind: 'word', word, clue: null,
    tileIds: tileIds ?? ZTest_WORD_TILES[word] ?? ZTest_WORD_TILES.eagle!,
    valid, tookTurn: true, at: at(id),
  }
}

/** A hint: a clue for the next word, which does not take a turn. */
export function ZTest_hint(id: number, userId: string, clue: string): GEventRaw {
  return { id, userId, kind: 'hint', word: null, clue, tileIds: [], valid: null, tookTurn: false, at: at(id) }
}

/** A spoiler: the next word handed over, which takes a turn. */
export function ZTest_spoiler(id: number, userId: string, word: string): GEventRaw {
  return { id, userId, kind: 'spoiler', word, clue: null, tileIds: [], valid: null, tookTurn: true, at: at(id) }
}

/**
 * Build the `game_data` blob `stackdown._rebuild_data_cols` would write from
 * these facts: each player's own counts off their rows in the log; the team's
 * facts in coop (the counts summed, the one stack), a racer's own stack in
 * compete — each with the tiles of the valid words that cleared it gone; the
 * solution once ended; and where every player stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    title = 'New game',
    clubHandle = 'testclub',
    setup = { band: 1, timer: { kind: 'none' } },
    tiles = ZTest_makeTiles(),
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined

  const rowsOf = (p: ZTest_PlayerFacts) => events.filter((e) => e.userId === p.id)
  // A stack with the tiles of these rows' valid words gone.
  function makeBoard(rows: GEventRaw[]) {
    const cleared = new Set(rows.filter((e) => e.valid).flatMap((e) => e.tileIds))
    return { tiles: tiles.filter((t) => !cleared.has(t.id)) }
  }

  const players = playerFacts.map(function makePlayer(p, i): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && (!turnBased || turnHolderId === p.id)
    const rows = rowsOf(p)
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
      nFoundWords: rows.filter((e) => e.valid).length,
      nHintsUsed: rows.filter((e) => e.kind === 'hint').length,
      nSpoilersUsed: rows.filter((e) => e.kind === 'spoiler').length,
      // Coop's one stack is the team's.
      board: coop ? null : makeBoard(rows),
    }
  })

  const sum = (key: 'nFoundWords' | 'nHintsUsed' | 'nSpoilersUsed') =>
    players.reduce((n, p) => n + p[key], 0)

  return {
    id,
    gametype: `stackdown_${mode}`,
    brand: 'StackDown',
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
    puzzle: {
      tiles,
      nReqdWords: 6,
      solution: ended ? ZTest_SOLUTION : null,
    },
    team: coop
      ? {
        nFoundWords: sum('nFoundWords'),
        nHintsUsed: sum('nHintsUsed'),
        nSpoilersUsed: sum('nSpoilersUsed'),
        board: makeBoard(events),
      }
      : null,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands stackdown's `PlayArea`, from the game's facts:
 * the `game_data` and `static_game_data` blobs, and shell_data's roster read
 * off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeStackdownCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // The two blobs the page hands down, split as the builders write them: what
  // create fixed, the stack included, in the static one; the rest, the six
  // words included, in game_data.
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
    gameData: { ...changing, puzzle: { solution: puzzle.solution } },
    staticGameData: {
      id, gametype, brand, club, mode, coop, compete, setup,
      puzzle: { tiles: puzzle.tiles, nReqdWords: puzzle.nReqdWords },
    },
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
