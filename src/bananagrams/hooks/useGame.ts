import { useEffect, useRef, useState } from 'react'
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
 * **Filters on `user_id` explicitly.** It used to lean on RLS for that —
 * player_boards was owner-only, so `eq(game_id)` alone could only ever match
 * one row. That stopped being true when the policy opened at terminal so the
 * printout could show every player's grid: the select then matched the whole
 * table, `maybeSingle()` errored, and the board never loaded — no board, no
 * hand, no print menu item, for every player in a finished game. A query that
 * depends on a policy to be correct breaks silently the day the policy moves,
 * so it now says what it means.
 *
 * Pattern A: re-read on any change — the row is tiny and `tiles` changes only
 * at deal/peel/dump (board snapshots also echo here, but re-reading the
 * unchanged `tiles` is a harmless no-op).
 */
export function useGame(gameId: string, userId: string) {
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
        .eq('user_id', userId)
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
  solved: boolean
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
        .select('user_id, unplaced, placed, solved')
        .eq('game_id', gameId)
      if (!mounted()) return
      setRows(data ?? [])
    },
  })
  return rows
}

/**
 * Every player's finished board — for the printout's per-player columns.
 *
 * **Terminal only, and that's an RLS fact, not a policy choice here.**
 * `player_boards` is owner-only while the race is on (a rival must not read
 * your grid or your rack), and opens to the club once the game ends. So this
 * asks only at terminal; before then the select would return one row anyway.
 *
 * Not realtime and not a `useRealtimeRefetch`: a terminal game's boards don't
 * move, so this is a single read once `isTerminal` flips. It deliberately does
 * NOT feed the play surface — the screen still shows only your own board, and
 * this exists so the PDF can put the finished grids side by side.
 */
export function usePeerBoards(
  gameId: string,
  isTerminal: boolean,
): { user_id: string; board: string }[] {
  const [rows, setRows] = useState<{ user_id: string; board: string }[]>([])
  useEffect(() => {
    if (!isTerminal) return
    let mounted = true
    void (async () => {
      const { data } = await db
        .from('player_boards')
        .select('user_id, board')
        .eq('game_id', gameId)
      if (mounted) setRows(data ?? [])
    })()
    return () => {
      mounted = false
    }
  }, [gameId, isTerminal])
  return rows
}
