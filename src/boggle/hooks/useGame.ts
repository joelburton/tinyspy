import { useEffect, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/** One player in a boggle game. No per-player state beyond a Member today. */
export type Player = Member

/** A word the board ships to the FE — one entry of the legal list. `required`
 *  words are the goal/reveal set; `bonus` words are the extra legal-band finds.
 *  boggle has no hidden-solution view; the FE validates + scores guesses against
 *  required ∪ bonus locally, so both carry points. (No pangram concept in boggle.) */
export type BoggleWord = { word: string; points: number }

/** The boggle game header, read straight off `boggle.games`. Immutable for the
 *  life of the game (play state lives in common.games), so it loads once. */
export type BoggleGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  /** row-major raw-face board string (A–Z, multiface digit, 0 = blank) */
  board: string
  /** board side length (n × n) */
  n: number
  min_word_length: number
  required_words: BoggleWord[]
  /** Legal-band words traceable on the board but outside the required set (empty
   *  when legal_band == band). The FE accepts+scores these as bonus finds. */
  bonus_words: BoggleWord[]
  required_words_count: number
  required_words_score: number
}

export type FoundWordRow = {
  game_id: string
  user_id: string
  word: string
  points: number
  is_bonus: boolean
  found_at: string
}

/**
 * boggle's per-gametype data hook.
 *
 * Two data lifecycles, deliberately split (the board + word lists are the reason):
 *   - **The game header loads ONCE.** `boggle.games` is immutable for the life of
 *     the game — the board, the required list, and the (potentially large) bonus
 *     list never change; play state lives in `common.games`. So a one-shot fetch
 *     on mount, NOT a per-event refetch — otherwise every teammate submission
 *     would re-download the whole legal list.
 *   - **found_words refetches on realtime events** (Pattern A): every submission
 *     flows through `boggle.submit_word`, which writes a `found_words` row that
 *     propagates to peers via postgres-changes. This is the only thing that
 *     changes during play, so it's the only thing we re-pull.
 */
export function useGame(gameId: string): {
  game: BoggleGame | null
  foundWords: FoundWordRow[]
  loading: boolean
} {
  const [game, setGame] = useState<BoggleGame | null>(null)
  const [foundWords, setFoundWords] = useState<FoundWordRow[]>([])
  const [loading, setLoading] = useState(true)

  // The immutable header — fetched once per game. `loading` gates the PlayArea's
  // board render, so it flips here (the found_words load below just fills the list).
  useEffect(() => {
    let mounted = true
    void (async () => {
      const { data } = await db
        .from('games')
        .select(
          'id, club_handle, mode, board, n, min_word_length, required_words, bonus_words, required_words_count, required_words_score',
        )
        .eq('id', gameId)
        .maybeSingle()
      if (!mounted) return
      if (data) {
        setGame({
          id: data.id as string,
          club_handle: data.club_handle as string,
          mode: data.mode as 'coop' | 'compete',
          board: data.board as string,
          n: data.n as number,
          min_word_length: data.min_word_length as number,
          required_words: (data.required_words as BoggleWord[]) ?? [],
          bonus_words: (data.bonus_words as BoggleWord[]) ?? [],
          required_words_count: data.required_words_count as number,
          required_words_score: data.required_words_score as number,
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
      { schema: 'boggle', table: 'found_words', filter: `game_id=eq.${gameId}` },
      // The games row never changes mid-play (the header loads once above) —
      // this subscription exists for replay_board's realtime TOUCH: replay
      // only DELETEs found_words rows, and realtime filters don't reliably
      // match DELETE events, so the RPC's no-op games write is what wakes
      // every client to refetch the now-empty found list.
      { schema: 'boggle', table: 'games', filter: `id=eq.${gameId}` },
    ],
    channelPrefix: 'boggle',
    id: gameId,
    load: async ({ mounted }) => {
      const { data } = await db
        .from('found_words')
        .select('game_id, user_id, word, points, is_bonus, found_at')
        .eq('game_id', gameId)
        .order('found_at', { ascending: true })
      if (!mounted()) return
      setFoundWords((data ?? []) as FoundWordRow[])
    },
  })

  return { game, foundWords, loading }
}
