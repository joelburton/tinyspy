// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import { GRID, emptyBoard, idx } from './board'
import { DEFAULT_BANANAGRAMS_SETUP } from './setup'
import type { GEventRaw, GGameDataRaw, GPlayerRaw, GSetup } from '../types'

/** A hand of fifteen, the default for every player a test does not deal. */
export const ZTest_TILES = 'bananagramsetup'

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending and the game's
 * end — and their two counts the way `bananagrams._make_json_players` counts
 * them: every letter held, less the board's main block.
 */
export type ZTest_PlayerFacts = {
  id: string
  username: string
  color?: string
  // Every letter they hold; `ZTest_TILES` when absent.
  tiles?: string
  // Their board as last saved; empty when absent.
  board?: string
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
  solvedAt?: string | null
}

/** The facts a test sets up about a game. Everything else is a solo game in
 *  play on an empty board, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  nBunchTiles?: number
  nBagTiles?: number
  clubHandle?: string
  setup?: GSetup
  // The whole log, as the blob carries it.
  events?: GEventRaw[]
  players?: ZTest_PlayerFacts[]
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** A player's ending columns, as `common._concede` writes them. */
export const ZTest_CONCEDED: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

const at = (id: number) => `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`

/** A peel that dealt everyone a tile: the peeler's row, one drawn. */
export function ZTest_peel(id: number, userId: string): GEventRaw {
  return { id, userId, kind: 'peel', tile: null, nDrawn: 1, at: at(id) }
}

/** A dump of `tile`, three drawn. */
export function ZTest_dump(id: number, userId: string, tile: string): GEventRaw {
  return { id, userId, kind: 'dump', tile, nDrawn: 3, at: at(id) }
}

/** Going out: the winning peel's row, nothing drawn. */
export function ZTest_wentOut(id: number, userId: string): GEventRaw {
  return { id, userId, kind: 'went_out', tile: null, nDrawn: 0, at: at(id) }
}

/**
 * A board with `word` laid across from cell (x, y), on top of `board`. The
 * letters are the test's to hold: nothing checks them against the tiles.
 */
export function ZTest_across(board: string, x: number, y: number, word: string): string {
  const cells = board.split('')
  for (let i = 0; i < word.length; i++) cells[idx(x + i, y)] = word[i]!
  return cells.join('')
}

/**
 * The size of the board's largest block of filled cells joined up, down, left
 * or right — `bananagrams._main_block_size`, as the builder counts it.
 */
function mainBlockSize(board: string): number {
  const seen = new Set<number>()
  let largest = 0
  for (let start = 0; start < GRID * GRID; start++) {
    if (board[start] === '.' || seen.has(start)) continue
    seen.add(start)
    const stack = [start]
    let size = 0
    while (stack.length > 0) {
      const cell = stack.pop()!
      size++
      const x = cell % GRID
      const y = Math.floor(cell / GRID)
      const neighbors = [
        y > 0 ? cell - GRID : null,
        y < GRID - 1 ? cell + GRID : null,
        x > 0 ? cell - 1 : null,
        x < GRID - 1 ? cell + 1 : null,
      ]
      for (const n of neighbors) {
        if (n !== null && !seen.has(n) && board[n] !== '.') {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    largest = Math.max(largest, size)
  }
  return largest
}

/**
 * Build the `game_data` blob `bananagrams._rebuild_data_cols` would write from
 * these facts: every seat's letters and board as the builder writes them, the
 * unplaced count off the board's main block, and where every player stands
 * derived. The page's `useGame` is what withholds a rival's letters.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    nBunchTiles = 100,
    nBagTiles = 0,
    clubHandle = 'testclub',
    setup = DEFAULT_BANANAGRAMS_SETUP,
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null

  const players = playerFacts.map(function makePlayer(p): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const tiles = p.tiles ?? ZTest_TILES
    const board = p.board ?? emptyBoard()
    return {
      id: p.id,
      username: p.username,
      color: p.color ?? 'red',
      ai: false,
      // No turn order: nobody has a seat, and whoever is still playing is on
      // turn.
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
      tiles,
      nTiles: tiles.length,
      nUnplacedTiles: Math.max(tiles.length - mainBlockSize(board), 0),
      board: { letters: board },
    }
  })

  return {
    id,
    gametype: 'bananagrams',
    brand: 'MonkeyGrams',
    club: { handle: clubHandle },
    mode: 'compete',
    coop: false,
    compete: true,
    title: `#${id.slice(0, 6).toUpperCase()}`,
    setup,
    turns: null,
    ending,
    ended,
    outcome,
    nBunchTiles,
    nBagTiles,
    team: null,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands bananagrams' `PlayArea`, from the game's facts:
 * the `game_data` and `static_game_data` blobs, and shell_data's roster read
 * off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeBananagramsCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // The two blobs the page hands down, split as the builders write them: the
  // common part create fixed in the static one; the rest in game_data.
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
