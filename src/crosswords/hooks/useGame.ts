// cs-unmet

import { useMemo } from 'react'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { makeCellId } from '../lib/cellId'
import type {
  GBoard,
  GBoardRaw,
  GCell,
  GGameData,
  GGameDataRaw,
  GPlayer,
  GPuzzleTemplate,
} from '../types'

/**
 * Unpack one grid: a `GCell` for every open, non-given cell of the puzzle, in
 * reading order, reading its fill, flags and writer off the packed arrays at
 * the cell's index (types.ts → `GBoardRaw`). A lowercase fill is a letter in
 * pencil; the cell holds it uppercase and says `pencil`. `writersInOrder` is
 * the players in their order in the blob, for the writer digits.
 */
export function makeBoard(
  raw: GBoardRaw,
  puzzle: GPuzzleTemplate,
  writersInOrder: GPlayer[],
): GBoard {
  const wrong = new Set(raw.wrong)
  const revealed = new Set(raw.revealed)
  const breaksRight = new Set(raw.breaksRight)
  const hyphensRight = new Set(raw.hyphensRight)
  const breaksBottom = new Set(raw.breaksBottom)
  const hyphensBottom = new Set(raw.hyphensBottom)

  const cells: GCell[] = []
  puzzle.cells.forEach((row, r) => row.forEach((pc, c) => {
    if (pc.kind !== 'cell' || pc.given) return
    const i = r * puzzle.width + c
    const packed = raw.fills[i]!
    // A digit names the writer's 1-based place; 0 is nobody.
    const writerPlace = raw.writers === null ? 0 : Number(raw.writers[i])
    cells.push({
      id: makeCellId(r, c),
      row: r,
      col: c,
      fill: packed === '' ? null : packed.toUpperCase(),
      pencil: packed !== '' && packed !== packed.toUpperCase(),
      wrong: wrong.has(i),
      revealed: revealed.has(i),
      markRight: breaksRight.has(i) ? 'break' : hyphensRight.has(i) ? 'hyphen' : null,
      markBottom: breaksBottom.has(i) ? 'break' : hyphensBottom.has(i) ? 'hyphen' : null,
      writer: writerPlace === 0 ? null : writersInOrder[writerPlace - 1]!,
    })
  }))
  return { cells, cellsById: Object.fromEntries(cells.map((cell) => [cell.id, cell])) }
}

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would.
 *
 * Coop's one grid, which the blob writes once on the team, is put on every
 * seat: the same `GBoard` object on each, so a component asks a player for
 * their board in either mode.
 *
 * The seat rule: a rival's grid is null while the race is on — the blob
 * carries every racer's, and this is where a seat stops seeing the others'.
 * At the end every grid shows.
 */
export function makeGameData(raw: GGameDataRaw, myId: string): GGameData {
  // `team` goes onto the players; `gd` has none.
  const { team, turns, ending, ...rest } = raw
  // The players first, their boards after: a cell's writer is one of these
  // same objects, so it is the player `playersById` holds.
  // Each carries the grid twice (docs/common-schema.md → A player's facts):
  // spread on, the side's; under `own`, their own — in coop the team's, which
  // is nobody's in particular.
  const players: GPlayer[] = raw.players.map((p) => ({ ...p, board: null, own: { board: null } }))
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  const teamBoard = team === null ? null : makeBoard(team.board, raw.puzzle, players)
  raw.players.forEach((p, i) => {
    const seen = raw.ended || p.id === myId
    const board = teamBoard ?? (seen && p.board !== null ? makeBoard(p.board, raw.puzzle, players) : null)
    players[i]!.board = board
    players[i]!.own.board = board
  })

  // Links that cannot miss get a bare lookup; an ending's `by` is null for a
  // timeout.
  const playerOf = (id: string | null) => (
    id === null
      ? null
      : playersById[id]!)

  // The gate has checked that I am seated, and my own grid is never withheld.
  const me = playersById[myId]! as GGameData['me']

  return {
    ...rest,
    turns: turns === null ? null : { holder: playersById[turns.holder]! },
    ending: ending === null
      ? null
      : {
        reason: ending.reason,
        detail: ending.detail,
        by: playerOf(ending.by),
        winner: playerOf(ending.winner),
      },
    players,
    playersById,
    me,
  }
}

/**
 * Put the page's two blobs back together as `GGameDataRaw`, each key in its
 * place: `static_game_data` holds what create fixed, `game_data` the rest. The
 * puzzle is split across both — the template is static, the solution arrives in
 * `game_data` once the game has ended.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  const changing = gameData as GGameDataRaw
  const fixed = staticGameData as GGameDataRaw
  return { ...changing, ...fixed, puzzle: { ...fixed.puzzle, ...changing.puzzle } }
}

/**
 * Per-gametype data hook for crosswords: `gd`, built from the `game_data` and
 * `static_game_data` blobs the page was handed and who I am. No reads and no
 * subscription: the page re-reads `game_data` on every move, and this is a
 * pure function of the two (plans/seat-view.md → The page is written, not
 * assembled).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 *
 * The cross-cutting machinery (presence, manual-pause, timer) lives on
 * `useCommonGame` inside `GamePage` — see `src/common/game-page/useCommonGame.ts`.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData } {
  if (ctx.gameData === null) {
    throw new Error(
      `no game_data; run crosswords._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
