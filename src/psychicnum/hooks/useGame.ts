import { useEffect, useState } from 'react'
import { supabase } from '../../common/lib/supabase'
import { db as commonDb } from '../../common/db'
import { db } from '../db'

/**
 * Subset of psychicnum.games visible to authenticated SELECT.
 * `target` is intentionally absent — the column-level grant on the
 * table excludes it from authenticated reads (see the psychicnum
 * baseline migration). To learn the target once the game is over,
 * call the `reveal_target` RPC (which gates on terminal status).
 */
export type PsychicnumGame = {
  id: string
  club_id: string
  status: 'active' | 'won' | 'lost'
  guesses_remaining: number
  winner_id: string | null
  next_game_id: string | null
  created_at: string
}

export type PsychicnumGuess = {
  id: string
  user_id: string
  number: number
  was_correct: boolean
  guessed_at: string
}

export type ClubMember = {
  user_id: string
  username: string
}

/**
 * Load everything BoardScreen needs for a single game: the game
 * row, the append-only guesses log, and the club's members (used
 * both for rendering "<username> guessed N" lines and for the
 * ClubChatPanel which expects a members list).
 *
 * Realtime subscriptions cover the two psychicnum tables; on any
 * change we refetch the whole bundle. The game is small enough
 * (≤ 7 guesses, a handful of members) that a refetch is cheaper
 * to write than to thread partial updates through this hook.
 *
 * Follows the project's standard realtime patterns: a per-effect
 * unique channel name (so React StrictMode's double-mount doesn't
 * collide on channel names) and a refetch when the channel hits
 * `SUBSCRIBED` (recovers from any events missed between the
 * initial fetch and the subscription being live).
 */
export function useGame(gameId: string) {
  const [game, setGame] = useState<PsychicnumGame | null>(null)
  const [guesses, setGuesses] = useState<PsychicnumGuess[]>([])
  const [members, setMembers] = useState<ClubMember[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch + realtime-subscribe to the game row, guesses log, and
  // club roster. Re-runs only on gameId change; within a game,
  // realtime events on psychicnum.{games,guesses} drive load()
  // directly.
  useEffect(() => {
    let mounted = true

    async function load() {
      // Game row first — we need club_id from it to fetch members.
      const { data: gameData } = await db
        .from('games')
        .select(
          'id, club_id, status, guesses_remaining, winner_id, next_game_id, created_at',
        )
        .eq('id', gameId)
        .maybeSingle()
      if (!mounted) return

      if (!gameData) {
        setGame(null)
        setGuesses([])
        setMembers([])
        setLoading(false)
        return
      }

      // Run guesses + members in parallel — independent of each other.
      const [{ data: guessesData }, { data: memberRows }] = await Promise.all([
        db
          .from('guesses')
          .select('id, user_id, number, was_correct, guessed_at')
          .eq('game_id', gameId)
          .order('guessed_at', { ascending: true }),
        commonDb
          .from('club_members')
          .select('user_id')
          .eq('club_id', gameData.club_id),
      ])
      if (!mounted) return

      // Resolve member usernames via a second `common` fetch. We
      // can't do a single embed because PostgREST's schema cache
      // doesn't resolve cross-schema FKs (see docs/naming.md).
      let memberList: ClubMember[] = []
      const userIds = (memberRows ?? []).map((r) => r.user_id)
      if (userIds.length > 0) {
        const { data: profileData } = await commonDb
          .from('profiles')
          .select('user_id, username')
          .in('user_id', userIds)
        if (!mounted) return
        memberList = (profileData ?? []) as ClubMember[]
      }

      setGame(gameData as PsychicnumGame)
      setGuesses((guessesData ?? []) as PsychicnumGuess[])
      setMembers(memberList)
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`psychicnum:${gameId}:${crypto.randomUUID()}`)
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

  return { game, guesses, members, loading }
}
