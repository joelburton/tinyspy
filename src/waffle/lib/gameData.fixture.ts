// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { GEventRaw, GGameDataRaw, GLetterTile, GPlayerRaw, GSetup, GTile } from '../types'

/** setup.psql's solved board: 21 distinct letters, holes at 6, 8, 16 and 18. */
export const ZTest_SOLUTION = 'abcdef.g.hijklmn.o.pqrstu'
/** The deal: cells 0 and 1 swapped, one swap from solved. */
export const ZTest_DEALT = 'bacdef.g.hijklmn.o.pqrstu'
/** The deal's colors, as `waffle._board_colors` gives them: the swapped pair
 *  yellow, every other cell green. */
export const ZTest_DEALT_COLORS = 'yygggg.g.ggggggg.g.gggggg'

/** A board as a test states it: its letters and their colors, both 25 chars
 *  with `.` at the holes. The colors are a FACT here, not worked out: the
 *  coloring lives only in SQL. */
export type ZTest_BoardFacts = { letters: string; colors: string }

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — and their count is their own rows in the log unless a
 * test says otherwise.
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
  nSwapsUsed?: number
  // This seat's board; the deal unless said otherwise. In coop every seat
  // shows the shared board, which is `ZTest_GameDataFacts.board`'s.
  board?: ZTest_BoardFacts
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play on setup.psql's deal, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  title?: string
  clubHandle?: string
  setup?: GSetup
  parSwaps?: number
  maxSwaps?: number
  // The shared coop board; a compete racer's is on their own facts.
  board?: ZTest_BoardFacts
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

/** A compete racer who solved and waits on the rest — `neutral`, since fewer
 *  swaps may yet beat it, as `submit_swap` writes it. */
export const ZTest_SOLVED_WAITING: Pick<ZTest_PlayerFacts, 'ending' | 'outcome' | 'solvedAt'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'reached_goal', detail: 'solved' },
  outcome: 'neutral',
  solvedAt: '2026-09-03T00:00:00Z',
}

/** The solved board's facts: the solution, every letter green. */
export const ZTest_SOLVED: ZTest_BoardFacts = {
  letters: ZTest_SOLUTION,
  colors: ZTest_SOLUTION.replace(/[a-z]/g, 'g'),
}

/** A board's 21 tiles by position, as `waffle._make_json_tiles` writes them:
 *  the holes left out. */
export function ZTest_makeTiles(board: ZTest_BoardFacts): GTile[] {
  return [...board.letters].flatMap((letter, i) =>
    letter === '.' ? [] : [{ id: String(i), letter, color: board.colors[i] as GTile['color'] }])
}

/** A board's 21 cells and their letters, with no color: the deal, the
 *  solution. */
function makeLetterTiles(letters: string): GLetterTile[] {
  return [...letters].flatMap((letter, i) => (letter === '.' ? [] : [{ id: String(i), letter }]))
}

/**
 * A swap row of the log: the two cells, each with the letter it held before,
 * read off `before` (the board the swap was made on), and the board's colors
 * after it.
 */
export function ZTest_swap(
  id: number,
  userId: string,
  [a, b]: [number, number],
  before: string,
  colorsAfter: string,
): GEventRaw {
  return {
    id,
    userId,
    swaps: [{ id: String(a), letter: before[a]! }, { id: String(b), letter: before[b]! }],
    colors: colorsAfter,
    at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
  }
}

/**
 * Build the `game_data` blob `waffle._rebuild_data_cols` would write from these
 * facts: each player's own count (their rows in the log unless said), the
 * team's summed from them in coop, each seat's board as tiles — the shared one
 * in coop, each racer's own in compete — the solution once ended, and where
 * every player stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    title = 'New game',
    clubHandle = 'testclub',
    setup = { difficulty: 2, extra_swaps: 5, timer: { kind: 'none' } },
    parSwaps = 1,
    maxSwaps = 6,
    board: sharedBoard = { letters: ZTest_DEALT, colors: ZTest_DEALT_COLORS },
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined
  const usedOf = (p: ZTest_PlayerFacts) => p.nSwapsUsed ?? events.filter((e) => e.userId === p.id).length

  const players = playerFacts.map(function makePlayer(p, i): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && (!turnBased || turnHolderId === p.id)
    const board = coop ? sharedBoard : (p.board ?? { letters: ZTest_DEALT, colors: ZTest_DEALT_COLORS })
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
      maxSwaps,
      nSwapsUsed: usedOf(p),
      board: { tiles: ZTest_makeTiles(board) },
    }
  })

  return {
    id,
    gametype: `waffle_${mode}`,
    brand: 'SyrupSwap',
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
    puzzle: {
      dealtTiles: makeLetterTiles(ZTest_DEALT),
      parSwaps,
      solution: ended ? makeLetterTiles(ZTest_SOLUTION) : null,
    },
    team: coop ? { nSwapsUsed: players.reduce((sum, p) => sum + p.nSwapsUsed, 0) } : null,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands waffle's `PlayArea`, from the game's facts: the
 * `game_data` blob, and shell_data's roster read off it, viewed by `auth`
 * (`u1` unless said otherwise).
 */
export function ZTest_makeWaffleCtx(
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
