// cs-unmet

import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import type { Member } from '../../common/lib/games'
import { readRows } from '../../common/lib/supabase/dbResult'
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
export type GuessRow = {
  user_id: string
  seq: number
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
  guesses: GuessRow[]
  loading: boolean
} {
  const [game, setGame] = useState<WordleGame | null>(null)
  const [players, setPlayers] = useState<WordlePlayerState[]>([])
  const [guesses, setGuesses] = useState<GuessRow[]>([])
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
        // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK,
        // so this is 0 or 1 of them.
        readRows(
          db
            .from('games_state')
            .select('id, mode, max_guesses, target')
            .eq('id', gameId),
        ),
        readRows(
          db
            .from('players')
            .select('user_id, guesses_used, solved, solved_at')
            .eq('game_id', gameId),
        ),
        readRows(
          db
            .from('guesses')
            .select('user_id, seq, guess, colors, is_correct')
            .eq('game_id', gameId)
            .order('seq', { ascending: true }),
        ),
      ])
      if (!mounted()) return

      // A FAILED read and a MISSING game used to be one branch — a failure left
      // `data` null, so a dead connection rendered the game as not-found. The
      // fault is already logged and shown by `dbFetch`; all that is left here is
      // to stop loading rather than claim anything about the game.
      if (
        gameRes.type === 'not-ok' ||
        playersRes.type === 'not-ok' ||
        guessesRes.type === 'not-ok'
      ) {
        setLoading(false)
        return
      }

      // ZERO ROWS is the caller's to read: no game with that id, or one this
      // club cannot see.
      const row = gameRes.data[0]
      if (!row) {
        setGame(null)
        setPlayers([])
        setGuesses([])
        setLoading(false)
        return
      }

      setGame({
        id: row.id as string,
        mode: row.mode as 'coop' | 'compete',
        max_guesses: row.max_guesses as number,
        target: (row.target as string | null) ?? null,
      })
      setPlayers(playersRes.data as WordlePlayerState[])
      setGuesses(guessesRes.data as GuessRow[])
      setLoading(false)
    },
  })

  return { game, players, guesses, loading }
}
