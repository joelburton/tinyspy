// cs-unmet

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { GridCursor } from '@/common/board-cursor/gridCursor'
import { DEFAULT_CELL, GRID, MAX_CELL, tilesExtent } from '../lib/board'

/** Cells of breathing room kept around the tiles on a fit. */
const FIT_MARGIN = 3

/**
 * The arena's zoom and scrolling. The grid never resizes — you navigate it
 * with the zoom slider and the scrollbars — so this holds the zoom (`cell`, px
 * per cell), the smallest zoom that still shows the whole grid (`minCell`,
 * measured off the arena on mount and resize), and the scroll position: the
 * arena opens centered on the tiles, a zoom keeps the viewport's center where
 * it was, and the keyboard cursor is kept in view.
 *
 * `fitBox` is the zoom-to-fit's second half: the editor has just moved the
 * tiles to the middle of the grid, and this picks the zoom that shows them
 * with a margin and scrolls to them.
 */
export function useArenaZoom({
  boardRef,
  cursor,
}: {
  // The live board, for the opening center.
  boardRef: RefObject<string>
  // Kept in view as it moves.
  cursor: GridCursor
}): {
  scrollRef: RefObject<HTMLDivElement | null>
  cell: number
  minCell: number
  onZoom: (next: number) => void
  // Back to the default zoom, scrolled to the middle of the grid.
  showArenaCenter: () => void
  // Zoom to show a box of tiles (in cells) with a margin, and scroll to it.
  fitBox: (box: { left: number; top: number; w: number; h: number }) => void
} {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [cell, setCell] = useState(DEFAULT_CELL)
  const [minCell, setMinCell] = useState(24)

  // A zoom keeps the viewport's center fixed: the center is noted in cells
  // before the zoom and scrolled back to after it.
  const zoomAnchor = useRef<{ cx: number; cy: number } | null>(null)
  const onZoom = useCallback(
    (next: number) => {
      const c = scrollRef.current
      if (c) {
        zoomAnchor.current = {
          cx: (c.scrollLeft + c.clientWidth / 2) / cell,
          cy: (c.scrollTop + c.clientHeight / 2) / cell,
        }
      }
      setCell(next)
    },
    [cell],
  )
  useLayoutEffect(function keepCenterAcrossZoom() {
    const c = scrollRef.current
    if (!c || !zoomAnchor.current) return
    const { cx, cy } = zoomAnchor.current
    c.scrollLeft = cx * cell - c.clientWidth / 2
    c.scrollTop = cy * cell - c.clientHeight / 2
    zoomAnchor.current = null
  }, [cell])

  // Open centered on the tiles, or on the middle of an empty grid.
  useLayoutEffect(function openOnTheTiles() {
    const c = scrollRef.current
    if (!c) return
    const ext = tilesExtent(boardRef.current)
    const cy = ext ? (ext.minY + ext.maxY + 1) / 2 : GRID / 2
    const cx = ext ? (ext.minX + ext.maxX + 1) / 2 : GRID / 2
    c.scrollLeft = cx * cell - c.clientWidth / 2
    c.scrollTop = cy * cell - c.clientHeight / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The smallest zoom shows the WHOLE grid and no more: the arena's shorter
  // side over the grid's cells, measured on mount and resize.
  useLayoutEffect(function measureMinZoom() {
    const c = scrollRef.current
    if (!c) return
    const ro = new ResizeObserver(() => {
      const el = scrollRef.current
      if (!el) return
      const m = Math.max(8, Math.floor(Math.min(el.clientWidth, el.clientHeight) / GRID))
      setMinCell(m)
      setCell((cur) => Math.max(cur, m))
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  // Scroll just enough to keep the cursor in view; the grid itself never moves.
  useLayoutEffect(function keepCursorInView() {
    const c = scrollRef.current
    if (!c) return
    const m = cell
    const x = cursor.x * cell
    const y = cursor.y * cell
    if (x - m < c.scrollLeft) {
      c.scrollLeft = x - m
    } else if (x + cell + m > c.scrollLeft + c.clientWidth) {
      c.scrollLeft = x + cell + m - c.clientWidth
    }
    if (y - m < c.scrollTop) {
      c.scrollTop = y - m
    } else if (y + cell + m > c.scrollTop + c.clientHeight) {
      c.scrollTop = y + cell + m - c.clientHeight
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.x, cursor.y])

  const showArenaCenter = useCallback(() => {
    setCell(DEFAULT_CELL)
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      el.scrollLeft = (GRID / 2) * DEFAULT_CELL - el.clientWidth / 2
      el.scrollTop = (GRID / 2) * DEFAULT_CELL - el.clientHeight / 2
    })
  }, [])

  const fitBox = useCallback(
    ({ left, top, w, h }: { left: number; top: number; w: number; h: number }) => {
      const c = scrollRef.current
      if (!c) return
      const usedW = Math.min(GRID, w + 2 * FIT_MARGIN)
      const usedH = Math.min(GRID, h + 2 * FIT_MARGIN)
      const fit = Math.max(
        minCell,
        Math.min(MAX_CELL, Math.floor(Math.min(c.clientWidth / usedW, c.clientHeight / usedH))),
      )
      setCell(fit)
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (!el) return
        el.scrollLeft = (left + w / 2) * fit - el.clientWidth / 2
        el.scrollTop = (top + h / 2) * fit - el.clientHeight / 2
      })
    },
    [minCell],
  )

  return { scrollRef, cell, minCell, onZoom, showArenaCenter, fitBox }
}
