import { useEffect, useState } from 'react'
import { supabase } from '../../common/lib/supabase'
import { channelDedupSuffix } from '../../common/lib/channelDedup'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/**
 * One player in a psychic-num game. Today psychic-num doesn't
 * add per-player state beyond what's on a Member, so the Player
 * type is a straight re-export — but every per-game folder
 * exposes a Player type so the cross-game vocabulary is
 * consistent (a reader scanning psychicnum code finds the same
 * Player parallel that exists in tinyspy + wordknit). Future
 * per-player state (a "you guessed it!" highlight, a personal
 * guess-budget if we ever split the shared pool, etc.) has a
 * named home to land in.
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
 * The reveal gate lives in SQL (a SECURITY DEFINER helper inside
 * the view's column expression — see the psychicnum baseline
 * migration). The FE doesn't issue a separate "reveal" call:
 * one SELECT from games_state gives the complete picture.
 *
 * Note that `play_state` itself isn't on this row — it lives on
 * common.games and arrives via GamePageCtx. PlayArea reads it
 * from the ctx alongside `isTerminal`.
 */
export type PsychicnumGame = {
  id: string
  club_id: string
  guesses_remaining: number
  winner_id: string | null
  /** The 1..10 secret. Null while non-terminal (gated by the
   *  view's helper function); the real value once terminal. */
  target: number | null
  created_at: string
}

export type PsychicnumGuess = {
  id: string
  user_id: string
  number: number
  was_correct: boolean
  guessed_at: string
}

/**
 * Psychic-num's per-gametype data hook — narrower than it used
 * to be. Owns the gametype-specific row + guesses log + its own
 * postgres-changes subscription on `psychicnum.{games,guesses}`.
 *
 * **One read per game-state refetch.** The hook reads from the
 * `psychicnum.games_state` view, which surfaces target
 * conditionally on status. No follow-up RPC for the reveal;
 * PlayArea reads `game.target` like any other field, and the
 * "secret-until-terminal" rule is enforced entirely server-side
 * inside the view.
 *
 * Why subscribe to the table, not the view: Supabase Realtime
 * watches tables. The asymmetry is intentional and contained
 * here: we subscribe to `psychicnum.games` for change events,
 * and re-read from `games_state` in response.
 *
 * The cross-cutting machinery (members, presence, manual-pause
 * broadcasts, timer, paused/missing/manuallyPausedBy) lives on
 * `useCommonGame` inside `GamePage` — see `src/common/hooks/
 * useCommonGame.ts`. PlayArea consumes both: this hook for the
 * game-specific surface, useCommonGame (indirectly, via GamePage)
 * for the chrome.
 *
 * Channel-name pattern (`psychicnum:${gameId}:${uuid}`): a per-tab
 * UUID suffix is intentional — this channel only carries
 * postgres-changes, which don't need a shared room across peers.
 * Per-tab channels avoid the supabase-js
 * "attach-all-.on()-before-.subscribe()" rule colliding with
 * `useCommonGame`'s channel for the same `gameId`.
 */
export function useGame(gameId: string): {
  game: PsychicnumGame | null
  guesses: PsychicnumGuess[]
  loading: boolean
} {
  const [game, setGame] = useState<PsychicnumGame | null>(null)
  const [guesses, setGuesses] = useState<PsychicnumGuess[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data: gameData } = await db
        .from('games_state')
        .select(
          'id, club_id, guesses_remaining, winner_id, target, created_at',
        )
        .eq('id', gameId)
        .maybeSingle()
      if (!mounted) return

      if (!gameData) {
        setGame(null)
        setGuesses([])
        setLoading(false)
        return
      }

      const { data: guessesData } = await db
        .from('guesses')
        .select('id, user_id, number, was_correct, guessed_at')
        .eq('game_id', gameId)
        .order('guessed_at', { ascending: true })
      if (!mounted) return

      setGame({
        id: gameData.id as string,
        club_id: gameData.club_id as string,
        guesses_remaining: gameData.guesses_remaining as number,
        winner_id: gameData.winner_id as string | null,
        target: gameData.target as number | null,
        created_at: gameData.created_at as string,
      })
      setGuesses((guessesData ?? []) as PsychicnumGuess[])
      setLoading(false)
    }

    const channel = supabase
      .channel(`psychicnum:${gameId}:${channelDedupSuffix()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'psychicnum',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        () => load(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'psychicnum',
          table: 'guesses',
          filter: `game_id=eq.${gameId}`,
        },
        () => load(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [gameId])

  return { game, guesses, loading }
}
