// cs-unmet

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GBoard, GCellChanges, GPendingWrites } from '../types'

/** One write of mine, from the moment it is made until the blob carries it. */
type PendingWrite = {
  handle: number
  cellId: string
  changes: GCellChanges
  // The revision its RPC answered; null while the RPC is out.
  revision: number | null
}

/** Still not in a blob of `revision`: its RPC is out, or answered later. */
function isPending(write: PendingWrite, revision: number): boolean {
  return write.revision === null || write.revision > revision
}

/** `board` with each write laid over its cell, in the order the writes were
 *  made, so a later keystroke on a cell wins. */
function applyWrites(board: GBoard, writes: PendingWrite[]): GBoard {
  const cellsById = { ...board.cellsById }
  for (const w of writes) cellsById[w.cellId] = { ...cellsById[w.cellId]!, ...w.changes }
  return { cells: board.cells.map((c) => cellsById[c.id]!), cellsById }
}

/**
 * My writes that the blob does not carry yet, drawn over my board — so a letter
 * shows the moment it is typed, and a read that started before the keystroke
 * cannot briefly undo it.
 *
 * **When a write leaves.** Not when the blob shows the same letter: a teammate
 * who overwrites or clears my cell right after me would then be hidden behind
 * my letter. A write leaves once the blob is known to be at least as new as it:
 * `set_cell` and `set_mark` answer the revision their own rebuild of the blobs
 * wrote, revisions follow the order the writes commit in (they are raised under
 * the game row's lock), so a blob carrying that revision or a later one carries
 * the write — whatever it now shows for the cell. A write whose RPC is still
 * out stays; a write whose RPC failed leaves at once.
 *
 * @param board     my board as the blob has it (`gd.me.board`)
 * @param revision  the blob's revision (`gd.revision`)
 */
export function usePendingWrites({
  board,
  revision,
}: {
  board: GBoard
  revision: number
}): { pendingWrites: GPendingWrites } {
  const [writes, setWrites] = useState<PendingWrite[]>([])
  const nextHandle = useRef(0)
  // The blob's revision, for the setters to prune by. Synced after render.
  const revisionRef = useRef(revision)
  useEffect(() => {
    revisionRef.current = revision
  }, [revision])

  // A write the blob has caught up with stops drawing at once, before the next
  // setter prunes it from state.
  const stillPending = useMemo(
    () => writes.filter((w) => isPending(w, revision)),
    [writes, revision],
  )
  const shownBoard = useMemo(
    () => (stillPending.length === 0 ? board : applyWrites(board, stillPending)),
    [board, stillPending],
  )

  const add = useCallback((cellId: string, changes: GCellChanges) => {
    const handle = nextHandle.current++
    setWrites((prev) => [
      ...prev.filter((w) => isPending(w, revisionRef.current)),
      { handle, cellId, changes, revision: null },
    ])
    return handle
  }, [])

  const settle = useCallback((handle: number, answered: number) => {
    setWrites((prev) => prev
      .map((w) => (w.handle === handle ? { ...w, revision: answered } : w))
      .filter((w) => isPending(w, revisionRef.current)))
  }, [])

  const drop = useCallback((handle: number) => {
    setWrites((prev) => prev.filter((w) => w.handle !== handle))
  }, [])

  const pendingWrites = useMemo(
    () => ({ board: shownBoard, add, settle, drop }),
    [shownBoard, add, settle, drop],
  )
  return { pendingWrites }
}
