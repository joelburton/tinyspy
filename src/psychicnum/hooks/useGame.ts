import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/useRealtimeRefetch'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/**
 * One player in a psychicnum game. Today psychicnum doesn't
 * add per-player state beyond what's on a Member, so the Player
 * type is a straight re-export — but every per-game folder
 * exposes a Player type so the cross-game vocabulary is
 * consistent (a reader scanning psychicnum code finds the same
 * Player parallel that exists in tinyspy + wordknit).
 */
export type Player = Member

/**
 * The FE-ready game state. Sourced from the
 * `psychicnum.games_state` view, which surfaces this game's
 * directly-readable columns plus the conditional `target`
 * reveal:
 *
 *   - While the game is non-terminal, the view returns
 *     `target = null`.
 *   - Once `common.games.is_terminal` flips true, the view
 *     returns the real value.
 *
 * `mode` is the gametype-level coop/compete declaration,
 * stored as a column on psychicnum.games so the FE can branch
 * without parsing the gametype string. Always present from
 * insert; never changes mid-game.
 *
 * `play_state` itself isn't on this row — it lives on
 * common.games and arrives via GamePageCtx.
 */
export type PsychicNumGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  /** The 1..10 secret. Null while non-terminal (gated by the
   *  view's helper function); the real value once terminal. */
  target: number | null
  created_at: string
}

/**
 * One row from `psychicnum.players` — per-player guess budget.
 *
 * In coop: every player row carries the same value (decremented
 * in lock-step). In compete: each row decrements independently
 * when its owner submits.
 *
 * Always visible to the whole club regardless of mode — the
 * "opponents see my remaining budget but not my guesses" rule
 * is enforced by giving this table club-wide RLS while
 * `psychicnum.guesses` gets user-scoped RLS in compete mode.
 */
export type PsychicNumPlayer = {
  user_id: string
  guesses_remaining: number
}

/**
 * One row from `psychicnum.guesses`. In coop the FE receives
 * every player's guess; in compete the RLS policy filters
 * server-side so the FE only ever receives its own user_id's
 * rows. PlayArea renders them the same way either way; the
 * filtering is invisible to the FE.
 */
export type PsychicNumGuess = {
  id: string
  user_id: string
  number: number
  was_correct: boolean
  guessed_at: string
}

/**
 * Per-gametype data hook for psychicnum (both modes share it).
 *
 * Reads three tables:
 *   - `games_state` view (game row + conditional `target` reveal)
 *   - `players` (per-player budgets, club-wide visible)
 *   - `guesses` (history log; RLS scopes to caller in compete)
 *
 * Subscribes to all three for realtime refetch via
 * `useRealtimeRefetch`. The factory provides SUBSCRIBED-refetch
 * + UUID-suffixed channel + cleanup; this hook owns the per-game
 * `load()` body.
 *
 * The cross-cutting machinery (members, presence, manual-pause,
 * timer) lives on `useCommonGame` inside `GamePage` — see
 * `src/common/hooks/useCommonGame.ts`.
 */
export function useGame(gameId: string): {
  game: PsychicNumGame | null
  players: PsychicNumPlayer[]
  guesses: PsychicNumGuess[]
  loading: boolean
} {
  const [game, setGame] = useState<PsychicNumGame | null>(null)
  const [players, setPlayers] = useState<PsychicNumPlayer[]>([])
  const [guesses, setGuesses] = useState<PsychicNumGuess[]>([])
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: [
      { schema: 'psychicnum', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'psychicnum', table: 'players', filter: `game_id=eq.${gameId}` },
      { schema: 'psychicnum', table: 'guesses', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'psychicnum',
    id: gameId,
    load: async ({ mounted }) => {
      const { data: gameData } = await db
        .from('games_state')
        .select('id, club_handle, mode, target, created_at')
        .eq('id', gameId)
        .maybeSingle()
      if (!mounted()) return

      if (!gameData) {
        setGame(null)
        setPlayers([])
        setGuesses([])
        setLoading(false)
        return
      }

      const [{ data: playerRows }, { data: guessRows }] = await Promise.all([
        db
          .from('players')
          .select('user_id, guesses_remaining')
          .eq('game_id', gameId),
        db
          .from('guesses')
          .select('id, user_id, number, was_correct, guessed_at')
          .eq('game_id', gameId)
          .order('guessed_at', { ascending: true }),
      ])
      if (!mounted()) return

      setGame({
        id: gameData.id as string,
        club_handle: gameData.club_handle as string,
        mode: gameData.mode as 'coop' | 'compete',
        target: gameData.target as number | null,
        created_at: gameData.created_at as string,
      })
      setPlayers((playerRows ?? []) as PsychicNumPlayer[])
      setGuesses((guessRows ?? []) as PsychicNumGuess[])
      setLoading(false)
    },
  })

  return { game, players, guesses, loading }
}
