// cs-unmet

import { traceable, traceCells, tracePath } from './boardTrace'
import { parseBoard } from './solver'
import type { GTraceCells } from '../types'

/**
 * The tracer against a raw board string (`"CATR"`, `"1ITS"` — the face string
 * `boggle.games.board` stores), for tests that write their boards that way.
 * The page traces `gd.puzzle.traceBoard`, built from the tiles.
 */
export function ZTest_tracePathStr(boardStr: string, word: string): number[] | null {
  return tracePath(parseBoard(boardStr), word)
}

export function ZTest_traceCellsStr(boardStr: string, word: string): GTraceCells {
  return traceCells(parseBoard(boardStr), word)
}

export function ZTest_traceableStr(boardStr: string, word: string): boolean {
  return traceable(parseBoard(boardStr), word)
}
