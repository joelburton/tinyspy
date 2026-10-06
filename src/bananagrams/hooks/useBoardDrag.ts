// cs-unmet

import {
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import {
  cellAtPoint,
  useDragGesture,
  type DragGesture,
  type DragState,
} from '@/shared/grid-and-drag/useDragGesture'
import { idx } from '../lib/board'
import type { GCell, GDragSource } from '../types'

function isOverHand(x: number, y: number): boolean {
  return !!document.elementFromPoint(x, y)?.closest('[data-zone="hand"]')
}

function isOverDump(x: number, y: number): boolean {
  return !!document.elementFromPoint(x, y)?.closest('[data-zone="dump"]')
}

/**
 * The board and the hand under the pointer, on the shared drag gesture
 * (`useDragGesture`): a hand tile dragged onto an empty cell is placed, a board
 * tile dragged elsewhere moves or, dropped on the hand, comes back; a tile from
 * either dropped on the dump slot is dumped. A plain tap on a cell puts the
 * keyboard cursor there. An occupied cell refuses a drop, and the tile snaps
 * back.
 *
 * The handlers are registered once and read the latest state through refs;
 * `canDump` and the mutations are read fresh, since the shared gesture reads
 * its options through a ref of its own.
 */
export function useBoardDrag({
  boardRef,
  isBoardInteractiveRef,
  canDump,
  handToBoard,
  boardToBoard,
  boardToHand,
  onDump,
  onTapCell,
}: {
  boardRef: RefObject<string>
  // The board responds to me; a press on an inert board starts nothing.
  isBoardInteractiveRef: RefObject<boolean>
  // The bunch and the bag together can cover a dump's draw.
  canDump: boolean
  handToBoard: (letter: string, x: number, y: number) => void
  boardToBoard: (x1: number, y1: number, x2: number, y2: number) => void
  boardToHand: (x: number, y: number) => void
  onDump: (letter: string) => void | Promise<void>
  onTapCell: (cell: GCell) => void
}): {
  drag: DragState<GDragSource> | null
  hover: GCell | null
  // A dragged tile is over the dump slot.
  dumpHot: boolean
  onCellPointerDown: (x: number, y: number, e: ReactPointerEvent) => void
  onHandPointerDown: (index: number, letter: string, e: ReactPointerEvent) => void
} {
  const [dumpHot, setDumpHot] = useState(false)

  const finishDrag = useCallback(
    (g: DragGesture<GDragSource>, x: number, y: number) => {
      const target = cellAtPoint(x, y)
      if (target) {
        const occupied = boardRef.current[idx(target.x, target.y)] !== '.'
        const ownCell =
          g.source.kind === 'board' && g.source.x === target.x && g.source.y ===
          target.y
        if (occupied && !ownCell) return
        if (g.source.kind === 'hand' && g.letter) handToBoard(g.letter,
          target.x,
          target.y)
        else if (g.source.kind === 'board') boardToBoard(g.source.x,
          g.source.y,
          target.x,
          target.y)
        return
      }
      // A tile dragged off the BOARD may be dumped too: its cell is cleared
      // first, so the board loses the letter as the server drops it from my
      // tiles, and the two never disagree.
      if (isOverDump(x, y) && g.letter && canDump) {
        if (g.source.kind === 'board') boardToHand(g.source.x, g.source.y)
        void onDump(g.letter)
        return
      }
      if (isOverHand(x, y) && g.source.kind === 'board') boardToHand(g.source.x,
        g.source.y)
    },
    [boardRef, handToBoard, boardToBoard, boardToHand, onDump, canDump],
  )

  const onTap = useCallback(
    (g: DragGesture<GDragSource>) => {
      if (g.cell) onTapCell(g.cell)
    },
    [onTapCell],
  )

  const { drag, hover, start } = useDragGesture<GDragSource>({
    onDrop: finishDrag,
    onTap,
    // Any dragged tile can be dumped; the slot lights while one hovers it.
    onDragMove: (x, y) => setDumpHot(isOverDump(x, y)),
    onDragEnd: () => setDumpHot(false),
  })

  const onCellPointerDown = useCallback(
    (x: number, y: number, e: ReactPointerEvent) => {
      if (!isBoardInteractiveRef.current) return
      const letter = boardRef.current[idx(x, y)]
      start({ kind: 'board', x, y },
        letter !== '.' ? letter : null,
        { x, y },
        e)
    },
    [start, boardRef, isBoardInteractiveRef],
  )
  const onHandPointerDown = useCallback(
    (index: number, letter: string, e: ReactPointerEvent) => {
      if (!isBoardInteractiveRef.current) return
      start({ kind: 'hand', index }, letter, null, e)
    },
    [start, isBoardInteractiveRef],
  )

  return { drag, hover, dumpHot, onCellPointerDown, onHandPointerDown }
}
