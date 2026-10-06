// cs-unmet

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'

/** How long after the last edit the board is saved. */
const AUTOSAVE_MS = 800

/** What `bananagrams.save_player_board` puts in `data`. The two no-op results
 *  are named rather than silent: a save dropped ON PURPOSE (the game is over,
 *  or this player conceded and their board is frozen) and one that was stored
 *  are different facts, and an unnamed no-op makes them one answer. */
type SavedBoard = { result: 'saved' } | { result: 'game-over' } | { result: 'conceded' } | null

/**
 * Saves my board to the server: a little after each edit, and when the editor
 * unmounts — the unmount save is load-bearing, since `PauseBoundary` unmounts
 * the play surface on pause. Only the board is sent; the tiles I hold are the
 * server's.
 *
 * Hands back `save`, for the two moves that need the server to judge the
 * board as it is on screen (a peel, a check): they await it before their RPC.
 */
export function useBoardAutosave({
  gameId,
  board,
  boardRef,
}: {
  gameId: string
  // The live board, so an edit starts the timer.
  board: string
  // The same board through a ref, read when the timer fires.
  boardRef: RefObject<string>
}): { save: () => Promise<void> } {
  const save = useCallback(() => {
    // Nothing is drawn from the answer — the board on screen is already what
    // was sent — so every arm is about whether something went wrong, and
    // `runRpc` has raised the modal by the time we see it.
    return runRpc<SavedBoard>(
      db.rpc('save_player_board', { p_game_id: gameId, p_board: boardRef.current }),
    ).then((res) => {
      if (res.type === 'ok' && res.data?.result === 'saved') {
        // Stored, and the blobs rebuilt.
      } else if (res.type === 'ok' && res.data?.result === 'game-over') {
        // Dropped ON PURPOSE: a late unmount save must not clobber the final
        // board.
      } else if (res.type === 'ok' && res.data?.result === 'conceded') {
        // Dropped on purpose too: this player is out and their board is frozen.
      } else if (res.type === 'not-ok') {
        // Both are `BUG:`s and the modal is already up.
      } else {
        reportUnhandled('save_player_board', res)
      }
    })
  }, [gameId, boardRef])

  const saveTimer = useRef(0)
  const isFirstBoard = useRef(true)
  useEffect(function saveAfterEdit() {
    // The seeded board is the server's own; nothing to save until it changes.
    if (isFirstBoard.current) {
      isFirstBoard.current = false
      return
    }
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(save, AUTOSAVE_MS)
    return () => clearTimeout(saveTimer.current)
  }, [board, save])

  useEffect(function saveOnUnmount() {
    return () => {
      clearTimeout(saveTimer.current)
      save()
    }
  }, [save])

  return { save }
}
