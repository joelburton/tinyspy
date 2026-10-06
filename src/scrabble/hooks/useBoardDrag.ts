// cs-unmet

import { useCallback, useEffect, useRef } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { GridCursor } from '@/common/board-cursor/gridCursor'
import { cellAtPoint, useDragGesture, type DragGesture } from '@/shared/grid-and-drag/useDragGesture'
import { cellIndex } from '../lib/board'
import type { GCell, GHistoryView, GStagedTile } from '../types'

/** Where a drag started: a rack slot, or a staged tile on the board. */
type DragSource = { kind: 'rack'; rackIdx: number } | { kind: 'board'; x: number; y: number }

/** Is this screen point over the rack? */
function isOverRack(x: number, y: number): boolean {
  return document.elementFromPoint(x, y)?.closest('[data-zone="rack"]') != null
}

/**
 * The display position (0..N) a rack tile dropped at screen-x `px` lands at,
 * by each shown rack tile's horizontal midpoint — left of a tile inserts
 * before it, right of the last inserts at the end. Null when the rack is not
 * on screen.
 */
function findRackInsertIndex(px: number): number | null {
  const tray = document.querySelector('[data-zone="rack"]')
  if (!tray) return null
  const tiles = [...tray.querySelectorAll('[data-rack-tile]')]
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect()
    if (px < r.left + r.width / 2) return i
  }
  return tiles.length
}

/**
 * The board and rack under the pointer, on the shared drag gesture
 * (`useDragGesture`): a rack tile dragged onto an empty cell is staged, a
 * staged tile dragged elsewhere moves or, dropped on the rack, comes back; a
 * rack tile dropped along the rack moves in its order. A plain tap picks a
 * rack tile — for a swap, or to place — and a tap on an empty cell places the
 * one picked tile there (`placePickedAt`); otherwise a tap on a cell puts the
 * keyboard cursor there.
 *
 * While a past turn or a preview is open, a press on the board is the
 * viewer's exit rather than a move. A press is the next move, so it drops the
 * previous move's result from the slot.
 *
 * The handlers are registered once and read the latest state through refs.
 */
export function useBoardDrag({
  cells,
  isInteractive,
  historyView,
  stagedAt,
  placeFromRack,
  placePickedAt,
  moveStaged,
  recall,
  togglePick,
  moveRackTile,
  setCursor,
  localFeedbackSlot,
}: {
  // The live board, with my just-played tiles on it.
  cells: GCell[]
  // May I stage tiles right now — my rack, on the live board.
  isInteractive: boolean
  historyView: GHistoryView
  // The staged move's own (`useStagedTiles`), each stable.
  stagedAt: (x: number, y: number) => GStagedTile | undefined
  placeFromRack: (x: number, y: number, rackIdx: number) => void
  placePickedAt: (x: number, y: number) => 'placed' | 'several' | 'none'
  moveStaged: (from: { x: number; y: number }, to: { x: number; y: number }) => void
  recall: (x: number, y: number) => void
  togglePick: (rackIdx: number) => void
  moveRackTile: (rackIdx: number, insertAt: number) => void
  setCursor: (cursor: GridCursor) => void
  localFeedbackSlot: FeedbackSlot
}) {
  const cellsRef = useRef(cells)
  const isInteractiveRef = useRef(isInteractive)
  useEffect(function syncDragRefs() {
    cellsRef.current = cells
    isInteractiveRef.current = isInteractive
  }, [cells, isInteractive])

  const finishDrag = useCallback(
    (g: DragGesture<DragSource>, px: number, py: number) => {
      const target = cellAtPoint(px, py)
      if (target) {
        const isOwnCell = g.source.kind === 'board' && g.source.x === target.x && g.source.y === target.y
        const isTaken = cellsRef.current[cellIndex(target.x, target.y)].tile !== null
          || stagedAt(target.x, target.y) !== undefined
        // A taken cell snaps the tile back.
        if (isTaken && !isOwnCell) return
        if (g.source.kind === 'rack') placeFromRack(target.x, target.y, g.source.rackIdx)
        else moveStaged(g.source, target)
        return
      }
      if (!isOverRack(px, py)) return
      if (g.source.kind === 'board') {
        recall(g.source.x, g.source.y)
        return
      }
      // People rearrange their tiles to hunt for anagrams.
      const insertAt = findRackInsertIndex(px)
      if (insertAt !== null) moveRackTile(g.source.rackIdx, insertAt)
    },
    [stagedAt, placeFromRack, moveStaged, recall, moveRackTile],
  )

  const onTap = useCallback(
    (g: DragGesture<DragSource>) => {
      if (g.source.kind === 'rack') {
        togglePick(g.source.rackIdx)
        return
      }
      if (!g.cell) return
      // A picked tile goes where the tap lands; with several picked, the tap
      // can't say which, so it does nothing.
      if (placePickedAt(g.cell.x, g.cell.y) === 'several') return
      setCursor({ x: g.cell.x, y: g.cell.y, dir: 'h' })
    },
    [togglePick, placePickedAt, setCursor],
  )

  const { drag, hover, start } = useDragGesture<DragSource>({ onDrop: finishDrag, onTap })

  const exitHistory = historyView.exit
  const viewerTargetRef = historyView.targetRef
  const onCellPointerDown = useCallback(
    (x: number, y: number, e: React.PointerEvent) => {
      if (viewerTargetRef.current !== null) {
        exitHistory()
        return
      }
      if (!isInteractiveRef.current) return
      localFeedbackSlot.dismiss()
      // Only a staged tile drags; a played one is fixed.
      const tile = stagedAt(x, y)
      start({ kind: 'board', x, y }, tile ? tile.letter : null, { x, y }, e)
    },
    [stagedAt, start, localFeedbackSlot, exitHistory, viewerTargetRef],
  )

  const onRackPointerDown = useCallback(
    (rackIdx: number, glyph: string, e: React.PointerEvent) => {
      if (!isInteractiveRef.current) return
      localFeedbackSlot.dismiss()
      start({ kind: 'rack', rackIdx }, glyph, null, e)
    },
    [start, localFeedbackSlot],
  )

  return { drag, hover, onCellPointerDown, onRackPointerDown }
}
