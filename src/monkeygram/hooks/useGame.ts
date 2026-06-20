import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Member } from '../../common/lib/games'
import { emptyBoard } from '../lib/board'

/** Cross-game vocabulary: a player in a MonkeyGram game is just a
 *  Member today (no per-game enrichment). Declared for parity with
 *  the other game folders' `Player` alias. */
export type Player = Member

/**
 * The whole player board as stored in `monkeygram.player_boards.state`:
 * the fixed 25×25 board (a 625-char string) + the unplaced hand (a string
 * of letters). See `lib/board.ts` for the model.
 */
export type MonkeyGramBoardState = {
  board: string
  hand: string
}

const EMPTY_STATE: MonkeyGramBoardState = { board: emptyBoard(), hand: '' }

/**
 * Per-gametype data hook for MonkeyGram.
 *
 * Loads the caller's OWN player board once. RLS on
 * `monkeygram.player_boards` is owner-only, so the unfiltered select returns
 * exactly the caller's row — no peer's board is reachable. The board is
 * private, single-reader state, so it isn't realtime-subscribed; later phases
 * add a realtime subscription to `monkeygram.progress` for peers' counts.
 */
export function useGame(gameId: string) {
  const [state, setState] = useState<MonkeyGramBoardState>(EMPTY_STATE)
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
        const s = (data?.state as Partial<MonkeyGramBoardState> | undefined) ?? EMPTY_STATE
        setState({ board: s.board ?? emptyBoard(), hand: s.hand ?? '' })
        setLoading(false)
      }
      load()
      return () => {
        mounted = false
      }
    },
    [gameId],
  )

  return { state, loading }
}
