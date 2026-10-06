// cs-unmet

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { BLANK, cellIndex, makeCellId } from '../lib/board'
import type { GCell, GHistoryView, GPlacement, GStagedTile, GTile } from '../types'

/** Does this staged tile sit on cell (x, y)? */
function isOnCell(tile: GStagedTile, x: number, y: number): boolean {
  return tile.x === x && tile.y === y
}

/**
 * The move being laid out, before it is submitted. It holds three things:
 *
 *   - **the staged tiles** — the tiles on the board this turn, each tied to the
 *     rack slot it came from;
 *   - **the picks** — the rack tiles picked, for a swap or to place with a tap;
 *   - **a blank waiting for its letter** — where a placed blank is going while
 *     the letter picker is open.
 *
 * Nothing here reaches the server: `useSubmitMove` sends what it is handed.
 *
 * A tile is staged by a drag from the rack, by a typed letter at the cursor, by
 * a tap on a cell with one tile picked, or as part of a picked suggestion; it
 * can be moved, or taken back. A suggestion is registered with PlayArea, whose
 * info column calls it.
 *
 * The functions are stable and read the latest state through refs, so the
 * board's pointer handlers, registered once, can call them.
 */
export function useStagedTiles({
  cells,
  rack,
  historyView,
  localFeedbackSlot,
  registerSuggestionApplier,
}: {
  // The live board, with my just-played tiles on it.
  cells: GCell[]
  // The rack I play from, by slot.
  rack: readonly string[]
  historyView: GHistoryView
  // Where a tile I don't hold, or a suggestion that no longer fits, says so.
  localFeedbackSlot: FeedbackSlot
  registerSuggestionApplier: (fn: ((placements: GPlacement[]) => void) | null) => void
}): {
  // ── The staged move, to read ──
  tiles: GStagedTile[]
  // The rack slots staged on the board.
  usedSlots: ReadonlySet<number>
  // The staged tiles as tiles, keyed by their cell's id, as the board draws them.
  laidTiles: ReadonlyMap<string, GTile>
  // The staged tile on cell (x, y), if any.
  stagedAt: (x: number, y: number) => GStagedTile | undefined

  // ── Placing a tile ──
  // Stage the tile in rack slot `rackIdx` on cell (x, y); a blank waits for its
  // letter first.
  placeFromRack: (x: number, y: number, rackIdx: number) => void
  // A tap on cell (x, y): with exactly one rack tile picked and the cell
  // empty, stage that tile there and drop the pick (`'placed'`). Two or more
  // picked is `'several'`, and the tap does nothing; none picked, or a cell
  // that holds a tile, is `'none'`, and the tap is the cursor's.
  placePickedAt: (x: number, y: number) => 'placed' | 'several' | 'none'
  // Stage a typed letter: a rack tile for it, else a blank played as it.
  // False when the rack holds neither.
  placeLetter: (x: number, y: number, letter: string) => boolean
  // Where a blank is waiting for its letter, or null.
  blankAt: { x: number; y: number; rackIdx: number } | null
  // The letter picker's answer, and its cancel.
  pickBlank: (letter: string) => void
  cancelBlank: () => void

  // ── Moving and taking back ──
  moveStaged: (from: { x: number; y: number }, to: { x: number; y: number }) => void
  recall: (x: number, y: number) => void
  recallAll: () => void
  // Clear my staged tiles if a move that landed now covers one of their cells.
  dropIfCovered: (landed: GCell[]) => void

  // ── The picks ──
  // The rack slots picked — for a swap, or one to place with a tap.
  pickedSlots: ReadonlySet<number>
  togglePick: (rackIdx: number) => void
  clearPicks: () => void
} {
  // ─── What it holds ─────────────────────────────────────────────

  const [tiles, setTiles] = useState<GStagedTile[]>([])
  const [pickedSlots, setPickedSlots] = useState<ReadonlySet<number>>(new Set())
  const [blankAt, setBlankAt] = useState<{ x: number; y: number; rackIdx: number } | null>(null)

  // The latest of each, for the stable functions below to read.
  const tilesRef = useRef(tiles)
  const cellsRef = useRef(cells)
  const rackRef = useRef(rack)
  const blankAtRef = useRef(blankAt)
  const pickedSlotsRef = useRef(pickedSlots)
  useEffect(function syncStagedRefs() {
    tilesRef.current = tiles
    cellsRef.current = cells
    rackRef.current = rack
    blankAtRef.current = blankAt
    pickedSlotsRef.current = pickedSlots
  }, [tiles, cells, rack, blankAt, pickedSlots])

  // ─── The staged move, to read ──────────────────────────────────

  const stagedAt = useCallback(
    (x: number, y: number) => tilesRef.current.find((t) => isOnCell(t, x, y)),
    [],
  )

  // The rack shows these slots as on the board already.
  const usedSlots = useMemo(() => new Set(tiles.map((t) => t.rackIdx)), [tiles])

  // The board draws a staged tile like any other, keyed by its cell.
  const laidTiles = useMemo(() => new Map(tiles.map((t) => {
    const id = makeCellId(t.x, t.y)
    return [id, { id, letter: t.letter, blank: t.blank }]
  })), [tiles])

  // ─── Placing a tile ────────────────────────────────────────────

  // A drag from the rack, or a tap with one tile picked. A blank has no letter
  // yet, so it waits in `blankAt` while the picker asks for one.
  const placeFromRack = useCallback((x: number, y: number, rackIdx: number) => {
    const glyph = rackRef.current[rackIdx]
    if (glyph === BLANK) {
      setBlankAt({ x, y, rackIdx })
      return
    }
    setTiles((prev) => [...prev, { x, y, letter: glyph, blank: false, rackIdx }])
  }, [])

  // A tap on a cell, read against the picks: one picked tile goes there.
  const placePickedAt = useCallback((x: number, y: number) => {
    const picked = pickedSlotsRef.current
    const isEmpty = cellsRef.current[cellIndex(x, y)].tile === null
      && !tilesRef.current.some((t) => isOnCell(t, x, y))
    if (picked.size === 0 || !isEmpty) return 'none'
    if (picked.size > 1) return 'several'
    const [rackIdx] = picked
    placeFromRack(x, y, rackIdx)
    setPickedSlots(new Set())
    return 'placed'
  }, [placeFromRack])

  // A typed letter at the cursor: the rack's own tile for that letter, else a
  // blank declared as it. A tile already staged on the cell is replaced, so its
  // slot counts as free again.
  const placeLetter = useCallback((x: number, y: number, letter: string) => {
    const usedElsewhere = new Set(tilesRef.current
      .filter((t) => !isOnCell(t, x, y))
      .map((t) => t.rackIdx))

    /** The first rack slot holding this glyph and not staged elsewhere, or -1. */
    function findFreeSlot(glyph: string) {
      return rackRef.current.findIndex((g, i) => !usedElsewhere.has(i) && g === glyph)
    }

    const letterSlot = findFreeSlot(letter)
    const rackIdx = letterSlot >= 0 ? letterSlot : findFreeSlot(BLANK)
    if (rackIdx < 0) return false
    const tile = { x, y, letter, blank: letterSlot < 0, rackIdx }
    setTiles((prev) => [...prev.filter((t) => !isOnCell(t, x, y)), tile])
    return true
  }, [])

  // The letter picker's answer: the waiting blank is staged as that letter.
  const pickBlank = useCallback((letter: string) => {
    // The picker is open only while a blank waits.
    const at = blankAtRef.current!
    setTiles((prev) =>
      [...prev, { x: at.x, y: at.y, letter, blank: true, rackIdx: at.rackIdx }]
    )
    setBlankAt(null)
  }, [])

  // The picker closed without a letter: the blank stays in the rack.
  const cancelBlank = useCallback(() => setBlankAt(null), [])

  // ─── Moving and taking back ────────────────────────────────────

  // A staged tile dragged to another cell keeps its rack slot.
  const moveStaged = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    setTiles((prev) => {
      const tile = prev.find((t) => isOnCell(t, from.x, from.y))
      if (tile === undefined) return prev
      return [...prev.filter((t) => t !== tile), { ...tile, x: to.x, y: to.y }]
    })
  }, [])

  // One staged tile back to the rack — a drag onto the rack, or ⌫.
  const recall = useCallback((x: number, y: number) => {
    setTiles((prev) => prev.filter((t) => !isOnCell(t, x, y)))
  }, [])

  // Every staged tile back to the rack — Recall, or a move that landed.
  const recallAll = useCallback(() => setTiles([]), [])

  // An opponent's move landed: my laid-out move stays unless it took a cell I
  // had staged on, when the whole move is cleared and the slot says why.
  const dropIfCovered = useCallback((landed: GCell[]) => {
    const isCovered = tilesRef.current.some((t) => landed[cellIndex(t.x, t.y)].tile !== null)
    if (!isCovered) return
    setTiles([])
    // Terse on purpose — the move slot is narrow.
    localFeedbackSlot.show(FeedbackMessage.result('warning', 'Pre-play cleared: conflict'))
  }, [localFeedbackSlot])

  // ─── The picks ─────────────────────────────────────────────────

  // A tap on a rack tile picks it, or puts it back.
  const togglePick = useCallback((rackIdx: number) => {
    setPickedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(rackIdx)) next.delete(rackIdx)
      else next.add(rackIdx)
      return next
    })
  }, [])

  const clearPicks = useCallback(() => setPickedSlots(new Set()), [])

  // ─── A suggestion staged ───────────────────────────────────────

  // A picked suggestion replaces whatever was staged — the player asked for
  // that move. It is re-checked against the live board and rack, since a
  // teammate can play while the list is open; if it no longer fits, nothing is
  // staged and the slot says so. The suggester never sends.
  const exitHistory = historyView.exit
  const applySuggestion = useCallback((placements: GPlacement[]) => {
    exitHistory()
    const used = new Set<number>()
    const next: GStagedTile[] = []
    for (const p of placements) {
      const isFree = cellsRef.current[cellIndex(p.x, p.y)].tile === null
      const want = p.blank ? BLANK : p.letter
      const rackIdx = rackRef.current.findIndex((g, i) => !used.has(i) && g === want)
      if (!isFree || rackIdx < 0) {
        localFeedbackSlot.show(FeedbackMessage.result('warning', 'Board changed'))
        return
      }
      used.add(rackIdx)
      next.push({ ...p, rackIdx })
    }
    localFeedbackSlot.dismiss()
    setTiles(next)
  }, [exitHistory, localFeedbackSlot])

  // PlayArea holds the way to apply one, for the info column's list to call.
  useEffect(function registerApplier() {
    registerSuggestionApplier(applySuggestion)
    return function unregisterApplier() {
      registerSuggestionApplier(null)
    }
  }, [registerSuggestionApplier, applySuggestion])

  return {
    tiles,
    usedSlots,
    laidTiles,
    stagedAt,
    placeFromRack,
    placePickedAt,
    placeLetter,
    blankAt,
    pickBlank,
    cancelBlank,
    moveStaged,
    recall,
    recallAll,
    dropIfCovered,
    pickedSlots,
    togglePick,
    clearPicks,
  }
}
