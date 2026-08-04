import { useMemo, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import type { Coord } from '../lib/board'
import { db } from '../db'

/** One row of `strands.guesses` — every submission, accepted or not. */
export type GuessRow = {
  id: string
  game_id: string
  user_id: string
  word: string
  path: Coord[]
  result: 'theme' | 'spangram' | 'hint_word' | 'duplicate' | 'too_short' | 'invalid'
  guessed_at: string
}

/** The answer key — null for the whole game, filled in at the reveal. */
export type StrandsSolution = {
  spangram: { word: string; coords: Coord[] }
  themeWords: Array<{ word: string; coords: Coord[] }>
}

/** Projected from `strands.games_state`. */
export type StrandsGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  puzzle_date: string | null
  /** 8 rows of 6 letters. */
  board: string[]
  /** The theme prompt — shown from the first second; not a spoiler. */
  clue: string
  /** The shared coop hint bar, and what it costs to cash. */
  hint_points: number
  hints_spent: number
  hint_cost: number
  /** The cells of a spent hint's word, or null. COORDS ONLY — never the word. */
  active_hint_coords: Coord[] | null
  min_word_length: number
  band: number
  /** NULL until `common.games.solution_revealed`. */
  solution: StrandsSolution | null
}

/**
 * strands' per-gametype data hook.
 *
 * **Both halves refetch**, which is the difference from wordiply/boggle, where
 * the header loads once. `strands.games` is genuinely mutable during play — the
 * hint bar fills, a hint appears, the solution arrives at the reveal — and the
 * hint pool is SHARED in coop, so a peer spending a hint has to land on
 * everyone's screen. Treating the header as immutable here would freeze the bar
 * at whatever it read on mount.
 *
 * There is **no Broadcast channel**, deliberately. A peer sees your word when
 * you SUBMIT it; nobody watches anyone else's tiles light up mid-trace. That is
 * the opposite of connections (which shares partial selection so coop players
 * build a guess together), and it means postgres_changes on these two tables
 * carries everything. Recorded here so the absence doesn't read as an oversight.
 */
export function useGame(gameId: string): {
  game: StrandsGame | null
  /** EVERY row — the turn log wants the rejects too. */
  guesses: GuessRow[]
  /** Just the found theme words + spangram: the board's persistent paths. */
  found: GuessRow[]
  loading: boolean
  /** True once the guess rows have loaded at least once. Distinct from
   *  `loading`, which tracks the game row. */
  rowsLoaded: boolean
} {
  const [game, setGame] = useState<StrandsGame | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rowsLoaded, setRowsLoaded] = useState(false)

  useRealtimeRefetch({
    tables: [
      { schema: 'strands', table: 'guesses', filter: `game_id=eq.${gameId}` },
      // Not just a replay touch (as in wordiply): the hint bar, the active
      // hint, and the revealed solution all live on this row and all change
      // during play.
      { schema: 'strands', table: 'games', filter: `id=eq.${gameId}` },
    ],
    channelPrefix: 'strands',
    id: gameId,
    load: async ({ mounted }) => {
      const [{ data: g }, { data: rows }] = await Promise.all([
        db
          .from('games_state')
          .select(
            'id, club_handle, mode, puzzle_date, board, clue, hint_points, hints_spent,'
            + ' hint_cost, active_hint_coords, min_word_length, band, solution',
          )
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('guesses')
          .select('id, game_id, user_id, word, path, result, guessed_at')
          .eq('game_id', gameId)
          .order('guessed_at', { ascending: true }),
      ])
      if (!mounted()) return
      if (g) setGame(g as unknown as StrandsGame)
      setGuesses((rows ?? []) as GuessRow[])
      setLoading(false)
      setRowsLoaded(true)
    },
  })

  // Split once, here, so no consumer has to remember which results are the ones
  // that persist on the board.
  const found = useMemo(
    () => guesses.filter((g) => g.result === 'theme' || g.result === 'spangram'),
    [guesses],
  )

  return { game, guesses, found, loading, rowsLoaded }
}
