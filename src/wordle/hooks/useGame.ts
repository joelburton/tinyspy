import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import type { Member } from '../../common/lib/games'
import { db } from '../db'

/** A wordle player. No fixed seats — every game_player can guess. */
export type Player = Member

/**
 * The game header, projected from `wordle.games_state`. `target` is
 * NULL during play and materializes once the game is terminal (the
 * end-of-game reveal).
 */
export type WordleGame = {
  id: string
  mode: 'coop' | 'compete'
  max_guesses: number
  target: string | null
}

/** Per-player state, from `wordle.players`. Coop rows move in
 *  lock-step (shared budget); compete rows are independent. */
export type WordlePlayerState = {
  user_id: string
  guesses_used: number
  solved: boolean
  solved_at: string | null
}

/**
 * One row from `wordle.guesses`. In coop the FE receives every player's
 * guess (the shared board); in compete RLS filters server-side so the
 * FE only sees its own rows until the game ends (then opponents open
 * up). `colors` is the 5-char g/y/x feedback.
 */
export type WordleGuess = {
  user_id: string
  guess_index: number
  guess: string
  colors: string
  is_correct: boolean
}

/**
 * wordle's per-gametype data hook (both modes share it) — the
 * refetch-only realtime pattern. Every guess flows through
 * `wordle.submit_guess`, which writes `wordle.{players, guesses}`; those
 * propagate to peers via the postgres-changes subscription and we
 * refetch. Subscribes to the base tables (Realtime watches tables, not
 * views); reads `games_state` (the only path to the gated target).
 */
export function useGame(gameId: string): {
  game: WordleGame | null
  players: WordlePlayerState[]
  guesses: WordleGuess[]
  loading: boolean
} {
  const [game, setGame] = useState<WordleGame | null>(null)
  const [players, setPlayers] = useState<WordlePlayerState[]>([])
  const [guesses, setGuesses] = useState<WordleGuess[]>([])
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: [
      { schema: 'wordle', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'wordle', table: 'players', filter: `game_id=eq.${gameId}` },
      { schema: 'wordle', table: 'guesses', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'wordle',
    id: gameId,
    load: async ({ mounted }) => {
      const [gameRes, playersRes, guessesRes] = await Promise.all([
        db
          .from('games_state')
          .select('id, mode, max_guesses, target')
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('players')
          .select('user_id, guesses_used, solved, solved_at')
          .eq('game_id', gameId),
        db
          .from('guesses')
          .select('user_id, guess_index, guess, colors, is_correct')
          .eq('game_id', gameId)
          .order('guess_index', { ascending: true }),
      ])
      if (!mounted()) return

      if (!gameRes.data) {
        setGame(null)
        setPlayers([])
        setGuesses([])
        setLoading(false)
        return
      }

      setGame({
        id: gameRes.data.id as string,
        mode: gameRes.data.mode as 'coop' | 'compete',
        max_guesses: gameRes.data.max_guesses as number,
        target: (gameRes.data.target as string | null) ?? null,
      })
      setPlayers((playersRes.data ?? []) as WordlePlayerState[])
      setGuesses((guessesRes.data ?? []) as WordleGuess[])
      setLoading(false)
    },
  })

  return { game, players, guesses, loading }
}
