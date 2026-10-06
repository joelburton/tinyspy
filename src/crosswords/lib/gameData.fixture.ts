// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import { CROSSWORDS_DEFAULTS } from './setup'
import type {
  GBoardRaw,
  GGameDataRaw,
  GMarkType,
  GPlayerRaw,
  GPuzzleTemplate,
  GSetup,
  GSolution,
} from '../types'

/**
 * A 2×3 puzzle with one of everything a grid can hold: four open cells, a
 * block at (0,2), and a given E at (1,2). Answers C A / T S, the given E.
 *
 *     C A #
 *     T S e   (e the given)
 */
export const ZTest_PUZZLE: GPuzzleTemplate = {
  id: 'toy',
  title: 'Toy',
  author: 'T',
  copyright: '',
  note: '',
  width: 3,
  height: 2,
  clues: {
    across: [{ number: 1, text: '1a' }, { number: 3, text: '3a' }],
    down: [{ number: 1, text: '1d' }, { number: 2, text: '2d' }],
  },
  cells: [
    [
      { kind: 'cell', number: 1, fill: null },
      { kind: 'cell', number: 2, fill: null },
      { kind: 'block' },
    ],
    [
      { kind: 'cell', number: 3, fill: null },
      { kind: 'cell', number: null, fill: null },
      { kind: 'cell', number: null, fill: 'E', given: true },
    ],
  ],
}

/** `ZTest_PUZZLE`'s answer key. */
export const ZTest_SOLUTION: GSolution = [
  [['C'], ['A'], null],
  [['T'], ['S'], ['E']],
]

/** What a test sets about one cell of a grid: its place, and anything on it. */
export type ZTest_CellFacts = {
  row: number
  col: number
  // Uppercase, as the grid stores it; null or absent when empty.
  fill?: string | null
  pencil?: boolean
  wrong?: boolean
  revealed?: boolean
  markRight?: GMarkType
  markBottom?: GMarkType
  // Who last filled it, by id; coop only.
  writer?: string
}

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending and the game's
 * end.
 */
export type ZTest_PlayerFacts = {
  id: string
  username: string
  color?: string
  // Their own grid's cells, in compete; ignored in coop.
  cells?: ZTest_CellFacts[]
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
  solvedAt?: string | null
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play on `ZTest_PUZZLE`, blank, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  clubHandle?: string
  setup?: GSetup
  revision?: number
  // Coop's one grid; ignored in compete.
  cells?: ZTest_CellFacts[]
  players?: ZTest_PlayerFacts[]
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** A player's ending columns, as `common._concede` writes them. */
export const ZTest_CONCEDED: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

/**
 * One grid packed as `crosswords._make_json_board` packs it: the fills flat,
 * row by row, a penciled letter lowercase; the flags and the edge marks as
 * lists of cell indices; in coop, one writer digit per cell — the writer's
 * 1-based place in `playerIds`, 0 for nobody. `playerIds` is null in compete,
 * which writes no writers.
 */
export function ZTest_packBoard(cells: ZTest_CellFacts[], playerIds: string[] | null): GBoardRaw {
  const n = ZTest_PUZZLE.width * ZTest_PUZZLE.height
  const indexOf = (c: ZTest_CellFacts) => c.row * ZTest_PUZZLE.width + c.col
  const fills = Array.from({ length: n }, () => '')
  const writers = Array.from({ length: n }, () => '0')
  for (const c of cells) {
    const i = indexOf(c)
    if (c.fill) fills[i] = c.pencil ? c.fill.toLowerCase() : c.fill
    if (c.writer && c.fill) writers[i] = String(playerIds!.indexOf(c.writer) + 1)
  }
  const where = (has: (c: ZTest_CellFacts) => boolean) =>
    cells.filter(has).map(indexOf).sort((a, b) => a - b)
  return {
    fills,
    wrong: where((c) => c.wrong === true),
    revealed: where((c) => c.revealed === true),
    breaksRight: where((c) => c.markRight === 'break'),
    hyphensRight: where((c) => c.markRight === 'hyphen'),
    breaksBottom: where((c) => c.markBottom === 'break'),
    hyphensBottom: where((c) => c.markBottom === 'hyphen'),
    writers: playerIds === null ? null : writers.join(''),
  }
}

/**
 * Build the `game_data` blob `crosswords._rebuild_data_cols` would write from
 * these facts: the puzzle with its solution once the game has ended, coop's
 * one grid on the team and every racer's on their player, each packed, and
 * where every player stands derived. The page's `useGame` is what withholds a
 * rival's grid.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    clubHandle = 'testclub',
    setup = CROSSWORDS_DEFAULTS,
    revision = 1,
    cells = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const playerIds = playerFacts.map((p) => p.id)

  const players = playerFacts.map(function makePlayer(p): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
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
      board: coop ? null : ZTest_packBoard(p.cells ?? [], null),
    }
  })

  return {
    id,
    gametype: `crosswords_${mode}`,
    brand: 'CrossPlay',
    club: { handle: clubHandle },
    mode,
    coop,
    compete: !coop,
    oneBoard: coop,
    title: ZTest_PUZZLE.title,
    setup,
    turns: null,
    ending,
    ended,
    outcome,
    puzzle: { ...ZTest_PUZZLE, solution: ended ? ZTest_SOLUTION : null },
    revision,
    team: coop ? { board: ZTest_packBoard(cells, playerIds) } : null,
    players,
  }
}

/**
 * The props `<GamePage>` hands crosswords' `PlayArea`, from the game's facts:
 * the `game_data` and `static_game_data` blobs, and shell_data's roster read
 * off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeCrosswordsCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // The two blobs the page hands down, split as the builders write them: what
  // create fixed, the template included, in the static one; the rest, the
  // solution included, in game_data.
  const { id, gametype, brand, club, mode, coop, compete, oneBoard, setup, puzzle, ...changing } = raw
  const { solution, ...template } = puzzle
  return ZTest_makePlayAreaLoaderProps({
    gameId: raw.id,
    gametype: raw.gametype,
    title: raw.title,
    clubHandle: raw.club.handle,
    ended: raw.ended,
    players: raw.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, ai: p.ai, stillPlaying: p.stillPlaying,
    })),
    gameData: { ...changing, puzzle: { solution } },
    staticGameData: { id, gametype, brand, club, mode, coop, compete, oneBoard, setup, puzzle: template },
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
