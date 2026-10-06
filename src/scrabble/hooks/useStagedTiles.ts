// cs-unmet

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { BLANK, cellIndex } from '../lib/board'
import type { GCell, GHistoryView, GPlacement, GStagedTile, GTentative } from '../types'

/**
 * The move being laid out: the tiles staged on the board this turn, each tied
 * to the rack slot it came from, and the rack tiles picked for a swap. Nothing
 * here reaches the server — `useSubmitMove` sends what it is handed.
 *
 * A tile is staged from the rack (a drag, or a typed letter at the cursor),
 * moved, or taken back. A blank opens the letter picker first: `blankAt` holds
 * where it is going until a letter is chosen. A picked suggestion replaces
 * whatever was staged — the player asked for that move — and is registered
 * with PlayArea, whose info column calls it.
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
  tiles: GStagedTile[]
  // The rack slots staged on the board.
  usedSlots: ReadonlySet<number>
  // The staged tiles by flat cell index, as the board draws them.
  tentatives: ReadonlyMap<number, GTentative>
  // Where a blank is waiting for its letter.
  blankAt: { x: number; y: number; rackIdx: number } | null
  // The rack slots picked for a swap.
  pickedSlots: ReadonlySet<number>
  stagedAt: (x: number, y: number) => GStagedTile | undefined
  placeFromRack: (x: number, y: number, rackIdx: number) => void
  // Stage a typed letter: a rack tile for it, else a blank played as it.
  // False when the rack holds neither.
  placeLetter: (x: number, y: number, letter: string) => boolean
  moveStaged: (from: { x: number; y: number }, to: { x: number; y: number }) => void
  recall: (x: number, y: number) => void
  recallAll: () => void
  pickBlank: (letter: string) => void
  cancelBlank: () => void
  togglePick: (rackIdx: number) => void
  clearPicks: () => void
  // Clear my staged tiles if a move that landed now covers one of their cells.
  dropIfCovered: (landed: GCell[]) => void
} {
  const [tiles, setTiles] = useState<GStagedTile[]>([])
  const [pickedSlots, setPickedSlots] = useState<ReadonlySet<number>>(new Set())
  const [blankAt, setBlankAt] = useState<{ x: number; y: number; rackIdx: number } | null>(null)

  const tilesRef = useRef(tiles)
  const cellsRef = useRef(cells)
  const rackRef = useRef(rack)
  const blankAtRef = useRef(blankAt)
  useEffect(() => {
    tilesRef.current = tiles
    cellsRef.current = cells
    rackRef.current = rack
    blankAtRef.current = blankAt
  }, [tiles, cells, rack, blankAt])

  const stagedAt = useCallback(
    (x: number, y: number) => tilesRef.current.find((t) => t.x === x && t.y === y),
    [],
  )

  const placeFromRack = useCallback((x: number, y: number, rackIdx: number) => {
    const glyph = rackRef.current[rackIdx]
    if (glyph === BLANK) {
      setBlankAt({ x, y, rackIdx })
      return
    }
    setTiles((prev) => [...prev, { x, y, letter: glyph, blank: false, rackIdx }])
  }, [])

  const placeLetter = useCallback((x: number, y: number, letter: string) => {
    // The slot of a tile this one replaces is free again.
    const usedElsewhere = new Set(tilesRef.current
      .filter((t) => !(t.x === x && t.y === y))
      .map((t) => t.rackIdx))
    const free = (glyph: string) => rackRef.current.findIndex((g, i) => !usedElsewhere.has(i) && g === glyph)
    const letterSlot = free(letter)
    const rackIdx = letterSlot >= 0 ? letterSlot : free(BLANK)
    if (rackIdx < 0) return false
    const tile = { x, y, letter, blank: letterSlot < 0, rackIdx }
    setTiles((prev) => [...prev.filter((t) => !(t.x === x && t.y === y)), tile])
    return true
  }, [])

  const moveStaged = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    setTiles((prev) => {
      const tile = prev.find((t) => t.x === from.x && t.y === from.y)
      if (tile === undefined) return prev
      return [...prev.filter((t) => t !== tile), { ...tile, x: to.x, y: to.y }]
    })
  }, [])

  const recall = useCallback((x: number, y: number) => {
    setTiles((prev) => prev.filter((t) => !(t.x === x && t.y === y)))
  }, [])

  const recallAll = useCallback(() => setTiles([]), [])

  const pickBlank = useCallback((letter: string) => {
    // The picker is open only while a blank waits.
    const at = blankAtRef.current!
    setTiles((prev) => [...prev, { x: at.x, y: at.y, letter, blank: true, rackIdx: at.rackIdx }])
    setBlankAt(null)
  }, [])

  const cancelBlank = useCallback(() => setBlankAt(null), [])

  const togglePick = useCallback((rackIdx: number) => {
    setPickedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(rackIdx)) next.delete(rackIdx)
      else next.add(rackIdx)
      return next
    })
  }, [])

  const clearPicks = useCallback(() => setPickedSlots(new Set()), [])

  const dropIfCovered = useCallback((landed: GCell[]) => {
    const isCovered = tilesRef.current.some((t) => landed[cellIndex(t.x, t.y)].tile !== null)
    if (!isCovered) return
    setTiles([])
    // Terse on purpose — the commit slot is narrow.
    localFeedbackSlot.show(FeedbackMessage.result('warning', 'Pre-play cleared: conflict'))
  }, [localFeedbackSlot])

  // A picked suggestion, staged — re-resolved against the live board and rack,
  // since a teammate can play while the list is open; if it no longer fits,
  // nothing is staged and the slot says so. The suggester never sends.
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
  useEffect(function registerApplier() {
    registerSuggestionApplier(applySuggestion)
    return () => registerSuggestionApplier(null)
  }, [registerSuggestionApplier, applySuggestion])

  const usedSlots = useMemo(() => new Set(tiles.map((t) => t.rackIdx)), [tiles])
  const tentatives = useMemo(
    () => new Map(tiles.map((t) => [cellIndex(t.x, t.y), { letter: t.letter, blank: t.blank }])),
    [tiles],
  )

  return {
    tiles,
    usedSlots,
    tentatives,
    blankAt,
    pickedSlots,
    stagedAt,
    placeFromRack,
    placeLetter,
    moveStaged,
    recall,
    recallAll,
    pickBlank,
    cancelBlank,
    togglePick,
    clearPicks,
    dropIfCovered,
  }
}
