import { useEffect, useState } from 'react'
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
export function useGame(gameId: string): { game: CrosswordsGame | null; loading: boolean } {
  const [game, setGame] = useState<CrosswordsGame | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error } = await db
        .from('games')
        .select('mode, puzzle_id, meta')
        .eq('id', gameId)
        .single()
      if (!active) return
      if (error || !data) {
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

  return { game, loading }
}
