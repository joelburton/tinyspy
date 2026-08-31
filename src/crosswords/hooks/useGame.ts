// cs-unmet

import { useEffect, useState } from 'react'
import { readRows } from '../../common/lib/supabase/dbResult'
import type { NotOk } from '../../common/lib/supabase/envelope'
import { db } from '../db'
import type { PuzzleTemplate } from '../lib/types'

export type CrosswordsGame = {
  mode: 'coop' | 'compete'
  puzzleId: string | null
  /** The immutable template: PuzzleMeta + the initial grid cells. */
  meta: PuzzleTemplate
}

/**
 * Loads the immutable crosswords game header ONCE. The template (grid +
 * clues) and mode never change, so — like boggle — this is a plain
 * one-shot fetch, not a realtime subscription. The live cell fills flow
 * through `useCells`; the game's play_state / status / players flow through
 * `useCommonGame` (via the PlayArea's ctx). The `solution` column is
 * shielded and never fetched here.
 */
export function useGame(gameId: string): {
  game: CrosswordsGame | null
  loading: boolean
  /** Set when the read FAILED, which is not the same as the game being absent.
   *  The surface renders this instead of "Game not found." */
  failure: NotOk | null
} {
  const [game, setGame] = useState<CrosswordsGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOk | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      // No `.single()`: it treats zero rows as an ERROR, so a game this club
      // cannot see arrived looking exactly like a broken connection. `readRows`
      // hands back rows, and `id` is the PK, so this is 0 or 1 of them.
      const res = await readRows(
        db.from('games').select('mode, puzzle_id, meta').eq('id', gameId),
      )
      if (!active) return

      // A read can only fail as a FAULT — `readRows` never authors anything else
      // — and `dbFetch` has already logged it and raised the modal. What is left
      // is the sentence BEHIND it, plus a line naming which read it was.
      if (res.type === 'not-ok') {
        setFailure(res)
        setLoading(false)
        return
      }
      // ZERO ROWS is the caller's to read: no game with that id, or one this
      // club cannot see.
      const data = res.data[0]
      if (!data) {
        setLoading(false)
        return
      }
      setGame({
        mode: data.mode as 'coop' | 'compete',
        puzzleId: (data.puzzle_id as string | null) ?? null,
        meta: data.meta as unknown as PuzzleTemplate,
      })
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [gameId])

  return { game, loading, failure }
}
