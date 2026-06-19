import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/** Cross-game vocabulary: a player in a MonkeyGram game is just a
 *  Member today (no per-game enrichment). Declared for parity with
 *  the other game folders' `Player` alias. */
export type Player = Member

/** A single tile. `id` is the tile's stable identity (its position in
 *  the shuffled bag); `letter` rides along so a board never needs to
 *  look a tile up. On the board it also carries `row`/`col`. */
export type MonkeyGramTile = { id: string; letter: string }
export type MonkeyGramPlacement = MonkeyGramTile & { row: number; col: number }

/** The whole player board as stored in `monkeygram.player_boards.state`
 *  — sparse placements on an unbounded grid + the unplaced hand. */
export type MonkeyGramBoardState = {
  placements: MonkeyGramPlacement[]
  hand: MonkeyGramTile[]
}

const EMPTY_BOARD: MonkeyGramBoardState = { placements: [], hand: [] }

/**
 * Per-gametype data hook for MonkeyGram.
 *
 * **Phase 1 (this file)** loads the caller's OWN player board once.
 * RLS on `monkeygram.player_boards` is owner-only, so the unfiltered
 * select returns exactly the caller's row — no peer's board is
 * reachable. The board is private, single-reader state, so it isn't
 * realtime-subscribed; later phases add the snapshot-write side
 * (`save_player_board`) and a realtime subscription to
 * `monkeygram.progress` for peers' unplaced counts.
 */
export function useGame(gameId: string) {
  const [board, setBoard] = useState<MonkeyGramBoardState>(EMPTY_BOARD)
  const [loading, setLoading] = useState(true)

  useEffect(
    function loadOwnBoard() {
      let mounted = true
      async function load() {
        const { data } = await db
          .from('player_boards')
          .select('state')
          .eq('game_id', gameId)
          .maybeSingle()
        if (!mounted) return
        const state = (data?.state as MonkeyGramBoardState | undefined) ?? EMPTY_BOARD
        setBoard({
          placements: state.placements ?? [],
          hand: state.hand ?? [],
        })
        setLoading(false)
      }
      load()
      return () => {
        mounted = false
      }
    },
    [gameId],
  )

  return { board, loading }
}
