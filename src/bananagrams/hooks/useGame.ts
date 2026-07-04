import { useRef, useState } from 'react'
import { db } from '../db'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import type { Member } from '../../common/lib/games'

/** Cross-game vocabulary: a player in a bananagrams game is just a
 *  Member today (no per-game enrichment). Declared for parity with
 *  the other game folders' `Player` alias. */
export type Player = Member

/**
 * Per-gametype data hook for bananagrams — the caller's OWN player board.
 *
 * Two split pieces (see the bananagrams.player_boards comment):
 *
 *   - `initialBoard` — the FE-owned placement grid, read ONCE for seeding.
 *     The FE owns the board after mount, so we never re-seed it (a realtime
 *     echo of our own snapshot must not clobber live local placements).
 *   - `tiles` — the SERVER-owned holdings, kept LIVE: a peel/dump updates it
 *     server-side and the realtime subscription folds the change in, so the
 *     derived hand grows/swaps without the FE ever writing `tiles`.
 *
 * RLS on player_boards is owner-only, so the subscription + select see exactly
 * the caller's row (no peer's board). Pattern A: re-read on any change — the
 * row is tiny and `tiles` changes only at deal/peel/dump (board snapshots also
 * echo here, but re-reading the unchanged `tiles` is a harmless no-op).
 */
export function useGame(gameId: string) {
  const [initialBoard, setInitialBoard] = useState<string | null>(null)
  const [tiles, setTiles] = useState('')
  const seeded = useRef(false)

  useRealtimeRefetch({
    tables: { schema: 'bananagrams', table: 'player_boards', filter: `game_id=eq.${gameId}` },
    channelPrefix: 'bananagrams-board',
    id: gameId,
    load: async ({ mounted }) => {
      const { data } = await db
        .from('player_boards')
        .select('board, tiles')
        .eq('game_id', gameId)
        .maybeSingle()
      if (!mounted() || !data) return
      if (!seeded.current) {
        setInitialBoard(data.board)
        seeded.current = true
      }
      setTiles(data.tiles)
    },
  })

  return { initialBoard, tiles, loading: initialBoard === null }
}

/** One row of `bananagrams.progress` — the public per-player projection peers
 *  read: unplaced/placed counts + the done flag. The per-player `conceded`
 *  drop-out flag is NOT here — it moved to the shared `common.game_players`
 *  roster (read off ctx.players; see common.concede). */
export type ProgressRow = {
  user_id: string
  unplaced: number
  placed: number
  done: boolean
}

/**
 * Subscribe to every player's `bananagrams.progress` row for this game — the
 * thin realtime surface (counts only, never boards). `progress` is
 * club-readable, so the caller sees all players' rows; the PeersStrip renders
 * the opponents'. Pattern A (refetch on any change) — the table is tiny
 * (one row per player) and updates at most on each player's debounced save.
 */
export function useProgress(gameId: string): ProgressRow[] {
  const [rows, setRows] = useState<ProgressRow[]>([])
  useRealtimeRefetch({
    tables: { schema: 'bananagrams', table: 'progress', filter: `game_id=eq.${gameId}` },
    channelPrefix: 'bananagrams-progress',
    id: gameId,
    load: async ({ mounted }) => {
      const { data } = await db
        .from('progress')
        .select('user_id, unplaced, placed, done')
        .eq('game_id', gameId)
      if (!mounted()) return
      setRows(data ?? [])
    },
  })
  return rows
}
