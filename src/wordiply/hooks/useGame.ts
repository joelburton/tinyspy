import { useEffect, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/**
 * One player in a wordiply game. wordiply adds no per-player state beyond
 * a Member (any club member who joined can guess), so Player is a straight
 * re-export — the per-game vocabulary convention (naming.md → player).
 */
export type Player = Member

/**
 * Shape exposed to the FE — projected from `wordiply.games_state`. The
 * header is immutable for the life of the game (play state lives on
 * common.games), so it loads once. Nothing is hidden: the legal list + the
 * longest word ship from game start; the FE just doesn't RENDER the scores
 * / longest word until terminal.
 */
export type WordiplyGame = {
  id: string
  club_handle: string
  /** Denormalized from `wordiply.games.mode`; drives the OpponentStrip +
   *  win-vs-loss verdict branching in the PlayArea. */
  mode: 'coop' | 'compete'
  /** The 2–4 letter base players extend (a letter-combination, not a word). */
  base: string
  /** The dictionary band the legal child words were drawn from. */
  difficulty: number
  /** The length-score denominator (the bar's target — a hint, never shown
   *  as the answer). */
  max_word_length: number
  /** The actual longest word(s) — shipped, but only rendered at terminal. */
  longestWords: string[]
  /** The full clean legal list, for local trusting-commit validation. */
  legalWords: string[]
  created_at: string
}

/** One accepted guess (a row of `wordiply.guesses`). */
export type GuessRow = {
  id: number
  game_id: string
  user_id: string
  word: string
  length: number
  guess_index: number
  created_at: string
}

/**
 * wordiply's per-gametype data hook. Two data lifecycles (like
 * wordwheel/boggle):
 *   - **The header loads ONCE.** `wordiply.games` is immutable during play
 *     (base + word lists never change; terminal lives on common.games), so
 *     the legal list isn't re-downloaded on every guess.
 *   - **guesses refetches on realtime events.** Every guess flows through
 *     `wordiply.submit_guess`, which appends a `guesses` row that
 *     propagates to peers via postgres-changes. The `games` subscription is
 *     there for replay_board's realtime TOUCH (replay DELETEs guesses rows,
 *     which realtime filters don't reliably match).
 */
export function useGame(gameId: string): {
  game: WordiplyGame | null
  guesses: GuessRow[]
  loading: boolean
  /** True once the guesses rows have loaded at least once — distinct from
   *  `loading` (which flips on the HEADER fetch). Peer narration gates on this
   *  so it seeds against the real backlog, not the empty pre-rows snapshot. */
  rowsLoaded: boolean
} {
  const [game, setGame] = useState<WordiplyGame | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rowsLoaded, setRowsLoaded] = useState(false)

  // The immutable header — fetched once per game. `loading` gates the
  // PlayArea render, so it flips here.
  useEffect(() => {
    let mounted = true
    void (async () => {
      const { data } = await db
        .from('games_state')
        .select('id, club_handle, mode, base, difficulty, max_word_length, longest_words, legal_words, created_at')
        .eq('id', gameId)
        .maybeSingle()
      if (!mounted) return
      if (data) {
        setGame({
          id: data.id as string,
          club_handle: data.club_handle as string,
          mode: data.mode as 'coop' | 'compete',
          base: data.base as string,
          difficulty: data.difficulty as number,
          max_word_length: data.max_word_length as number,
          longestWords: (data.longest_words as string[]) ?? [],
          legalWords: (data.legal_words as string[]) ?? [],
          created_at: data.created_at as string,
        })
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [gameId])

  useRealtimeRefetch({
    tables: [
      { schema: 'wordiply', table: 'guesses', filter: `game_id=eq.${gameId}` },
      // The games row never changes mid-play — this subscription exists for
      // replay_board's realtime TOUCH (see the hook header).
      { schema: 'wordiply', table: 'games', filter: `id=eq.${gameId}` },
    ],
    channelPrefix: 'wordiply',
    id: gameId,
    load: async ({ mounted }) => {
      const { data } = await db
        .from('guesses')
        .select('id, game_id, user_id, word, length, guess_index, created_at')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true })
      if (!mounted()) return
      setGuesses((data ?? []) as GuessRow[])
      setRowsLoaded(true)
    },
  })

  return { game, guesses, loading, rowsLoaded }
}
